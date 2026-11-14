# NEST4AW backend

FastAPI + psycopg 3 + PostgreSQL. Implements the shared [HTTP contract](../docs/API.md),
with deterministic clinical voting, encrypted enrollment, floor-card sessions, FIFO checkout,
real PaddleOCR scanning, and locally generated Ollama recommendations. Frontend and mobile
code are separate and are not modified by this backend.

## Start locally

Use Python 3.12 or 3.13 for the complete CPU/OCR environment. The core API also runs on 3.14.
Install PostgreSQL 16+ with `pgcrypto`, then create a dedicated database/user:

```sql
CREATE USER nest WITH PASSWORD '<your-random-password>';
CREATE DATABASE nest OWNER nest;
```

From this directory:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
cp .env.example .env
# Edit DATABASE_URL and set three independent random secrets below.
python -c 'import secrets; print(secrets.token_urlsafe(48))'
# Run the generator separately for JWT_SECRET, PHI_KEY, and HMAC_KEY.
python -m seed.load
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log
```

`seed.load` applies `../docs/schema.sql` and `../docs/seed_reference.sql` unchanged to an
empty database, then the reviewed additive SQL files in `migrations/`. An existing partial
schema is not silently replaced. The nullable macro migration adds calories, protein, fat,
and total sugar without changing existing columns, enum values, or thresholds. Initialization
and migration run in a transaction under a dedicated PostgreSQL advisory lock. No ORM,
Alembic, SQLite, or vector service is introduced.

The seed loads the six golden foods first and a checked-in, source-attributed Open Food Facts
snapshot, for 114 records. It creates five fictional clients and the four demo staff accounts.
It prints the five card secrets once, after commit; save them on the fictional demo cards.
Re-running seed never rotates cards, resets passwords, replenishes lots, or duplicates products.
Use `/staff/reissue` if a card was lost. `SEED_PASSWORD` defaults to `nest-local-demo` for local
synthetic demos; choose a separate secret before exposing the app publicly.

There are synthetic expired, soon-expiring, and later lots for each product, with two eligible
units so concurrency can be demonstrated. They do not represent an actual warehouse delivery.
`GET /health` checks database connectivity and returns `{"ok":true}`. Interactive API reference
is at `http://localhost:8000/docs`.

## Team integration

Use `http://localhost:8000` as the frontend/mobile API base. The permitted development origins
are exactly `http://localhost:5173` and `http://localhost:5174`. JSON requests set
`Content-Type: application/json`. Protected routes additionally set `Authorization: Bearer <jwt>`.
Do not put a client JWT on floor operations: use the issued card token at arrival and then the
returned session UUID as the floor bearer credential.

```javascript
const api = 'http://localhost:8000';
const arrival = await fetch(`${api}/floor/arrive`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({token: cardToken}),
}).then(r => r.json());
const scan = await fetch(`${api}/scan`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({session_id: arrival.session_id, internal_code: 'P-173944'}),
}).then(r => r.json());
// Scan does not mutate the cart. POST /cart/lines explicitly to add one unit.
const imageBody = new FormData();
imageBody.set('session_id', arrival.session_id);
imageBody.set('image', imageFile);
const extracted = await fetch(`${api}/scan/image`, {method:'POST', body:imageBody});
// Do not set Content-Type manually for FormData; the browser supplies the boundary.
```

A real phone must use the developer machine's LAN address or the deployed HTTPS API URL;
`localhost` on the phone means the phone. Add its actual web origin to `CORS_ORIGINS`. A queued
client polls `/sessions/{session_id}` until active. On 401, ask for a card reissue or sign-in;
on 409 show `message` and refresh session/cart/stock; on 422 correct the input. Do not translate
unknown into green. Checkout is staff/admin only and returns inserted ledger rows.

All original endpoints are implemented. Added routes are `/scan/image`, `/recommendations`,
`/products`, `/products/search-external`, `/products/import`, `/inventory`, and receiving via
`POST /lots`. Their exact fields, authorization, and errors are in `../docs/API.md`.

## Model setup

### OCR and barcode

```bash
pip install 'paddleocr==3.7.0' 'paddlepaddle==3.3.1'
python tests/real_ocr.py
```

The selected CPU pipeline uses `PP-OCRv5_mobile_det`, `en_PP-OCRv5_mobile_rec`, and
`PP-LCNet_x1_0_textline_ori`. First use downloads weights; warm the model before the demo.
The real smoke test grants 180 seconds for initial downloads, while normal requests use
`OCR_TIMEOUT` (default 30 seconds). Inference is lazy, reused, serialized, and process-bounded;
a timeout terminates the worker instead of accumulating hung work. Images are validated,
EXIF-oriented, converted to RGB, and resized. ZXing-C++ decodes actual barcodes.

OCR extracts evidence, not clinical truth. Low confidence, missing servings, conflicting values,
unknown identities, and inference failures are explicitly represented. Extracted fields never
overwrite catalog records. A verified catalog barcode goes directly through clinical rules
without waiting for OCR or an LLM. Unmatched image results stay unknown and require staff review.

Optional private worker:

```bash
# Set OCR_WORKER_SECRET to a long random secret in both services.
uvicorn app.ocr_worker:app --host 127.0.0.1 --port 8001 --no-access-log
# On API: OCR_URL=http://127.0.0.1:8001 and matching OCR_WORKER_SECRET
```

The worker receives only image bytes, never a client profile. Keep it on loopback/private
network; use TLS plus the worker bearer secret if it crosses hosts. Warm its model cache before
launch. PaddleOCR/PaddlePaddle are Apache-2.0; ZXing-C++ is Apache-2.0.

### Local LLM

Install Ollama from its official distribution, then:

```bash
OLLAMA_NO_CLOUD=1 ollama serve
# In another terminal:
ollama pull qwen2.5:1.5b
python tests/real_llm.py
```

Default endpoint is `http://127.0.0.1:11434`, model `qwen2.5:1.5b` (Q4_K_M, about 986 MB).
Qwen2.5 1.5B Instruct is Apache-2.0; it is smaller and has a more permissive license than the
3B Qwen-licensed model in the initial plan. No paid model APIs or cloud inference are used.
`OLLAMA_URL`, `OLLAMA_MODEL`, and `LLM_TIMEOUT` are configurable.

The model receives condition flags, allergens, household size, the authoritative rules,
a bounded set of eligible products with locations, and cart quantities. No legal names,
phones, email addresses, card secrets, or client IDs are sent. JSON Schema constrains its output;
Pydantic and a second database/clinical check reject invented IDs, unavailable products,
invalid quantities, unsafe ingredients, duplicates, and malformed recipes. Stock and clinical
flags are refreshed after inference, with no floor lock held while the model runs.

Recipes are deliberately constrained to prepare-as-labeled/combine/serve operations over
validated product IDs. The server renders ingredient names, instructions, and rule explanations;
the model cannot invent an extra ingredient in prose. Quantity units are packages, not prescribed
portions. This is a cautious recipe assembly demo, not a dietitian-approved meal plan. If the
model fails, returns unsafe output, or is absent, deterministic eligible-product ranking works
and `mode` explicitly says `deterministic_fallback`; generated recipes are omitted.

## Nutrition sources and provenance

The checked-in snapshot's [notice](seed/data/NOTICE.md) attributes Open Food Facts contributors
under ODbL-1.0. Its data is community-reported, not verified USDA nutrition. The golden file
identifies USDA records and two team fixtures separately. Unknown values remain null, including
missing units; values are converted to each stated serving. Whole-produce added-sugar assumptions
are limited to those explicitly supplied in the golden file. Nutrition is never synthesized to
satisfy catalog coverage. Inventory dates and quantities are synthetic.

Set `FDC_API_KEY` for USDA FoodData Central search/detail and optional enrichment:

```bash
python -m seed.load --enrich
```

The enrichment command preserves existing records, joins OFF evidence only on barcode, requires
matching serving bases for nutrient enrichment, and exits nonzero when required source/product
classes are still missing. The offline seed already includes all required allergen classes,
high/low sodium, juice, a sweetened drink, phosphate ingredients, and high-potassium produce.
The FDC adapter reads nutrient names, never guessed IDs. Source failures return 503 for explicit
catalog requests and never make an unknown item eligible. The core scan remains database-only.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL; use TLS (`sslmode=require` or stronger verification) across hosts |
| `JWT_SECRET` | Independent random HS256 signing key, at least 32 characters |
| `PHI_KEY` | Independent pgcrypto key for encrypted names and phones |
| `HMAC_KEY` | Independent key for exact normalized-name lookup |
| `CORS_ORIGINS` | JSON array of exact frontend/mobile origins |
| `SEED_PASSWORD` | Synthetic demo accounts only; defaults to local demo password |
| `FDC_API_KEY` | USDA API key; optional for offline demos |
| `OFF_USER_AGENT` | Project-identifying Open Food Facts User-Agent |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `LLM_TIMEOUT` | Local model address, tag, timeout seconds |
| `OCR_URL`, `OCR_WORKER_SECRET`, `OCR_TIMEOUT` | Optional private worker, authentication, timeout |
| `PADDLE_PDX_CACHE_HOME`, `HF_HOME` | Optional model-cache locations |
| `POSTGRES_PASSWORD` | Compose-only PostgreSQL password, use URL-safe random characters |

Keep `.env` and runtime/model files untracked. Back up PHI/HMAC keys separately from PostgreSQL;
rotating them requires a deliberate decrypt/re-encrypt and name-index migration. Rotating JWT
secret signs all JWT users out. Persisted role/status checks invalidate disabled/changed-role
JWTs on the next request. Password changes do not revoke other unexpired JWTs under this schema.

## Tests

```bash
pip install -e '.[test]'
pytest -q                         # unit tests; database/live-model cases explicitly skip
# Create a dedicated disposable database whose name ends in _test:
TEST_DATABASE_URL=postgresql://nest:password@localhost:5432/nest_test pytest -q
RUN_REAL_INFERENCE=1 TEST_DATABASE_URL=postgresql://nest:password@localhost:5432/nest_test pytest -q
ruff check app seed tests
ruff format --check app seed tests
```

**The integration fixture resets the test database's public schema. Never point it at a shared
or production database.** It rejects names not ending in `_test` and never uses DATABASE_URL as
an implicit destructive-test target. Tests exercise actual PostgreSQL transactions; no SQLite
substitute is used. The two manual real-inference scripts are separate from mocked unit tests.
See [verification evidence](VERIFICATION.md) for executed results and limitations.

Three original golden expectations conflict with the written allergy rule. The user explicitly
approved conservative unknown verdicts for Asha/banana, Helen/banana, and Helen/orange_juice.
Tests encode those three corrections visibly; the other 27 golden cells are unchanged. The
original `docs/golden.json` is not rewritten.

## Architecture and operational limits

Routes validate inputs and roles; domain modules handle cards, tiers, floor state, and rules;
source/inference services are separate. PostgreSQL is the only application persistence layer.
Transactions lock floor capacity, session/cart state, product rows in stable UUID order, and
eligible FIFO lots. Checkout rechecks every line before decrement and rolls back the entire
sale on any error. Expiration today blocks sale; the next seven days is a warning. Closing a
session promotes queued clients. The global floor lock trades throughput for easy-to-audit
correctness at hackathon scale.

Startup refuses missing clinical rule IDs/thresholds. The rules API exposes all `rd_confirm`
flags. The matrix is not dietitian-approved and the system is not represented as HIPAA compliant.
Reports read only `analytics_public`; they contain no identifying medical fields. This schema has
no longitudinal clinical measurement table, so no outcome improvements or causation are invented.

See [deployment handoff](DEPLOYMENT.md) for Docker, a public HTTPS demo, and private inference.


## Merged uv workflow

The `uv.lock` from `origin/main` has been regenerated for the union of dependencies. To use it:

```bash
uv sync --frozen --group dev
uv run python -m seed.load
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The factory entrypoint remains supported. `DATABASE_URL` controls the database port; no
colleague-specific 5433 setting is hardcoded. Existing local `.env` keys and database data
are retained. The merged seed is idempotent and **does not drop the schema**.
`requirements.lock` is exported from the same uv lock (core + dev, without OCR), so the Docker
and uv workflows agree. To regenerate after dependency edits:

```bash
uv lock
uv export --frozen --no-emit-project --no-hashes --no-header --group dev --output-file requirements.lock
```

The colleague's tests live in `tests/upstream/`; they run against the same implementation,
with isolated test fixtures. The merged response aliases and optional summary formats are
listed in `../docs/API.md`. Source checkout and authoritative `docs/` assets remain required
for database initialization; the wheel is not a standalone schema distribution.
