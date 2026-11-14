from datetime import date, timedelta

from fastapi import APIRouter, Depends

from app.auth import APIError
from app.db import get_conn
from app.phi import iso
from app.roles import staff_or_admin

router = APIRouter()


@router.get("/lots")
def lots(product_id: str, conn=Depends(get_conn), _user=Depends(staff_or_admin)):
    found = conn.execute("SELECT id FROM products WHERE id = %s", (product_id,)).fetchone()
    if found is None:
        raise APIError(404, "not_found", "unknown product")
    rows = conn.execute(
        """
        SELECT id, expires_on, qty, grant_id
        FROM lots
        WHERE product_id = %s
        ORDER BY expires_on, id
        """,
        (product_id,),
    ).fetchall()
    today = date.today()
    soon = today + timedelta(days=7)
    return [
        {
            "id": str(row["id"]),
            "expires_on": iso(row["expires_on"]),
            "qty": row["qty"],
            "soon_to_expire": today < row["expires_on"] <= soon,
            "grant_id": row["grant_id"],
        }
        for row in rows
    ]
