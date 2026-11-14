from fastapi import APIRouter, Depends

from app.auth import APIError
from app.db import get_conn
from app.phi import fetch_clients, iso, profile_public
from app.roles import client_only

router = APIRouter()


@router.get("/me/profile")
def profile(user=Depends(client_only), conn=Depends(get_conn)):
    rows = fetch_clients(conn, user_id=user["id"])
    if not rows:
        raise APIError(404, "not_found", "unknown client")
    return profile_public(rows[0])


@router.get("/me/visits")
def visits(user=Depends(client_only), conn=Depends(get_conn)):
    rows = conn.execute(
        """
        SELECT p.name AS product_name, l.grant_id, l.tier_id, l.qty, l.sold_at
        FROM checkout_ledger l
        JOIN products p ON p.id = l.product_id
        JOIN sessions s ON s.id = l.session_id
        JOIN clients c ON c.id = s.client_id
        WHERE c.user_id = %s
        ORDER BY l.sold_at DESC, l.id
        """,
        (user["id"],),
    ).fetchall()
    return [
        {
            "product_name": row["product_name"],
            "grant_id": row["grant_id"],
            "tier_id": row["tier_id"],
            "qty": row["qty"],
            "sold_at": iso(row["sold_at"]),
        }
        for row in rows
    ]
