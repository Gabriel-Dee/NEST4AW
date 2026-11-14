from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from app.auth import APIError
from app.db import get_conn
from app.phi import num
from app.rules import Item, Person, evaluate

router = APIRouter()


class ScanBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    barcode: str | None = None
    internal_code: str | None = None


def _session(conn, session_id):
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


def _product(conn, barcode, internal_code):
    return conn.execute(
        """
        SELECT p.id, p.name, p.sodium_mg, p.potassium_mg, p.phosphorus_mg,
               p.added_sugar_g, p.carb_g, p.fiber_g, p.gi, p.ingredients,
               p.allergen_tags, p.is_drink, p.is_juice,
               b.aisle, b.shelf, b.bin_code,
               EXISTS (
                 SELECT 1 FROM lots l
                 WHERE l.product_id = p.id
                   AND l.expires_on > CURRENT_DATE
                   AND l.expires_on <= CURRENT_DATE + 7
               ) AS soon_to_expire
        FROM products p
        LEFT JOIN LATERAL (
          SELECT aisle, shelf, bin_code FROM bins
          WHERE product_id = p.id
          ORDER BY bin_code
          LIMIT 1
        ) b ON true
        WHERE (%s::text IS NOT NULL AND p.barcode = %s)
           OR (%s::text IS NOT NULL AND p.internal_code = %s)
        LIMIT 1
        """,
        (barcode, barcode, internal_code, internal_code),
    ).fetchone()


def product_public(row) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "sodium_mg": num(row["sodium_mg"]),
        "potassium_mg": num(row["potassium_mg"]),
        "phosphorus_mg": num(row["phosphorus_mg"]),
        "added_sugar_g": num(row["added_sugar_g"]),
        "carb_g": num(row["carb_g"]),
        "fiber_g": num(row["fiber_g"]),
        "aisle": row["aisle"],
        "shelf": row["shelf"],
        "bin_code": row["bin_code"],
        "soon_to_expire": bool(row["soon_to_expire"]),
    }


@router.post("/scan")
def scan(body: ScanBody, request: Request, conn=Depends(get_conn)):
    if not body.barcode and not body.internal_code:
        raise APIError(422, "bad_input", "barcode or internal_code is required")
    session = _session(conn, body.session_id)
    person = Person(
        dm=session["dm"],
        htn=session["htn"],
        ckd34=session["ckd34"],
        k_limit_ordered=session["k_limit_ordered"],
        allergens=list(session["allergens"] or []),
    )
    row = _product(conn, body.barcode, body.internal_code)
    if row is None:
        return {
            "verdict": "unknown",
            "reasons": [],
            "product": None,
            "fiber_rank_bonus": False,
        }
    item = Item(
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
    result = evaluate(person, item, request.app.state.rules)
    return {
        "verdict": result.verdict,
        "reasons": [
            {"rule_id": vote.rule_id, "source": vote.source} for vote in result.reasons
        ],
        "product": product_public(row),
        "fiber_rank_bonus": result.fiber_rank_bonus,
    }
