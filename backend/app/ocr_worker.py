"""Optional private CPU worker; never expose this port publicly."""

import secrets

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.config import settings
from app.errors import APIError
from app.services import ocr

app = FastAPI(title="NEST4AW private OCR worker")


@app.exception_handler(APIError)
async def error(request, exc):
    return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return JSONResponse(
        status_code=422, content={"error": "invalid_input", "message": "request fields are invalid"}
    )


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "http_error", "message": "request could not be completed"},
    )


@app.exception_handler(Exception)
async def unavailable(request, exc):
    return JSONResponse(
        status_code=503,
        content={"error": "ocr_unavailable", "message": "label extraction unavailable"},
    )


@app.post("/extract")
async def extract(image: UploadFile = File(...), authorization: str = Header(default="")):
    cfg = settings()
    if not cfg.ocr_worker_secret or not secrets.compare_digest(
        authorization, "Bearer " + cfg.ocr_worker_secret
    ):
        raise APIError(401, "unauthorized", "worker authentication required")
    raw = await image.read(ocr.MAX_BYTES + 1)
    await image.close()
    ocr.validate_image(raw)
    return {"lines": await run_in_threadpool(ocr.extract, raw, cfg.ocr_timeout)}
