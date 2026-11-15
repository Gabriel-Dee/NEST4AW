"""Mobile recipe contract. Session id is the credential; names never reach the model."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.concurrency import run_in_threadpool
from psycopg.types.json import Json
from pydantic import Field

from app.errors import APIError
from app.floor import active_session
from app.schemas import Strict
from app.services import recipes as recipe_service
from app.visits import resolve_visit_token, store_of_session
from seed.recipes import seed_library

router = APIRouter(prefix="/api/v1/recipes")


class SaveRecipe(Strict):
    session_id: UUID | None = None
    recipe_id: UUID


class CartRecipes(Strict):
    session_id: UUID | None = None
    cart_version: int | None = Field(default=None, ge=0)


def load_templates(conn):
    if conn.execute("SELECT count(*) AS n FROM recipes_library").fetchone()["n"] == 0:
        seed_library(conn)
    rows = conn.execute("SELECT * FROM recipes_library ORDER BY title").fetchall()
    grouped = {}
    for item in conn.execute(
        "SELECT * FROM recipe_library_ingredients ORDER BY recipe_id, sort_order"
    ):
        grouped.setdefault(item["recipe_id"], []).append(
            {
                "product_key": item["product_key"],
                "name": item["name"],
                "amount": item["amount"],
                "category": item["category"],
            }
        )
    return [
        {
            "slug": row["slug"],
            "title": row["title"],
            "description": row["description"],
            "time_min": row["time_min"],
            "difficulty": row["difficulty"],
            "tags": list(row["tags"]),
            "steps": list(row["steps"]),
            "pantry_staples": list(row["pantry_staples"]),
            "ingredients": grouped.get(row["id"], []),
        }
        for row in rows
    ]


def bundle(conn, session_id):
    person = active_session(conn, session_id)
    store_id = store_of_session(conn, session_id)
    products = conn.execute(
        """WITH stock AS (
            SELECT product_id, sum(qty) AS qty FROM lots
            WHERE expires_on>CURRENT_DATE
            AND (%s::uuid IS NULL OR store_id=%s)
            GROUP BY product_id HAVING sum(qty)>0
        )
        SELECT p.*, stock.qty AS stock, b.aisle, b.shelf, b.bin_code
        FROM stock JOIN products p ON p.id=stock.product_id
        LEFT JOIN LATERAL (
            SELECT aisle, shelf, bin_code FROM bins
            WHERE product_id=p.id ORDER BY bin_code LIMIT 1
        ) b ON true""",
        (store_id, store_id),
    ).fetchall()
    cart = {
        str(row["product_id"]): row["qty"]
        for row in conn.execute(
            "SELECT product_id,qty FROM cart_lines WHERE session_id=%s", (session_id,)
        )
    }
    return person, list(products), cart


def store_cards(conn, client_id, payload):
    for recipe in payload["recipes"]:
        conn.execute(
            """INSERT INTO recipe_cards (client_id,id,payload,source)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (client_id, id) DO UPDATE
            SET payload=EXCLUDED.payload, source=EXCLUDED.source""",
            (client_id, recipe["id"], Json(recipe), recipe["source"]),
        )


def cached(conn, key, client_id):
    row = conn.execute(
        """SELECT payload FROM recipe_cache
        WHERE cache_key=%s AND client_id=%s AND created_on=CURRENT_DATE""",
        (key, client_id),
    ).fetchone()
    return None if row is None else row["payload"]


def remember(conn, key, client_id, mode, payload):
    conn.execute(
        "DELETE FROM recipe_cache WHERE client_id=%s AND created_on<CURRENT_DATE", (client_id,)
    )
    conn.execute(
        """INSERT INTO recipe_cache (cache_key,client_id,mode,payload,created_on)
        VALUES (%s,%s,%s,%s,CURRENT_DATE)
        ON CONFLICT (cache_key) DO UPDATE SET payload=EXCLUDED.payload""",
        (key, client_id, mode, Json(payload)),
    )


def serve(app, session_id, mode):
    with app.state.pool.connection() as conn:
        person, products, cart = bundle(conn, session_id)
        templates = load_templates(conn)
        client_id = person["client_id"]
        resolved = recipe_service.normalize_mode(mode, cart)
        key = recipe_service.cache_key(
            client_id, resolved, person, products, cart, date.today().isoformat()
        )
        hit = cached(conn, key, client_id)
        if hit is not None:
            return hit
    payload = recipe_service.build_recipes(
        person, products, cart, mode, app.state.engine, templates, recipe_service.ollama_propose
    )
    with app.state.pool.connection() as conn:
        person, products, cart = bundle(conn, session_id)
        payload = recipe_service.rescreen(payload, person, products, app.state.engine)
        if not payload["recipes"]:
            payload = recipe_service.build_recipes(
                person, products, cart, mode, app.state.engine, templates, None
            )
        store_cards(conn, person["client_id"], payload)
        remember(conn, key, person["client_id"], payload["mode"], payload)
    return payload


@router.get("/for-me")
async def for_me(request: Request, session_id: UUID | None = Query(default=None)):
    session_id = await run_in_threadpool(resolve_session, request, session_id)
    return await run_in_threadpool(serve, request.app, session_id, "profile")


def resolve_session(request: Request, session_id: UUID | None) -> UUID:
    """Legacy callers pass session_id; the /api/v1 shopping contract sends X-Visit-Token."""
    if session_id is not None:
        return session_id
    token = request.headers.get("x-visit-token")
    if not token:
        raise APIError(401, "SESSION_INVALID", "visit token is required")
    with request.app.state.pool.connection() as conn:
        try:
            visit = resolve_visit_token(conn, token)
        except APIError as exc:
            raise APIError(401, "SESSION_INVALID", "visit token is not valid") from exc
    if visit["status"] != "active":
        raise APIError(409, "SESSION_INVALID", "visit is not active")
    return visit["id"]


@router.post("/from-cart")
async def from_cart(request: Request, body: CartRecipes | None = None):
    payload = body or CartRecipes()
    session_id = await run_in_threadpool(resolve_session, request, payload.session_id)
    return await run_in_threadpool(serve, request.app, session_id, "cart")


@router.post("/saved")
async def save_recipe(body: SaveRecipe, request: Request):
    session_id = await run_in_threadpool(resolve_session, request, body.session_id)

    def write():
        with request.app.state.pool.connection() as conn:
            person = active_session(conn, session_id)
            card = conn.execute(
                "SELECT payload FROM recipe_cards WHERE client_id=%s AND id=%s",
                (person["client_id"], body.recipe_id),
            ).fetchone()
            if card is None:
                raise APIError(404, "not_found", "recipe not found")
            inserted = conn.execute(
                """INSERT INTO saved_recipes (client_id,recipe_id,points)
                VALUES (%s,%s,1) ON CONFLICT DO NOTHING RETURNING points""",
                (person["client_id"], body.recipe_id),
            ).fetchone()
            total = conn.execute(
                "SELECT coalesce(sum(points),0) AS n FROM saved_recipes WHERE client_id=%s",
                (person["client_id"],),
            ).fetchone()["n"]
            return {
                "ok": True,
                "points": 1 if inserted else 0,
                "total_points": int(total),
                "recipe": card["payload"],
            }

    return await run_in_threadpool(write)


@router.get("/saved")
async def list_saved(request: Request, session_id: UUID | None = Query(default=None)):
    session_id = await run_in_threadpool(resolve_session, request, session_id)

    def read():
        with request.app.state.pool.connection() as conn:
            person = active_session(conn, session_id)
            rows = conn.execute(
                """SELECT c.payload FROM saved_recipes s
                JOIN recipe_cards c ON c.client_id=s.client_id AND c.id=s.recipe_id
                WHERE s.client_id=%s ORDER BY s.saved_at, s.recipe_id""",
                (person["client_id"],),
            ).fetchall()
            return [row["payload"] for row in rows]

    return await run_in_threadpool(read)


@router.delete("/saved/{recipe_id}")
async def delete_saved(recipe_id: UUID, request: Request, session_id: UUID | None = Query(default=None)):
    session_id = await run_in_threadpool(resolve_session, request, session_id)

    def remove():
        with request.app.state.pool.connection() as conn:
            person = active_session(conn, session_id)
            deleted = conn.execute(
                "DELETE FROM saved_recipes WHERE client_id=%s AND recipe_id=%s RETURNING recipe_id",
                (person["client_id"], recipe_id),
            ).fetchone()
            if deleted is None:
                raise APIError(404, "not_found", "recipe not found")
            return {"ok": True}

    return await run_in_threadpool(remove)


@router.get("/{recipe_id}")
async def recipe_detail(recipe_id: UUID, request: Request, session_id: UUID | None = Query(default=None)):
    session_id = await run_in_threadpool(resolve_session, request, session_id)

    def read():
        with request.app.state.pool.connection() as conn:
            person = active_session(conn, session_id)
            card = conn.execute(
                "SELECT payload FROM recipe_cards WHERE client_id=%s AND id=%s",
                (person["client_id"], recipe_id),
            ).fetchone()
            if card is None:
                raise APIError(404, "not_found", "recipe not found")
            return card["payload"]

    return await run_in_threadpool(read)
