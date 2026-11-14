# API gap report — expected contract vs live OpenAPI

**Fetched:** 2026-11-14 from `http://187.124.157.140:8010/openapi.json`  
**Saved:** `docs/api/openapi.json`  
**Types:** `shared/api-types.ts` (copied into `mobile/api-types.ts` and `frontend/src/lib/api-types.ts`)  
**Web folder name:** `/frontend` (Next.js), not `/web`

Live server mounts **both** legacy routes (`/auth/login`, `/scan`, `/floor/arrive`, …) and a partial `/api/v1/*` surface. Error shape on v1 is `{error:{code,message}}` (matches expected). Legacy still returns `{error:"code",message}`.

| Area | Expected endpoint | In spec? | Live status | Shape matches contract? | Notes / divergence |
| --- | --- | --- | --- | --- | --- |
| Auth | `POST /auth/register` | Yes (`/api/v1/auth/register`) | 201 with valid body | Partial | Body uses `icd10_codes` (required), **not** `conditions` / `consent`. `consent` → 422 (`additionalProperties: false`). Response `client` lacks `first_name`, `plan_badge`, `client_code`, `conditions_label`. Also returns duplicate `token` alias. |
| Auth | `POST /auth/login` | Yes | 200 after register | Partial | Seed personas (`maria@demo.local` etc.) → **401** (DB not seeded). Nested error shape OK. |
| Auth | `GET /auth/me` | Yes | 200 | Partial | `client` has flags/`tier_id`/`household_size`/`allergens`; missing `plan_badge`, `client_code`, `first_name`. |
| Auth | `GET /auth/me/checkin-qr` | Yes | 200 | Partial | Returns `{qr_token, expires_in}` not `{token, expires_in}`. |
| Clients | `POST/GET/PUT /clients`, `PATCH …/enrollment`, `GET /icd10` | **No** under `/api/v1` | Legacy `/clients*` exists (401 without staff) | N/A | Expected staff client CRUD not on v1. |
| Stores | `GET /stores?lat&lng` | Yes | 200 | Partial | Uses `floor:{active,max,queue_length}` and `within_geofence` instead of `on_floor`/`waiting`/`inside_geofence`. No `geofence_radius_m` on list rows (present on detail). |
| Stores | `GET /stores/nearest` | Yes | 200 | Partial | Same store shape divergence. |
| Stores | `GET /stores/:id` | Yes | 200 | Partial | `hours` is object keyed by day, not array of `{day,open,close}`. |
| Floor | `GET /floor/status` | **No** | 404 | — | Legacy `/floor/board` exists (auth required). |
| Visits | `POST /stores/:id/check-in` | Yes | **500** inside geofence | Unknown | Far coords correctly → 403 `NOT_AT_STORE` + `distance_m`. Inside fence → `internal_error`. Blocks all visit-token flows. |
| Visits | `POST /kiosk/check-in` | Yes | 401 without known code | Partial | Needs `X-Kiosk-Code`. No public kiosk setup / seed codes discovered. |
| Visits | `POST /stores/:id/check-in/staff` | Yes | Untested (no staff user) | Body is `{client_id}` only | Expected also allows `client_code`. |
| Visits | `GET /visits/current` | Yes | 200 `null` when none | Partial | Expected visit object or 404. |
| Visits | `POST /visits/current/leave` | Yes | Untested (no visit) | — | |
| Shopping | `GET /recommendations` | Yes | 401 `SESSION_INVALID` | — | Requires visit token; unreachable while check-in 500s. |
| Shopping | `POST /scan` | Yes | 401 without visit | Partial | Body is `{code, source}` (`ScanCode`), not `{sku\|barcode}`. |
| Shopping | `GET/POST /cart`, `PATCH/DELETE /cart/items/:pid` | Yes | 401 without visit | Partial | Paths use `/cart/items` (good). Legacy `/cart/lines` + `session_id` still in schemas. |
| Shopping | `GET /products`, `GET /products/:id` | **No** under v1 | 404 | — | Legacy `/products` exists (auth). |
| Recipes | `GET /recipes/for-me` | Yes | **422** | No | OpenAPI still requires query `session_id` (legacy). No account-only profile mode. |
| Recipes | `POST /recipes/from-cart` | Yes | 401 without visit | Partial | |
| Recipes | `GET /recipes/:id` | Yes as `{recipe_id}` | Untested | — | |
| Recipes | `GET/POST/DELETE /recipes/saved` | Partial | GET 422 (needs `session_id`) | No | POST body still `{session_id, recipe_id}`. |
| Recipes | `GET /recipes/library`, client recipe admin routes | **No** | 404 | — | |
| Checkout | `POST /checkout/:visit_token/validate\|complete` | Yes | Untested (no visit) | Body `{codes}` | |
| Inventory | `/inventory*` , restock, verify | **No** under v1 | 404 | — | Legacy `/inventory`, `/lots` exist. |
| Analytics | `/analytics/*`, `reports/grants.csv` | **No** | 404 | — | Legacy `/reports/dispensed`. |
| Admin | `/rules`, `/ai/logs`, `/recipes/eval-report` | **No** under v1 | 404 | — | Legacy `/rules` exists. |
| Health | `GET /health` | Yes `/api/v1/health` | 200 | Yes | `{db, ai, embeddings}`. Root `/health` → `{ok:true}` only. |
| Dev | `/dev/barcodes`, `/dev/reset-seed` | **No** | 404 | — | Seed users absent; cannot reset remotely. |

## Mapper notes (frontends)

| Live field | UI contract field |
| --- | --- |
| `status.level` (when present) / legacy `verdict` | screen `verdict` / status color |
| `qr_token` | check-in QR `token` |
| `floor.active` / `floor.queue_length` | `on_floor` / `waiting` |
| `within_geofence` | `inside_geofence` |
| `icd10_codes` on register | map from UI `conditions` → ICD (`E11.9`, `I10`, `N18.3`) |
| dual `access_token` + `token` | store `access_token` |
