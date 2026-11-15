import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import Field, model_validator

from app.auth import require_role
from app.db import connection
from app.errors import APIError
from app.schemas import Strict
from app.services.nutrition import fdc_detail, fdc_search, off_lookup
from seed.load import insert_product

router = APIRouter(dependencies=[Depends(require_role("doctor", "warehouse_staff", "admin"))])


class ImportProduct(Strict):
    barcode: str | None = Field(default=None, pattern=r"^\d{8,14}$")
    fdc_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def one_source(self):
        if bool(self.barcode) == bool(self.fdc_id):
            raise ValueError("supply one source identifier")
        return self


@router.get("/products")
def catalog(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    conn=Depends(connection, scope="function"),
):
    return conn.execute(
        """SELECT p.*,coalesce((SELECT sum(qty) FROM lots WHERE product_id=p.id
        AND expires_on>CURRENT_DATE),0) AS stock FROM products p WHERE position(lower(%s) in lower(name))>0
        ORDER BY name,id LIMIT %s""",
        (q, limit),
    ).fetchall()


@router.get("/products/search-external")
def search_external(q: str = Query(min_length=2, max_length=100)):
    from app.config import settings

    if not settings().fdc_api_key:
        raise APIError(503, "nutrition_unavailable", "FDC_API_KEY is not configured")
    try:
        hits = fdc_search(q)
        return [
            {"fdc_id": h["fdcId"], "name": h.get("description"), "data_type": h.get("dataType")}
            for h in hits
        ]
    except (httpx.HTTPError, ValueError, KeyError):
        raise APIError(503, "nutrition_unavailable", "nutrition source unavailable") from None


@router.post(
    "/products/import",
    status_code=201,
    dependencies=[Depends(require_role("warehouse_staff", "admin"))],
)
def import_product(body: ImportProduct, conn=Depends(connection, scope="function")):
    try:
        if body.fdc_id:
            from app.config import settings

            if not settings().fdc_api_key:
                raise APIError(503, "nutrition_unavailable", "FDC_API_KEY is not configured")
        food = off_lookup(body.barcode) if body.barcode else fdc_detail(body.fdc_id)
    except (httpx.HTTPError, ValueError, KeyError):
        raise APIError(503, "nutrition_unavailable", "nutrition source unavailable") from None
    if not food:
        raise APIError(404, "not_found", "product not found at source")
    pid = insert_product(conn, food)
    # Conflict leaves existing verified fields untouched; no stock is invented here.
    return conn.execute("SELECT * FROM products WHERE id=%s", (pid,)).fetchone()
