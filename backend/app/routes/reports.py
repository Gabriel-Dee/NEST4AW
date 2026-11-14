from datetime import date

from fastapi import APIRouter, Depends, Query

from app.auth import APIError
from app.db import get_conn
from app.phi import iso, num
from app.roles import partner_or_admin

router = APIRouter()


@router.get("/reports/dispensed")
def dispensed(
    day_from: date = Query(alias="from"),
    day_to: date = Query(alias="to"),
    conn=Depends(get_conn),
    _user=Depends(partner_or_admin),
):
    if day_from > day_to:
        raise APIError(422, "bad_input", "from is after to")
    rows = conn.execute(
        """
        SELECT day, tier_id, grant_id, units, pounds
        FROM analytics_public
        WHERE day >= %s AND day <= %s
        ORDER BY day, tier_id, grant_id
        """,
        (day_from, day_to),
    ).fetchall()
    return [
        {
            "day": iso(row["day"]),
            "tier_id": row["tier_id"],
            "grant_id": row["grant_id"],
            "units": int(row["units"]) if row["units"] is not None else 0,
            "pounds": num(row["pounds"]),
        }
        for row in rows
    ]
