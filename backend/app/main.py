import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import IntegrityError, OperationalError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout
from starlette.exceptions import HTTPException

from app.config import settings
from app.errors import APIError
from app.routes import accounts, ai, clients, health, products, recipes, stores, warehouse
from app.rules import RuleEngine
from seed.load import initialize


def create_app():
    cfg = settings()

    @asynccontextmanager
    async def lifespan(app):
        pool = ConnectionPool(
            cfg.database_url,
            min_size=1,
            max_size=10,
            timeout=10,
            kwargs={"row_factory": dict_row, "connect_timeout": 10},
            open=False,
        )
        pool.open(wait=True)
        try:
            with pool.connection() as conn:
                initialize(conn)
                app.state.engine = RuleEngine(conn.execute("SELECT * FROM rules").fetchall())
                if not conn.execute("SELECT id FROM warehouse_limits WHERE id=1").fetchone():
                    raise RuntimeError("warehouse limits must be seeded")
            app.state.pool = pool
            yield
        finally:
            pool.close()

    app = FastAPI(title="NEST4AW", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    def error(status, code, message, **extra):
        return JSONResponse(
            status_code=status, content={"error": code, "message": message, **extra}
        )

    @app.exception_handler(APIError)
    async def domain_error(request, exc):
        code = exc.code
        if code == "session_inactive" and request.query_params.get("response_format") == "summary":
            code = "session_not_active"
        return error(exc.status, code, exc.message, **exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error(422, "invalid_input", "request fields are invalid")

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error(exc.status_code, "http_error", "request could not be completed")

    @app.exception_handler(IntegrityError)
    async def constraint_error(request, exc):
        return error(409, "conflict", "record conflicts with existing data")

    @app.exception_handler(OperationalError)
    @app.exception_handler(PoolTimeout)
    async def unavailable(request, exc):
        return error(503, "unavailable", "database unavailable")

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        # Do not log request bodies, tokens, exception values, SQL params, or PHI.
        logging.getLogger("nest").error("request failed: %s", type(exc).__name__)
        return error(500, "internal_error", "request could not be completed")

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    for module in (health, accounts, clients, warehouse, ai, products, recipes, stores):
        app.include_router(module.router)
    return app


def __getattr__(name):
    # Preserve `uvicorn app.main:app` without loading configuration during ordinary imports.
    if name == "app":
        return create_app()
    raise AttributeError(name)
