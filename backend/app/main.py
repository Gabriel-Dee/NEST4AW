from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import APIError
from app.db import connect, load_dotenv
from app.rules import load_rules, missing_rule_ids
from app.routes import (
    admin,
    auth,
    cart,
    checkout,
    clients,
    floor,
    health,
    lots,
    me,
    reports,
    rules,
    scan,
    staff,
)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    with connect() as conn:
        loaded = load_rules(conn)
    missing = missing_rule_ids(loaded)
    if missing:
        raise RuntimeError("missing rules: " + ", ".join(missing))
    app.state.rules = loaded
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(APIError)
def api_error(_request, exc: APIError):
    return JSONResponse(
        {"error": exc.error, "message": exc.message},
        status_code=exc.status,
    )


@app.exception_handler(RequestValidationError)
def bad_input(_request, exc: RequestValidationError):
    for err in exc.errors():
        loc = err.get("loc") or ()
        if loc and str(loc[-1]) in {"verdict", "color", "tier", "tier_id"}:
            return JSONResponse(
                {
                    "error": "bad_input",
                    "message": "verdict and color are computed by the server",
                },
                status_code=422,
            )
    return JSONResponse(
        {"error": "bad_input", "message": "invalid request"},
        status_code=422,
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(floor.router)
app.include_router(scan.router)
app.include_router(cart.router)
app.include_router(checkout.router)
app.include_router(clients.router)
app.include_router(staff.router)
app.include_router(lots.router)
app.include_router(rules.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(me.router)
