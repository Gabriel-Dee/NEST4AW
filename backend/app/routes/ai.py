from uuid import UUID

import httpx
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.errors import APIError
from app.floor import active_session, product
from app.schemas import SessionBody
from app.services import llm, ocr
from app.services.nutrition import off_lookup

router = APIRouter()


def snapshot(app, sid):
    # Inference must not hold the floor lock or a database transaction.
    with app.state.pool.connection() as conn:
        person = active_session(conn, sid)
        ids = conn.execute("""SELECT p.id FROM products p WHERE EXISTS(SELECT 1 FROM lots WHERE product_id=p.id
            AND qty>0 AND expires_on>CURRENT_DATE) ORDER BY p.id LIMIT 200""").fetchall()
        products = {}
        for row in ids:
            p = product(conn, pid=row["id"])
            if app.state.engine.evaluate(person, p)["verdict"] == "green" and p["serving_g"]:
                products[str(p["id"])] = p
        cart = {
            str(r["product_id"]): r["qty"]
            for r in conn.execute(
                "SELECT product_id,qty FROM cart_lines WHERE session_id=%s", (sid,)
            )
        }
        return person, products, cart


@router.post("/recommendations")
async def recommendations(body: SessionBody, request: Request):
    person, products, cart = await run_in_threadpool(snapshot, request.app, body.session_id)
    context = {
        "profile": {
            k: person[k]
            for k in ("dm", "htn", "ckd34", "k_limit_ordered", "allergens", "household_size")
        },
        "rules": [
            {
                k: row[k]
                for k in ("rule_id", "applies", "nutrient", "threshold", "color", "rd_confirm")
            }
            for row in request.app.state.engine.rules.values()
        ],
        "candidates": [
            {
                k: p[k]
                for k in (
                    "id",
                    "name",
                    "serving_g",
                    "sodium_mg",
                    "potassium_mg",
                    "phosphorus_mg",
                    "added_sugar_g",
                    "carb_g",
                    "fiber_g",
                    "allergen_tags",
                    "stock",
                    "bin_code",
                )
            }
            for p in sorted(products.values(), key=lambda p: (str(p["id"]) not in cart, p["name"]))[
                :20
            ]
        ],
        "cart": cart,
    }
    mode, proposal = "ollama", None
    try:
        if products:
            proposal = await run_in_threadpool(llm.generate, context)
        else:
            mode = "deterministic_fallback"
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        mode = "deterministic_fallback"
    # Re-read after inference: medical flags, revoked session, cart and stock may have changed.
    person, products, cart = await run_in_threadpool(snapshot, request.app, body.session_id)
    if proposal is not None:
        try:
            llm.validate_proposal(proposal, products, person, request.app.state.engine, cart)
        except ValueError:
            mode, proposal = "deterministic_fallback", None
    if proposal is None:
        rank_k = person["htn"] and not person["ckd34"] and not person["k_limit_ordered"]
        ordered = sorted(
            products.values(),
            key=lambda p: (
                -int(request.app.state.engine.evaluate(person, p)["fiber_rank_bonus"]),
                -(float(p["potassium_mg"] or 0) if rank_k else 0),
                p["name"],
            ),
        )[:10]
        proposal = llm.Proposal(
            recommendations=[llm.Choice(product_id=p["id"], suggested_quantity=1) for p in ordered],
            recipes=[],
        )
    result = llm.render(proposal, products, person, request.app.state.engine)
    return {
        **result,
        "mode": mode,
        "review_required": not bool(products),
        "model": settings().ollama_model if mode == "ollama" else None,
    }


@router.post("/scan/image")
async def image_scan(request: Request, session_id: UUID = Form(...), image: UploadFile = File(...)):
    raw = await image.read(ocr.MAX_BYTES + 1)
    await image.close()
    if image.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise APIError(422, "invalid_image", "use PNG, JPEG, or WebP")

    # Validate bearer before decoding or invoking expensive services.
    def authorize():
        with request.app.state.pool.connection() as conn:
            return active_session(conn, session_id)

    await run_in_threadpool(authorize)
    decoded = await run_in_threadpool(ocr.validate_image, raw)
    codes = await run_in_threadpool(ocr.barcodes, decoded)

    def catalog_result():
        with request.app.state.pool.connection() as conn:
            person = active_session(conn, session_id)
            foods = [product(conn, barcode=code) for code in codes]
            matches = [p for p in foods if p]
            if len(codes) == 1 and len(matches) == 1:
                return request.app.state.engine.evaluate(person, matches[0])

    found = await run_in_threadpool(catalog_result)
    if found:
        return {**found, "recognition": "barcode", "review_required": False}
    external = None
    if len(codes) == 1:
        try:
            external = await run_in_threadpool(off_lookup, codes[0])
        except (httpx.HTTPError, ValueError, KeyError):
            pass
    try:
        cfg = settings()
        if cfg.ocr_url:
            async with httpx.AsyncClient(timeout=cfg.ocr_timeout) as client:
                response = await client.post(
                    cfg.ocr_url.rstrip("/") + "/extract",
                    headers={"Authorization": "Bearer " + cfg.ocr_worker_secret},
                    files={"image": ("label", raw, image.content_type)},
                )
                response.raise_for_status()
                lines = response.json()["lines"]
        else:
            lines = await run_in_threadpool(ocr.extract, raw, cfg.ocr_timeout)
        extraction = ocr.parse_label(lines)
        status = "extracted" if lines else "unreadable"
    except (APIError, httpx.HTTPError, ValueError, KeyError, TypeError):
        extraction, status = None, "unavailable"
    await run_in_threadpool(authorize)

    def catalog_candidates():
        if not extraction:
            return []
        with request.app.state.pool.connection() as conn:
            active_session(conn, session_id)
            return conn.execute(
                "SELECT id,name,source FROM products WHERE position(lower(name) in lower(%s))>0 ORDER BY name LIMIT 5",
                (extraction["text"],),
            ).fetchall()

    candidates = await run_in_threadpool(catalog_candidates)
    # Unverified OCR and external products never become an approved cart identity.
    return {
        "verdict": "unknown",
        "reasons": [],
        "product": None,
        "barcodes": codes,
        "recognition": status,
        "extraction": extraction,
        "external_candidate": external,
        "catalog_candidates": candidates,
        "review_required": True,
    }
