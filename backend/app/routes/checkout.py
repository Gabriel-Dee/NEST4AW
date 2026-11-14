from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from app.auth import APIError
from app.db import get_conn
from app.roles import staff_or_admin
from app.rules import Item, Person, evaluate

router = APIRouter()


class CheckoutBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str


def _item(row) -> Item:
    return Item(
        sodium_mg=row["sodium_mg"],
        potassium_mg=row["potassium_mg"],
        phosphorus_mg=row["phosphorus_mg"],
        added_sugar_g=row["added_sugar_g"],
        carb_g=row["carb_g"],
        fiber_g=row["fiber_g"],
        gi=row["gi"],
        ingredients=row["ingredients"],
        allergen_tags=list(row["allergen_tags"] or []),
        is_drink=row["is_drink"],
        is_juice=row["is_juice"],
    )


@router.post("/checkout")
def checkout(
    body: CheckoutBody,
    request: Request,
    conn=Depends(get_conn),
    _user=Depends(staff_or_admin),
):
    rules = request.app.state.rules
    with conn.transaction():
        session = conn.execute(
            "SELECT * FROM sessions WHERE id = %s FOR UPDATE",
            (body.session_id,),
        ).fetchone()
        if session is None:
            raise APIError(404, "not_found", "unknown session")
        if session["status"] != "active":
            raise APIError(409, "session_not_active", "session is not active")
        lines = conn.execute(
            "SELECT product_id, qty FROM cart_lines WHERE session_id = %s FOR UPDATE",
            (body.session_id,),
        ).fetchall()
        person = Person(
            dm=session["dm"],
            htn=session["htn"],
            ckd34=session["ckd34"],
            k_limit_ordered=session["k_limit_ordered"],
            allergens=list(session["allergens"] or []),
        )
        loaded = []
        for line in lines:
            conn.execute(
                "SELECT id FROM products WHERE id = %s FOR UPDATE",
                (line["product_id"],),
            )
            product = conn.execute(
                """
                SELECT id, name, sodium_mg, potassium_mg, phosphorus_mg, added_sugar_g,
                       carb_g, fiber_g, gi, ingredients, allergen_tags, is_drink, is_juice
                FROM products WHERE id = %s
                """,
                (line["product_id"],),
            ).fetchone()
            result = evaluate(person, _item(product), rules)
            if result.verdict in ("red", "unknown"):
                raise APIError(409, "red_in_cart", "cart has a red or unknown item")
            conn.execute(
                """
                UPDATE cart_lines SET verdict = %s
                WHERE session_id = %s AND product_id = %s
                """,
                (result.verdict, body.session_id, line["product_id"]),
            )
            loaded.append((line, product))

        sold = []
        for line, product in loaded:
            remaining = line["qty"]
            lots = conn.execute(
                """
                SELECT id, grant_id, qty FROM lots
                WHERE product_id = %s AND qty > 0 AND expires_on > CURRENT_DATE
                ORDER BY arrived_on, expires_on, id
                FOR UPDATE
                """,
                (line["product_id"],),
            ).fetchall()
            for lot in lots:
                if remaining <= 0:
                    break
                take = min(remaining, lot["qty"])
                updated = conn.execute(
                    """
                    UPDATE lots SET qty = qty - %s
                    WHERE id = %s AND qty >= %s
                    RETURNING id
                    """,
                    (take, lot["id"], take),
                ).fetchone()
                if updated is None:
                    raise APIError(409, "out_of_stock", "not enough unexpired stock")
                conn.execute(
                    """
                    INSERT INTO checkout_ledger
                      (session_id, lot_id, product_id, grant_id, tier_id, qty)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        body.session_id,
                        lot["id"],
                        line["product_id"],
                        lot["grant_id"],
                        session["tier_id"],
                        take,
                    ),
                )
                sold.append(
                    {
                        "product_id": str(line["product_id"]),
                        "product_name": product["name"],
                        "qty": take,
                        "grant_id": lot["grant_id"],
                        "tier_id": session["tier_id"],
                    }
                )
                remaining -= take
            if remaining > 0:
                raise APIError(409, "out_of_stock", "not enough unexpired stock")
        conn.execute(
            "UPDATE sessions SET status = 'closed' WHERE id = %s",
            (body.session_id,),
        )
    return {"session_id": str(body.session_id), "status": "closed", "lines": sold}
