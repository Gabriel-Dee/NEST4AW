"""Shopping routes the mobile and web apps call under /api/v1.

Colors come from the rules engine. Substitutes and explanations here are the
deterministic fallback: same-category in-stock green items, and the engine's reason.
"""

import re
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.contract import cart_outcome, cart_version, code_variants, key_nutrients, status_for
from app.db import connect, connection
from app.errors import APIError
from app.floor import active_session, product
from app.routes.warehouse import checkout
from app.schemas import CartItem, CartQty, CheckoutCodes, ScanCode, SessionBody
from app.services.nutrition import off_lookup
from app.visits import resolve_visit_token
from seed.load import insert_product

router = APIRouter(prefix="/api/v1")

OFF_COLUMNS = (
    "name",
    "barcode",
    "internal_code",
    "brand",
    "serving_text",
    "serving_g",
    "sodium_mg",
    "potassium_mg",
    "phosphorus_mg",
    "added_sugar_g",
    "carb_g",
    "fiber_g",
    "ingredients",
    "category",
    "is_drink",
    "is_juice",
    "allergen_tags",
    "off_code",
    "source",
    "source_url",
    "calories_kcal",
    "protein_g",
    "fat_g",
    "sugar_g",
)


def open_visit(conn, raw: str | None):
    if not raw:
        raise APIError(401, "SESSION_INVALID", "visit token is required")
    try:
        visit = resolve_visit_token(conn, raw)
    except APIError as exc:
        raise APIError(401, "SESSION_INVALID", "visit token is not valid") from exc
    if visit["status"] != "active":
        raise APIError(409, "SESSION_INVALID", "visit is not active")
    try:
        person = active_session(conn, visit["id"])
    except APIError as exc:
        raise APIError(409, "SESSION_INVALID", "visit is not active") from exc
    return visit, person


def public_product(row) -> dict:
    stock = int(row.get("store_stock", row.get("stock") or 0))
    return {
        "id": str(row["id"]),
        "sku": row.get("internal_code"),
        "barcode": row.get("barcode"),
        "plu": None,
        "name": row["name"],
        "brand": row.get("brand"),
        "category": row.get("category"),
        "serving_size": None if row.get("serving_g") is None else float(row["serving_g"]),
        "serving_unit": "g",
        "calories": None if row.get("calories_kcal") is None else float(row["calories_kcal"]),
        "carbs_g": None if row.get("carb_g") is None else float(row["carb_g"]),
        "sugar_g": None if row.get("sugar_g") is None else float(row["sugar_g"]),
        "added_sugar_g": None if row.get("added_sugar_g") is None else float(row["added_sugar_g"]),
        "fiber_g": None if row.get("fiber_g") is None else float(row["fiber_g"]),
        "protein_g": None if row.get("protein_g") is None else float(row["protein_g"]),
        "fat_g": None if row.get("fat_g") is None else float(row["fat_g"]),
        "sodium_mg": None if row.get("sodium_mg") is None else float(row["sodium_mg"]),
        "potassium_mg": None if row.get("potassium_mg") is None else float(row["potassium_mg"]),
        "phosphorus_mg": None if row.get("phosphorus_mg") is None else float(row["phosphorus_mg"]),
        "allergens": list(row.get("allergen_tags") or []),
        "in_stock": stock > 0,
    }


def location_of(row) -> dict | None:
    if row.get("aisle") is None and row.get("shelf") is None and row.get("bin_code") is None:
        return None
    return {"aisle": row.get("aisle"), "shelf": row.get("shelf"), "bin": row.get("bin_code")}


def attach_stock(conn, row, store_id):
    found = product(conn, pid=row["id"], store_id=store_id)
    merged = dict(row)
    if found is None:
        merged["store_stock"] = 0
        return merged
    merged["store_stock"] = int(found["stock"])
    merged["aisle"] = found["aisle"]
    merged["shelf"] = found["shelf"]
    merged["bin_code"] = found["bin_code"]
    return merged


def lookup(conn, code: str, store_id):
    unverified = False
    row = None
    for variant in code_variants(code):
        row = product(conn, barcode=variant, internal_code=variant)
        if row:
            break
    digits = re.sub(r"\D", "", code)
    if row is None and re.fullmatch(r"\d{8,14}", digits):
        imported = import_off(conn, digits)
        if imported is not None:
            new_id, unverified = imported
            row = product(conn, pid=new_id)
    if row is None:
        return None, False
    return attach_stock(conn, row, store_id), unverified


def import_off(conn, barcode: str):
    try:
        raw = off_lookup(barcode)
    except Exception:
        return None
    if not raw or not raw.get("name"):
        return None
    food = {key: raw.get(key) for key in OFF_COLUMNS}
    food["barcode"] = barcode
    food["internal_code"] = barcode
    food["off_code"] = barcode
    food["category"] = raw.get("category") or "packaged"
    food["source"] = raw.get("source") or "Open Food Facts contributors, ODbL 1.0"
    food["is_drink"] = bool(raw.get("is_drink"))
    food["is_juice"] = bool(raw.get("is_juice"))
    food["allergen_tags"] = list(raw.get("allergen_tags") or [])
    kept = {
        key: value
        for key, value in food.items()
        if value is not None or key in ("is_drink", "is_juice")
    }
    existing = conn.execute(
        "SELECT id FROM products WHERE barcode=%s OR internal_code=%s",
        (barcode, barcode),
    ).fetchone()
    if existing:
        return existing["id"], False
    try:
        with conn.transaction():
            new_id = insert_product(conn, kept)
    except Exception:
        return None
    if new_id is None:
        return None
    return new_id, True


def alternatives(conn, engine, person, food, store_id) -> list[dict]:
    if not food.get("category"):
        return []
    rows = conn.execute(
        """SELECT id FROM products WHERE category=%s AND id<>%s
        AND EXISTS (SELECT 1 FROM lots l WHERE l.product_id=products.id AND l.qty>0
          AND l.expires_on>CURRENT_DATE AND (%s::uuid IS NULL OR l.store_id=%s))
        ORDER BY name LIMIT 20""",
        (food["category"], food["id"], store_id, store_id),
    ).fetchall()
    found = []
    for row in rows:
        candidate = product(conn, pid=row["id"], store_id=store_id)
        if candidate is None:
            continue
        status = status_for(engine.evaluate(person, candidate))
        if status["level"] != "green":
            continue
        found.append(
            {
                "product": public_product(attach_stock(conn, candidate, store_id)),
                "status": status,
                "why": "Same category and a great choice in stock",
            }
        )
        if len(found) == 2:
            break
    return found


def goes_great_in(conn, food) -> list[dict]:
    keys = [
        value
        for value in (food.get("barcode"), food.get("internal_code"), food.get("name"))
        if value
    ]
    if not keys:
        return []
    rows = conn.execute(
        """SELECT DISTINCT r.id, r.title FROM recipes_library r
        JOIN recipe_library_ingredients i ON i.recipe_id=r.id
        WHERE i.product_key = ANY(%s) ORDER BY r.title LIMIT 3""",
        (keys,),
    ).fetchall()
    return [{"recipe_id": str(row["id"]), "title": row["title"]} for row in rows]


def evaluate_food(engine, person, food, unverified: bool) -> dict:
    return status_for(engine.evaluate(person, food), unverified=unverified)


def scan_body(conn, engine, person, food, unverified: bool, store_id) -> dict:
    status = evaluate_food(engine, person, food, unverified)
    swaps = (
        alternatives(conn, engine, person, food, store_id)
        if status["level"] in ("yellow", "red")
        else []
    )
    return {
        "product": public_product(food),
        "status": status,
        "key_nutrients": key_nutrients(food, status),
        "in_stock": int(food.get("store_stock") or 0) > 0,
        "location": location_of(food),
        "alternatives": swaps,
        "explanation": status["reason"],
        "goes_great_in": goes_great_in(conn, food),
    }


def cart_payload(conn, engine, person, session_id, store_id) -> dict:
    rows = conn.execute(
        """SELECT c.product_id, c.qty FROM cart_lines c
        WHERE c.session_id=%s ORDER BY c.product_id""",
        (session_id,),
    ).fetchall()
    items = []
    totals = {
        "sodium_mg": 0.0,
        "sugar_g": 0.0,
        "potassium_mg": 0.0,
        "phosphorus_mg": 0.0,
        "calories": 0.0,
        "carbs_g": 0.0,
    }
    counts = {"green": 0, "yellow": 0, "red": 0}
    points = 0
    for line in rows:
        food = product(conn, pid=line["product_id"])
        if food is None:
            continue
        food = attach_stock(conn, food, store_id)
        status = evaluate_food(engine, person, food, False)
        qty = int(line["qty"])
        items.append({"product": public_product(food), "status": status, "qty": qty})
        counts[status["level"]] = counts.get(status["level"], 0) + qty
        if status["level"] == "green":
            points += qty
        for key, field in (
            ("sodium_mg", "sodium_mg"),
            ("sugar_g", "sugar_g"),
            ("potassium_mg", "potassium_mg"),
            ("phosphorus_mg", "phosphorus_mg"),
            ("calories", "calories_kcal"),
            ("carbs_g", "carb_g"),
        ):
            value = food.get(field)
            if value is not None:
                totals[key] += float(value) * qty
    return {
        "items": items,
        "summary": {**counts, "total_items": sum(item["qty"] for item in items)},
        "nutrient_totals": totals,
        "points": points,
        "cart_version": cart_version(items),
    }


def write_qty(conn, session_id, product_id, qty: int, level: str) -> None:
    if qty <= 0:
        conn.execute(
            "DELETE FROM cart_lines WHERE session_id=%s AND product_id=%s",
            (session_id, product_id),
        )
        return
    conn.execute(
        """INSERT INTO cart_lines(session_id,product_id,qty,verdict) VALUES(%s,%s,%s,%s)
        ON CONFLICT(session_id,product_id) DO UPDATE SET qty=excluded.qty, verdict=excluded.verdict""",
        (session_id, product_id, qty, level),
    )


def apply_qty(conn, engine, person, visit, product_id: UUID, resulting: int):
    food = product(conn, pid=product_id)
    if food is None:
        raise APIError(404, "PRODUCT_NOT_FOUND", "Ask a volunteer")
    food = attach_stock(conn, food, visit["store_id"])
    status = evaluate_food(engine, person, food, False)
    outcome = cart_outcome(
        status["level"], resulting, int(food.get("store_stock") or 0), status["limit_qty"]
    )
    if outcome == "red":
        raise APIError(
            409,
            "RED_RESTRICTED",
            "Not for you today",
            alternatives=alternatives(conn, engine, person, food, visit["store_id"]),
        )
    if outcome == "over":
        raise APIError(422, "OVER_LIMIT", status["label"])
    if outcome == "stock":
        raise APIError(409, "out_of_stock", "not enough unexpired stock")
    write_qty(conn, visit["id"], product_id, resulting, status["level"])
    return cart_payload(conn, engine, person, visit["id"], visit["store_id"])


def scanned_items(conn, engine, person, visit, codes: list[str]):
    grouped: dict = {}
    order = []
    for code in codes:
        if len(code) > 100:
            raise APIError(422, "VALIDATION_ERROR", "request fields are invalid")
        food, unverified = lookup(conn, code, visit["store_id"])
        if food is None:
            raise APIError(404, "PRODUCT_NOT_FOUND", "Ask a volunteer")
        status = evaluate_food(engine, person, food, unverified)
        key = food["id"]
        if key not in grouped:
            order.append(key)
            grouped[key] = {"food": food, "status": status, "qty": 0}
        grouped[key]["qty"] += 1
    for item in grouped.values():
        limit = item["status"]["limit_qty"]
        blocked_label = item["status"]["label"] == "Ask a volunteer"
        item["blocked"] = item["status"]["level"] == "red" or blocked_label
        if limit is not None and item["qty"] > limit:
            item["blocked"] = True
    blocked = [grouped[key] for key in order if grouped[key]["blocked"]]
    if blocked:
        raise APIError(
            409,
            "CHECKOUT_BLOCKED",
            "Not for you today",
            blocked_items=[
                {
                    "product": public_product(item["food"]),
                    "status": item["status"],
                    "alternatives": alternatives(
                        conn, engine, person, item["food"], visit["store_id"]
                    ),
                }
                for item in blocked
            ],
        )
    return [grouped[key] for key in order]


@router.get("/health")
def health_detail():
    db = "ok"
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
    except Exception:
        db = "down"
    return {"db": db, "ai": "fallback", "embeddings": "not_configured"}


@router.post("/scan")
def scan(body: ScanCode, request: Request, conn=Depends(connection, scope="function")):
    visit, person = open_visit(conn, request.headers.get("x-visit-token"))
    food, unverified = lookup(conn, body.code, visit["store_id"])
    if food is None:
        raise APIError(404, "PRODUCT_NOT_FOUND", "Ask a volunteer")
    return scan_body(conn, request.app.state.engine, person, food, unverified, visit["store_id"])


@router.get("/cart")
def cart(request: Request, conn=Depends(connection, scope="function")):
    visit, person = open_visit(conn, request.headers.get("x-visit-token"))
    return cart_payload(conn, request.app.state.engine, person, visit["id"], visit["store_id"])


@router.post("/cart/items")
def add_item(body: CartItem, request: Request, conn=Depends(connection, scope="function")):
    visit, person = open_visit(conn, request.headers.get("x-visit-token"))
    current = conn.execute(
        "SELECT qty FROM cart_lines WHERE session_id=%s AND product_id=%s",
        (visit["id"], body.product_id),
    ).fetchone()
    resulting = int(current["qty"] if current else 0) + body.qty
    return apply_qty(conn, request.app.state.engine, person, visit, body.product_id, resulting)


@router.patch("/cart/items/{product_id}")
def set_item(
    product_id: UUID, body: CartQty, request: Request, conn=Depends(connection, scope="function")
):
    visit, person = open_visit(conn, request.headers.get("x-visit-token"))
    return apply_qty(conn, request.app.state.engine, person, visit, product_id, body.qty)


@router.delete("/cart/items/{product_id}")
def delete_item(product_id: UUID, request: Request, conn=Depends(connection, scope="function")):
    visit, person = open_visit(conn, request.headers.get("x-visit-token"))
    write_qty(conn, visit["id"], product_id, 0, "green")
    return cart_payload(conn, request.app.state.engine, person, visit["id"], visit["store_id"])


@router.get("/recommendations")
def recommendations(request: Request, conn=Depends(connection, scope="function")):
    visit, person = open_visit(conn, request.headers.get("x-visit-token"))
    rows = conn.execute(
        """SELECT id FROM products WHERE EXISTS (
            SELECT 1 FROM lots l WHERE l.product_id=products.id AND l.qty>0
            AND l.expires_on>CURRENT_DATE AND l.store_id=%s)
        ORDER BY name LIMIT 80""",
        (visit["store_id"],),
    ).fetchall()
    picks = []
    household = int(person.get("household_size") or 1)
    for row in rows:
        food = product(conn, pid=row["id"], store_id=visit["store_id"])
        if food is None:
            continue
        food = attach_stock(conn, food, visit["store_id"])
        status = evaluate_food(request.app.state.engine, person, food, False)
        if status["level"] == "red":
            continue
        picks.append(
            {
                "product": public_product(food),
                "status": status,
                "why": status["reason"],
                "suggested_quantity": 1 if status["level"] == "yellow" else household,
                "use_soon": bool(food.get("soon_to_expire")),
            }
        )
    picks.sort(key=lambda item: (item["status"]["level"] != "green", not item["use_soon"]))
    return {"source": "fallback", "items": picks[:12]}


@router.post("/checkout/{visit_token}/validate")
def validate_checkout(
    visit_token: str,
    body: CheckoutCodes,
    request: Request,
    conn=Depends(connection, scope="function"),
):
    visit, person = open_visit(conn, visit_token)
    items = scanned_items(conn, request.app.state.engine, person, visit, body.codes)
    cart_ids = {
        row["product_id"]
        for row in conn.execute(
            "SELECT product_id FROM cart_lines WHERE session_id=%s", (visit["id"],)
        )
    }
    scanned_ids = {item["food"]["id"] for item in items}
    pounds = 0.0
    for item in items:
        serving = item["food"].get("serving_g")
        if serving is not None:
            pounds += float(serving) * item["qty"] / 453.59237
    return {
        "ok": True,
        "items": [
            {
                "product": public_product(item["food"]),
                "status": item["status"],
                "qty": item["qty"],
            }
            for item in items
        ],
        "mismatches": {
            "not_in_app_cart": [str(item) for item in scanned_ids - cart_ids],
            "in_app_not_scanned": [str(item) for item in cart_ids - scanned_ids],
        },
        "total_lb": round(pounds, 2),
    }


@router.post("/checkout/{visit_token}/complete")
def complete_checkout(
    visit_token: str,
    body: CheckoutCodes,
    request: Request,
    conn=Depends(connection, scope="function"),
):
    visit, person = open_visit(conn, visit_token)
    items = scanned_items(conn, request.app.state.engine, person, visit, body.codes)
    conn.execute("DELETE FROM cart_lines WHERE session_id=%s", (visit["id"],))
    for item in items:
        write_qty(conn, visit["id"], item["food"]["id"], item["qty"], item["status"]["level"])
    try:
        result = checkout(SessionBody(session_id=visit["id"]), request, "summary", conn)
    except APIError:
        raise
    return {"ok": True, "source": "record", "ledger": result}
