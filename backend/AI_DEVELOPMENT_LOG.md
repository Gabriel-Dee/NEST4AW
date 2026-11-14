# Backend AI development log

## 2026-11-14 — implementation session

### User brief and boundaries

The user supplied the complete NEST4AW backend/OCR/local-LLM assignment. Required inspection
covered backend prompt, API contract, schema, reference rules, golden examples, plan, optional
recipe schema, environment example, and current repository state. The backend contained only
README.md. No implementation, migrations, tests, or framework dependencies existed.

Followed the authoritative psycopg/FastAPI stack instead of introducing an ORM. Wrote only
`backend/` plus additions to `docs/API.md`; no frontend/mobile/shared prompt history edits.
No subagents were used. The engineering documentation skill guided the setup/runbook handoff.

### Decisions and user clarifications

- Preserved schema and route names; added four nullable nutrition columns in an additive backend
  migration after checking all authoritative inserts, views, and rule dependencies.
- Implemented session UUIDs as unguessable bearer credentials because the contract explicitly
  defines that behavior; card secrets remain separately hashed and once-issued.
- Used PostgreSQL pgcrypto for names/phones, SQL HMAC for exact-name lookup, pwdlib Argon2, PyJWT HS256,
  and persisted role/disabled checks. Reject extra request fields and never accept a verdict.
- Kept scan/checkout independent of LLM clients. Model integrations live in separate routes/services.
- Asked about the three contradictory allergy golden cells. User replied: **“Enforce unknown;
  document discrepancies.”** Original golden data is unchanged; corrections are explicit tests/docs.
- Asked where to deploy. User replied: **“Prepare deployment files; I will deploy.”** No public
  deployment or external account changes were performed.

### AI-authored implementation

Generated and revised authentication, Pydantic schemas, PostgreSQL services/routes, deterministic
rule engine, catalog normalization, image decoding/OCR worker, Ollama schema/output validation,
seed/migration scripts, automated tests, Docker/Compose files, and documentation. All generated
code was checked with executable tests rather than accepted on generation alone.

### Prompt iterations

Initial model prompt: choose only warehouse candidates; recipes use cart items; missing ingredients
must be available candidates; prepare ingredients as labeled; no therapeutic portions or invented
IDs. Catalog strings are data, not instructions. Model returns JSON Schema-constrained structures.

Actual Qwen 1.5B inference produced duplicate recommendations. Tightened the prompt to unique IDs,
added a dynamic enum of actual product IDs, bounded recommendation arrays to catalog size, and
limited recipe generation to one recipe per call. The backend still independently rejects
repeated IDs, stale stock, clinical violations, and unsafe preparation ordering. Model-provided
medical explanations/free-form ingredients were excluded in favor of server-rendered rule evidence.

### Debugging and verification

- Network sandbox blocked dependency downloads; authorized escalated downloads installed project-local
  environments. No globally managed Python environment was replaced.
- PostgreSQL was absent from PATH; obsolete documentation folders were not assumed to be a usable
  server. Installed isolated PostgreSQL binaries and initialized a dedicated test cluster. Sandbox
  shared-memory/network restrictions required authorized test execution outside that sandbox.
- Tested core voting first, then PostgreSQL enrollment/floor/checkout and concurrency, then AI outputs.
- Real OCR exposed cross-line added-sugar parsing; corrected the parser and added a regression test.
- OFF category search returned 503; a documented alternative endpoint supplied real records.
- Ran real barcode decoding, real PaddleOCR, real Ollama standalone and through the actual API, and
  one live USDA record lookup. Version/timing/result evidence is in VERIFICATION.md.

### Integration choices and remaining scope

Added only necessary documented catalog/receiving, image scan, and recommendation routes. Existing
API JSON remains usable; new fields are additive. Preserved all `rd_confirm` metadata. No fake
clinical outcomes, model invocations, product data, or passing-test claims. Public deployment,
production hardening, and clinical sign-off remain clearly separated from tested demo functionality.

## 2026-11-14 — colleague integration

User requested safe status/save, fetch/compare, merge, conflict review, and backend verification.
Saved local work as f3684cc, fetched origin, and identified origin/main as the sole remote/default.
Explained 12 conflicts and incompatible response/clinical/seed behavior before consolidation.
Preserved incoming UI files, adapted alternate backend modules to one implementation, retained
both test suites, regenerated uv/requirements locks, and tested a clean Python 3.13 installation.
See MERGE_NOTES.md for decisions, compatibility changes, and 127-test verification evidence.

## 2026-11-14 — server account seed

User requested runnable server test accounts at epic.com and supplied the deployed API URL.
Added a separate, non-destructive `seed.accounts` command with a hidden password prompt,
preflight role/profile conflict checks, transaction/advisory-lock protection, Argon2 hashing,
full synthetic patient enrollment, and once-issued card output after commit. Existing passwords,
roles, disabled status, sessions, and inventory remain unchanged on reruns. Verified only public
health/OpenAPI remotely; account writes are left to the user-run server command. Added tests
covering nine logins, separate profiles, floor cards, no password reset, and atomic conflict handling.
