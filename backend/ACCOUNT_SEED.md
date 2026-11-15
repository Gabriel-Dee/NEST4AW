# Create server test accounts at epic.com

This command creates nine **application logins** and five synthetic patient profiles. It does
not create Gmail accounts or mailboxes, send email, replace old demo.local users, reset existing
passwords, change existing roles, reactivate disabled users, or modify stock/checkout records.
An existing address with a conflicting role or missing patient profile stops the transaction.

| Role | Login |
| --- | --- |
| admin | admin@epic.com |
| doctor | doctor@epic.com |
| warehouse_staff | staff@epic.com |
| community_partner | partner@epic.com |
| client | maria@epic.com |
| client | james@epic.com |
| client | asha@epic.com |
| client | luis@epic.com |
| client | helen@epic.com |

All newly created accounts use the password you enter at the hidden prompt (12–1024 characters).
It is hashed with Argon2 and is never printed. Existing accounts keep their current passwords.
The five patient profiles reuse the existing fictional personas and their distinct dietary flags.
Each new patient gets a floor card; its secret is printed once after the transaction commits.

## Existing Docker server

First copy `seed/accounts.py` into `/opt/nest4aw/backend/seed/accounts.py` on the server. From the
local machine holding this repository, for this deployment:

```bash
scp /Users/deoalbert/Developer/Nest4AW/backend/seed/accounts.py root@187.124.157.140:/opt/nest4aw/backend/seed/accounts.py
```

Then run on the server:

```bash
cd /opt/nest4aw/backend
docker compose cp seed/accounts.py api:/srv/backend/seed/accounts.py
docker compose exec api python -m seed.accounts --initialize
```

Enter and confirm the password when prompted. The command inherits the working API container's
PostgreSQL connection and encryption keys. `--initialize` applies the existing schema/reference
seed only if empty, plus idempotent migrations; it never drops the schema or invokes the product
seed. On an already initialized database, this simply verifies the rules and additive migration.
Copying the script into both the host source and container makes it available immediately and
includes it in the next image rebuild. No API restart is required for new accounts.

If API is not running yet, build the image from the updated source and use a one-off container:

```bash
docker compose up -d postgres
docker compose build api
docker compose run --rm --no-deps api python -m seed.accounts --initialize
```

This does not fix an unrelated failing seed service or start the API; inspect that service's
logs separately. Never delete a database volume to add accounts.

## Non-Docker or automated use

From `backend/`, with the same configured environment as the server:

```bash
python -m seed.accounts --initialize
```

Optional `--domain your-domain.example` changes the login suffix. For noninteractive use, provide
`ACCOUNT_SEED_PASSWORD` through your deployment's secret injection; do not put the password in a
CLI argument or commit it. The normal `SEED_PASSWORD` remains for the original demo.local seed.

## Verify

Use `POST /auth/login` with `admin@epic.com` and the password entered, then authorize protected
requests using the returned token. Each patient can call `/me/profile` and `/me/visits` only for
their own profile. Staff/admin can issue replacement cards with `/staff/reissue` if the once-issued
card secret was not saved. New accounts are immediately visible to the API because it checks
PostgreSQL on login.

The supplied deployment URL responded successfully at `/health` and exposes 30 OpenAPI paths.
That read-only check did not create accounts on the remote server. Use HTTPS before entering
real or reused passwords into the public web UI; the provided IP endpoint is HTTP.
