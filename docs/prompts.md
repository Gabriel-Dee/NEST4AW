# Prompts used during integration

## 2026-11-14 — Full backend integration (Cursor / Composer)

Callers: human log of prompts (user: "Append the key prompts you used to prompts.md"). No prior `prompts.md` at repo root.

Key instruction (abbreviated): discover live OpenAPI at `http://187.124.157.140:8010`, smoke-test, wire `/mobile` and `/frontend` to `/api/v1` with `USE_MOCK=false`, build missing UI, scanning kit, write gap/smoke/backend/integration reports. Do not modify backend. Do not claim success without running it.

Follow-on notes while executing:

1. Download `openapi.json` → generate `shared/api-types.ts` → gap table vs expected contract.
2. Scripted smoke test against live host; log MISSING/backend bugs with curls.
3. API clients: Bearer + `X-Visit-Token` + `X-Kiosk-Code`; map shape divergences inside the client.
4. Next rewrite `/api` → backend for mixed-content; note ATS/HTTPS.
5. Honest report when check-in returns 500 and seed users are absent.
