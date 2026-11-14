from fastapi import APIRouter, Depends

from app.db import connection

router = APIRouter()


@router.get("/health")
def health(conn=Depends(connection, scope="function")):
    conn.execute("SELECT 1")
    return {"ok": True}
