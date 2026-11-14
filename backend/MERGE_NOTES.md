# origin/main integration — 2026-11-14

## Recovery points and incoming scope

Local backend work was committed before fetching as `f3684cc` on branch `backend`.
The only remote branch and remote default was `origin/main`, so the placeholder in the request
was resolved to that branch. The incoming tip was `d703d43` (with `b607ae5` and `90c0c1a`).
No force operations, remote pushes, or uncommitted-work deletion were performed.

Incoming work added a second core FastAPI/psycopg backend, auth/checkout/property tests, uv
packaging, frontend admin/clinical/rules/analytics/kiosk/warehouse/checkout screens, and an Expo
mobile application. Both UIs currently use mock data adapters. Their files were merged unchanged
from origin/main; this merge does not claim the UIs are wired to real API data.

## Conflicts and deliberate resolutions

There were 12 conflicts: backend README, auth, db, main, client routes, rules, tier, pyproject,
seed loader, test conftest, rule tests, and tier tests. The conflicts and behavioral trade-offs
were described in chat before resolving them.

- One runtime and one clinical engine remain. Incoming alternate router modules delegate to the
  same handler objects; dataclass `Person`/`Item`/`Verdict` and tier helpers adapt to the canonical
  implementation. Routers are mounted only once.
- Preserved card revocation/session expiry, persisted-role checks, transaction-scoped dependencies,
  PostgreSQL pooling, locked floor admission and checkout, idempotent seed, OCR, and local LLM.
- Did not adopt the incoming seed's unconditional `DROP SCHEMA public CASCADE`. The seed preserves
  existing accounts, tokens, products, lots, and ledger history. Destructive resets exist only in
  explicitly configured, guarded test fixtures for database names ending in `_test`.
- Did not adopt incoming green verdicts for the three missing-allergen-evidence golden cases.
  The earlier user-approved conservative unknown corrections apply to both test suites/interfaces.
- Incorporated incoming ingredient aliases (including buttermilk/shellfish/nut variants),
  condition-gated fiber ranking, and authoritative rule-table colors through the shared engine.
- Added `card_token` as a once-issued alias for `token`; list/read endpoints expose neither.
  Added client email, cart nutrition/location metadata, and floor-board counts/capacity/rows.
- Existing array responses remain the default. `response_format=summary` provides the incoming
  cart/checkout object shapes and the `session_not_active` error alias. Default error remains
  `session_inactive`. Creation stays 201. All details are documented in `docs/API.md`.
- Both `uvicorn app.main:app` and `app.main:create_app --factory` work. Existing `.env` was neither
  copied from the colleague's machine nor changed; its configured PostgreSQL port remains in use.
- The authoritative schema, reference seed, golden file, and existing additive macro migration
  are unchanged. No production/demo schema reset or new migration is needed for this merge.
- Incoming seed code used serving grams as net package weight. This was not imported: package
  weight remains unknown unless actually sourced, preserving honest pounds-distribution reports.

## Tests retained and adapted

The colleague's four test modules are preserved under `tests/upstream/` with scoped fixtures so
both suites can run together. Their assertions still test login claims, role denial, encrypted
client workflows, floor capacity, clinical rejection, expired lots, stock depletion, report fields,
and golden/property cases. Necessary adaptations are explicit:

1. Enrollment success expects the existing 201 status.
2. Incoming checkout-envelope test opts into `response_format=summary`.
3. Three golden expected colors use the owner's previously approved unknown correction.
4. Test fixtures use the explicit disposable test URL, full-length test keys, and the unified
   app factory. Unit rules tests can run without PostgreSQL; no default database is reset.

Additional merge tests cover both clinical interfaces, rule-table color changes, both app
entrypoints, alternate router imports, response aliases, and absence of raw tokens from reads.

## Verification

- Clean, isolated Python 3.13 environment installed using `uv sync --frozen --group dev`.
- `uv pip check`: all 45 installed packages compatible.
- **127 tests passed, none skipped**, including PostgreSQL integration and real local Ollama.
  Runtime: 11.25 seconds. Tests use only the separate `nest_test` database.
- `ruff check` and formatting checks passed; all backend Python modules parse.
- Wheel and source-distribution builds succeeded. Database initialization still requires the
  source checkout's authoritative docs assets; this is not a standalone schema wheel.
- `uv.lock` regenerated for combined runtime/dev/optional OCR dependencies; `requirements.lock`
  exported from that same lock. Optional OCR weights are not downloaded by ordinary `uv sync`.
- `git diff --check` passed. Frontend/mobile match origin/main exactly.
- Two warnings are non-failing: upstream Starlette TestClient deprecation, and an intentionally
  short wrong signing key in the colleague's bad-signature rejection test.

Docker/public hosting was not exercised. The previously running local API is restarted after
verification so its Swagger docs show the merged routes. Changes remain local until pushed.
