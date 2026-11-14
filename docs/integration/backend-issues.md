# Backend issues (live host)

Host: `http://187.124.157.140:8010`  
Do not modify backend from the frontend integration work. Reproduce with the curls below.

**Callers:** linked from `docs/integration/integration-report.md` and `docs/integration/gap-report.md`. Not imported by app code.  
**No prior file:** Glob found 0 `backend-issues.md`.  
**Data:** markdown only (no machine-written data file).  
**User instruction:** "Backend bugs → docs/integration/backend-issues.md with endpoint, request, expected, actual, and a curl to reproduce"

## 1. Geofence check-in returns 500 inside the fence

**Endpoint:** `POST /api/v1/stores/{store_id}/check-in`  
**Expected:** 200 with `visit_token` when lat/lng are the store's own coordinates.  
**Actual:** `500` `{ "error": { "code": "internal_error", "message": "request could not be completed" } }`  
**Impact:** Blocks recommendations, scan, cart, recipes-from-cart, checkout.

```bash
EMAIL="repro$(date +%s)@test.local"
TOKEN=$(curl -sS -X POST http://187.124.157.140:8010/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"first_name\":\"Maria\",\"last_name\":\"Alvarez\",\"email\":\"$EMAIL\",\"password\":\"nest-local-demo\",\"household_size\":3,\"icd10_codes\":[\"E11.9\",\"I10\"],\"allergies\":[]}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

STORE=cdffe51e-fb3a-4faa-a706-5734949669af
curl -sS -i -X POST "http://187.124.157.140:8010/api/v1/stores/$STORE/check-in" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"lat":29.8947,"lng":-81.3145,"accuracy_m":5}'
```

Far coordinates correctly return `403 NOT_AT_STORE` (good).

## 2. Seed users / personas missing

**Endpoint:** `POST /api/v1/auth/login`  
**Expected:** Maria (`maria@demo.local` / `nest-local-demo`), staff, admin, helen (expired).  
**Actual:** all `401 invalid email or password`.  
**Also missing:** `POST /api/v1/dev/reset-seed` (404).

```bash
curl -sS -X POST http://187.124.157.140:8010/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"maria@demo.local","password":"nest-local-demo"}'
```

## 3. Register rejects contract fields

**Endpoint:** `POST /api/v1/auth/register`  
**Expected body fields:** `conditions`, `consent` (see frontend contract).  
**Actual:** OpenAPI requires `icd10_codes`; `consent` / `conditions` → `422 VALIDATION_ERROR` (`additionalProperties: false`).  
**Also:** response `client` has no `client_code`, `first_name`, `plan_badge`.

```bash
curl -sS -X POST http://187.124.157.140:8010/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"first_name":"Maria","last_name":"G","email":"x@test.local","password":"nest-local-demo","household_size":3,"conditions":["type_2_diabetes"],"allergies":[],"consent":true}'
```

## 4. Recipes still require legacy `session_id`

**Endpoint:** `GET /api/v1/recipes/for-me`, `GET /api/v1/recipes/saved`  
**Expected:** account JWT only, profile mode.  
**Actual:** `422 VALIDATION_ERROR` — OpenAPI marks query `session_id` required.

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://187.124.157.140:8010/api/v1/recipes/for-me
```

## 5. Missing expected routes (404)

| Path | Notes |
| --- | --- |
| `/api/v1/dev/barcodes` | blocks scanning test kit against live |
| `/api/v1/dev/reset-seed` | cannot restore personas |
| `/api/v1/floor/status` | use legacy `/floor/board` only |
| `/api/v1/inventory*` | legacy `/inventory`, `/lots` exist |
| `/api/v1/products*` | legacy `/products` exists |
| `/api/v1/analytics/*` | missing |
| `/api/v1/reports/grants.csv` | legacy `/reports/dispensed` |
| `/api/v1/rules`, `/api/v1/ai/logs`, `/api/v1/recipes/eval-report` | rules only on legacy `/rules` |
| `/api/v1/clients*` | clients only on legacy `/clients` |
| `/api/v1/kiosks/setup`, `/api/v1/kiosks/me` | no first-run kiosk bind |

## 6. Kiosk code unknown

**Endpoint:** `POST /api/v1/kiosk/check-in` + `X-Kiosk-Code`  
**Actual:** `401 unauthorized` / `kiosk is not recognized` for unset codes. No admin endpoint returned kiosk codes to a client JWT.

```bash
curl -sS -X POST http://187.124.157.140:8010/api/v1/kiosk/check-in \
  -H 'Content-Type: application/json' -H 'X-Kiosk-Code: unknown' \
  -d '{"client_code":"1001"}'
```

## 7. CORS / mixed content notes

- Preflight advertises `Authorization`, `X-Visit-Token`, `X-Kiosk-Code` (good).
- API is **plain HTTP**. A production HTTPS web deploy will be blocked by mixed content until a TLS reverse proxy is added. Dev uses Next rewrite `/api/*` → backend.
- iOS ATS blocks plain HTTP in standalone builds; Expo Go/dev is fine.

## 8. Dual surface confusion

Legacy routes (`/auth/login`, `/scan` with `session_id`, `/floor/arrive`) coexist with `/api/v1/*`. Several v1 recipe/cart schemas still reference `session_id`, so the migration is incomplete.
