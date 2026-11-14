from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from app.auth import APIError
from app.db import get_conn
from app.phi import num
from app.rules import Item, Person, evaluate

router = APIRouter()


class LineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    product_id: str


def _active_session(conn, session_id):
    row = conn.execute(
        """
        SELECT id, status, dm, htn, ckd34, k_limit_ordered, allergens
        FROM sessions WHERE id = %s
        """,
        (session_id,),
    ).fetchone()
    if row is None:
        raise APIError(404, "not_found", "unknown session")
    if row["status"] != "active":
        raise APIError(409, "session_not_active", "session is not active")
    return row


def _line(conn, session_id, product_id):
    return conn.execute(
        """
        SELECT c.product_id, p.name, c.qty, c.verdict, p.sodium_mg,
               b.aisle, b.shelf, b.bin_code
        FROM cart_lines c
        JOIN products p ON p.id = c.product_id
        LEFT JOIN LATERAL (
          SELECT aisle, shelf, bin_code FROM bins
          WHERE product_id = p.id ORDER BY bin_code LIMIT 1
        ) b ON true
        WHERE c.session_id = %s AND c.product_id = %s
        """,
        (session_id, product_id),
    ).fetchone()


def line_public(row) -> dict:
    return {
        "product_id": str(row["product_id"]),
        "name": row["name"],
        "qty": row["qty"],
        "verdict": row["verdict"],
        "sodium_mg": num(row["sodium_mg"]),
        "aisle": row["aisle"],
        "shelf": row["shelf"],
        "bin_code": row["bin_code"],
    }


@router.get("/cart")
def get_cart(session_id: str, conn=Depends(get_conn)):
    _active_session(conn, session_id)
    rows = conn.execute(
        """
        SELECT c.product_id, p.name, c.qty, c.verdict, p.sodium_mg,
               b.aisle, b.shelf, b.bin_code
        FROM cart_lines c
        JOIN products p ON p.id = c.product_id
        LEFT JOIN LATERAL (
          SELECT aisle, shelf, bin_code FROM bins
          WHERE product_id = p.id ORDER BY bin_code LIMIT 1
        ) b ON true
        WHERE c.session_id = %s
        ORDER BY c.id
        """,
        (session_id,),
    ).fetchall()
    return {"lines": [line_public(row) for row in rows]}


@router.post("/cart/lines")
def add_line(body: LineBody, request: Request, conn=Depends(get_conn)):
    session = _active_session(conn, body.session_id)
    product = conn.execute(
        """
        SELECT id, sodium_mg, potassium_mg, phosphorus_mg, added_sugar_g, carb_g,
               fiber_g, gi, ingredients, allergen_tags, is_drink, is_juice
        FROM products WHERE id = %s
        """,
        (body.product_id,),
    ).fetchone()
    if product is None:
        raise APIError(404, "not_found", "unknown product")
    person = Person(
        dm=session["dm"],
        htn=session["htn"],
        ckd34=session["ckd34"],
        k_limit_ordered=session["k_limit_ordered"],
        allergens=list(session["allergens"] or []),
    )
    item = Item(
        sodium_mg=product["sodium_mg"],
        potassium_mg=product["potassium_mg"],
        phosphorus_mg=product["phosphorus_mg"],
        added_sugar_g=product["added_sugar_g"],
        carb_g=product["carb_g"],
        fiber_g=product["fiber_g"],
        gi=product["gi"],
        ingredients=product["ingredients"],
        allergen_tags=list(product["allergen_tags"] or []),
        is_drink=product["is_drink"],
        is_juice=product["is_juice"],
    )
    result = evaluate(person, item, request.app.state.rules)
    if result.verdict in ("red", "unknown"):
        raise APIError(409, "not_eligible", "item is not eligible")
    with conn.transaction():
        existing = conn.execute(
            """
            SELECT id FROM cart_lines
            WHERE session_id = %s AND product_id = %s
            FOR UPDATE
            """,
            (body.session_id, body.product_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE cart_lines SET qty = qty + 1, verdict = %s WHERE id = %s",
                (result.verdict, existing["id"]),
            )
        else:
            conn.execute(
                """
                INSERT INTO cart_lines (session_id, product_id, qty, verdict)
                VALUES (%s, %s, 1, %s)
                """,
                (body.session_id, body.product_id, result.verdict),
            )
    return line_public(_line(conn, body.session_id, body.product_id))


@router.delete("/cart/lines/{product_id}")
def delete_line(product_id: str, session_id: str, conn=Depends(get_conn)):
    _active_session(conn, session_id)
    conn.execute(
        "DELETE FROM cart_lines WHERE session_id = %s AND product_id = %s",
        (session_id, product_id),
    )
    return {"ok": True}
