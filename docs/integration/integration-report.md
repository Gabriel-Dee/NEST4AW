# Full backend integration report

**Date:** 2026-11-14  
**Tool:** Cursor / Composer (Auto)  
**Live API:** `http://187.124.157.140:8010`  
**Web app folder:** `/frontend` (Next.js) — not `/web`  
**Mobile:** `/mobile` (Expo SDK 58)

Callers: human deliverable linked from README / this folder. User: "Write docs/integration/integration-report.md". No prior file (Glob 0). Markdown only.

## 1) Summary

| Metric | Result |
| --- | --- |
| Smoke steps | **6/40 PASS** (`docs/integration/smoke-results.json`) |
| Working without visit | health, register, login, me, stores, nearest, NOT_AT_STORE |
| Blocked by check-in 500 | recommendations, scan, cart, recipes-from-cart, checkout |
| Scan accuracy | **not measurable** — `/api/v1/dev/barcodes` MISSING; scan requires visit token |
| AI recipe safety | **not measurable** — `GET /recipes/for-me` returns 422 (requires legacy `session_id`) |
| Seed personas | **MISSING** — maria/staff/admin all 401; smoke registers ephemeral Maria-like clients |

Honest verdict: both frontends are wired to `/api/v1` with `USE_MOCK=false`, mappers, and headers — but a **full UI/flow test cannot pass** until backend fixes geofence check-in (500), seeds users, and ships missing routes. See [backend-issues.md](./backend-issues.md) and [gap-report.md](./gap-report.md).

## 2) Feature checklist

### Mobile

| Feature | Status |
| --- | --- |
| Sign-in (email/password → `/auth/login`) | ✅ integrated |
| Register mapper (`conditions` → `icd10_codes`) | ✅ integrated (UI still thin) |
| Stores list + geofence check-in + DEV pretend toggle | 🔧 UI built · 🟡 blocked by API 500 |
| Kiosk QR auto-refresh | ✅ integrated (`qr_token` mapped) |
| Leave store | ✅ wired |
| My List / Scan / Cart / Recipes | 🟡 wired; need visit token |
| Scan test log (dev) | 🔧 UI built |
| Full register wizard / offline banner polish | 🟡 partial (existing screens) |

### Web (`/frontend`)

| Feature | Status |
| --- | --- |
| Staff/admin login via `/api/v1/auth/*` | ✅ integrated (seed empty → 401) |
| Kiosk setup (localStorage `X-Kiosk-Code`) + check-in | 🔧 UI built · 🟡 needs seeded kiosk code |
| Checkout / warehouse / clinical / admin screens | 🟡 still call legacy unversioned routes where v1 missing |
| `/dev/barcodes` print kit | 🔧 UI built · ❌ live endpoint missing (fallback kit shown) |
| Next `/api` rewrite proxy | ✅ added |
| Analytics / inventory / AI quality on v1 | ❌ missing in backend |

## 3) Divergences handled by mappers

- `status.level` / legacy `verdict` → UI verdict  
- `qr_token` → QR `token`  
- `floor.active` / `queue_length` → `on_floor` / `waiting`  
- `within_geofence` → `inside_geofence`  
- Register: UI conditions → `icd10_codes` (no `consent` field sent)  
- Nested `{error:{code,message}}` → `ApiError` + friendly messages  
- Dual `access_token` / `token` → store `access_token`

## 4) Backend issues

Full list + curls: [backend-issues.md](./backend-issues.md)

Critical: **geofence check-in 500**, empty seed, missing `/dev/*`, recipes still require `session_id`.

## 5) Network / HTTPS notes

- API is plain **HTTP**. HTTPS-hosted web UI will hit mixed content — use Next rewrite (`/api/*` → backend) in dev; put TLS reverse proxy in front of API before production.  
- iOS ATS blocks plain HTTP in standalone builds; Expo Go/dev OK.  
- CORS allows `Authorization`, `X-Visit-Token`, `X-Kiosk-Code`.

## 6) Commands

```bash
# Smoke test
API_URL=http://187.124.157.140:8010 node scripts/smoke-test.mjs

# Mobile
cd mobile
EXPO_PUBLIC_API_URL=http://187.124.157.140:8010 EXPO_PUBLIC_USE_MOCK=false npx expo start

# Web
cd frontend
NEXT_PUBLIC_API_URL=http://187.124.157.140:8010 NEXT_PUBLIC_USE_MOCK=false npm run dev
# Or proxy mode (same-origin /api/v1):
NEXT_PUBLIC_API_URL= API_PROXY_TARGET=http://187.124.157.140:8010 npm run dev

# Types from OpenAPI
npx openapi-typescript docs/api/openapi.json -o shared/api-types.ts
```

## Artifacts

- `docs/api/openapi.json`
- `shared/api-types.ts` (+ copies in mobile/frontend)
- `docs/integration/gap-report.md`
- `docs/integration/smoke-results.json`
- `docs/integration/backend-issues.md`
- `scripts/smoke-test.mjs`
