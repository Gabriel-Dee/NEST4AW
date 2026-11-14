# Backend

You own this folder. Paste `docs/prompts/backend.md` into your chat and build here.

Postgres, Argon2 passwords via `pwdlib`, JWTs via PyJWT, roles for doctor, client, warehouse staff, admin, and community partner. Product data from USDA FoodData Central and Open Food Facts.

Do not edit `frontend/` or `mobile/`.

```bash
cd backend
cp ../.env.example .env
uv sync
uv run python -m seed.load
uv run uvicorn app.main:app --port 8000
```

On this Mac the passwordless Postgres listens on port 5433, so the local `.env` uses that port. The example file still says 5432. `GET /health` needs no token. Docs stay on at `http://localhost:8000/docs`. The seed prints five card tokens once. Demo password is `nest-local-demo` unless `SEED_PASSWORD` is set.
