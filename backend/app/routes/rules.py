from fastapi import APIRouter, Depends

from app.db import get_conn
from app.phi import num
from app.roles import doctor_or_admin

router = APIRouter()


@router.get("/rules")
def list_rules(conn=Depends(get_conn), _user=Depends(doctor_or_admin)):
    rows = conn.execute(
        """
        SELECT rule_id, color, threshold, source, source_url, rd_confirm, note
        FROM rules
        ORDER BY rule_id
        """
    ).fetchall()
    return [
        {
            "rule_id": row["rule_id"],
            "color": row["color"],
            "threshold": num(row["threshold"]),
            "source": row["source"],
            "source_url": row["source_url"],
            "rd_confirm": row["rd_confirm"],
            "note": row["note"],
        }
        for row in rows
    ]
