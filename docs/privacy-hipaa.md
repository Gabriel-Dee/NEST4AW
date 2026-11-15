# Privacy and HIPAA notes

Status: **HIPAA-aware prototype. Not HIPAA compliant.** This is a hackathon build for Epic Cure. It
handles health data carefully in code, but it lacks the legal, operational and infrastructure
safeguards that HIPAA requires. Use only synthetic or consenting test data until the gaps below are closed.

Audited 2026-11-14 against the `backend` branch (`backend/app/...`).

## 1. What the AI model sees

The model is open source (`qwen2.5:1.5b`) and runs on **Ollama on the same machine as the API**
(`OLLAMA_URL=http://127.0.0.1:11434`, or the `ollama` container in `compose.yaml` with
`OLLAMA_NO_CLOUD=1`). Prompts do not go to a third-party AI service.

The model only suggests recipes. It never decides whether food is safe: every product it picks is
checked again by the deterministic rules engine (`backend/app/rules.py`), and any unsafe or unknown
ID throws out the whole answer.

There are two code paths that call the model. Both send the same kind of data.

### Recipes: `backend/app/services/recipes.py`

`build_context()` + `context_for()` → `ollama_propose()`, called from `backend/app/routes/recipes.py`.

| Field sent | Example | Personal? |
|---|---|---|
| `mode` | `"cart"` / `"profile"` | no |
| `household_size` | `3` | low |
| `clinical.dm`, `htn`, `ckd34`, `k_limit_ordered` | `true/false` | **health data** (derived flags, not ICD-10 codes) |
| `clinical.allergens` | `["peanuts","tree_nuts"]` | **health data** |
| `products[]`, `cart[]` | `{id, name, category}` for up to 40 catalog items | no (catalog) |
| `pantry_staples` | fixed list | no |
| `limits[]` | rule text such as "sodium green at or below 140 mg" | no |

### Shopping proposal: `backend/app/routes/ai.py` → `backend/app/services/llm.py`

`profile` = `dm, htn, ckd34, k_limit_ordered, allergens, household_size`; `rules` (the public
rule matrix); `candidates` (catalog products with nutrients, stock and bin); `cart` (product IDs and quantities).

### Never sent to the model

Name, phone, email, client ID, user ID, visit or session token, store or GPS location, date of
birth, ICD-10 codes, card numbers. `client_id` is used only on the server to key the recipe cache.
Nothing needed stripping.

Under HIPAA, condition flags plus allergens are health information, but without identifiers they
are hard to link back to a person. They also never leave the server.

## 2. Storage at rest (PostgreSQL, `docs/schema.sql`)

| Data | How it is stored |
|---|---|
| Legal name (`clients.legal_name_enc`) | pgcrypto `pgp_sym_encrypt` with `PHI_KEY` |
| Phone (`clients.phone_enc`) | pgcrypto `pgp_sym_encrypt` with `PHI_KEY` |
| Name lookup (`clients.name_hmac`) | HMAC-SHA256 with `HMAC_KEY`, so staff can search without decrypting |
| Passwords (`users.password_hash`) | hashed |
| Card / enrollment / visit tokens | stored as hashes only |
| **ICD-10 codes (`conditions.icd10`)** | **plaintext** |
| **Allergens (`client_allergens.code`)** | **plaintext** |
| **Condition flags (`clients.dm/htn/ckd34/k_limit_ordered`, `tier_id`)** | **plaintext** |
| **Email (`users.email`)** | **plaintext** (it's the login) |
| Cart, visits, check-in store and time | plaintext, linked to client ID |

Disk or volume encryption depends on the host. It is not configured by this repo.

## 3. Transport

- **The live demo host serves plain HTTP. There is no TLS**, so tokens, names and health data
  cross the network unencrypted. The local dev setup is also HTTP on the LAN (`10.x.x.x:8001`).
- The browser app keeps the JWT in `sessionStorage`; the mobile app keeps it in the iOS
  Keychain / Android Keystore via `expo-secure-store`.
- CORS is limited to the configured origins (`CORS_ORIGINS`).

## 4. Access control

- JWT bearer auth (8-hour tokens). Each route requires a role (`client`, `warehouse_staff`,
  `doctor`, `community_partner`, `admin`).
- Clients see only their own profile, visits and cart (queries filter on the token's user).
- Shopping and scanning also need a short-lived visit token tied to a check-in.
- Staff and doctor roles can read client PHI on their screens. There is no per-record
  "minimum necessary" restriction beyond the role.

## 5. Logging

- App logs record only the exception type (`backend/app/main.py`), not request bodies.
- Uvicorn's access log records URL paths and query strings. `/stores?lat=..&lng=..` therefore
  logs the shopper's approximate location next to their IP. No names or conditions are in URLs.
- **There is no audit log** of who viewed or changed which client's record.

## 6. Gaps before real patient data

1. **TLS everywhere** (reverse proxy with HTTPS, HSTS), plus TLS to Postgres if it runs on another host.
2. **A Business Associate Agreement** between Epic Cure and every vendor that hosts or touches PHI
   (cloud host, database, backups, tunnel provider). None exist today.
3. **An audit log** of PHI reads and writes (who, what record, when), kept and reviewed.
4. Encrypt `conditions`, `client_allergens` and the condition flags at the column level, or at
   least turn on encrypted volumes and backups.
5. Key management: `PHI_KEY`/`HMAC_KEY` live in `.env`. Move them to a secrets manager and plan rotation.
6. Scrub or turn off query-string logging; set log retention.
7. Minimum-necessary access for staff (show only what the task needs), session timeout, MFA for staff and admins.
8. Written HIPAA risk assessment, breach-response plan, workforce training, and data retention and deletion policy.
9. Consent and notice for clients: what is collected, why, and that an AI helps with recipes only.

## 7. Plain-language summary

The AI never sees who you are. It gets only "has diabetes: yes/no", allergies, household size and a
list of store products, and it runs on Epic Cure's own server. Names and phone numbers are encrypted
in the database. Diagnosis codes, allergies and emails are not, and the live demo server doesn't use
HTTPS yet. That makes this a careful prototype, not a HIPAA-compliant system.
