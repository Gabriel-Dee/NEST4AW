# NEST4AW

Medically tailored grocery lane for the UNF NestforAwhile challenge. The open choice line at Epic Cure stays as it is. This repo is the second lane: a card, a rules color, and a checkout that cannot sell a red item or drive stock below zero.

## Who builds what

| Person | Folder | Paste this into their chat |
| --- | --- | --- |
| Backend | `backend/` | `docs/prompts/backend.md` |
| Frontend | `frontend/` | `docs/prompts/frontend.md` |
| Mobile aisle phone | `mobile/` | `docs/prompts/mobile.md` |

Shared plan: `docs/PLAN.md`. HTTP contract: `docs/API.md`. Tables: `docs/schema.sql`. The 30 expected colors: `docs/golden.json`.

Work on a branch named `backend`, `frontend`, or `mobile`. Merge to `main` the same day. If a route changes, change `docs/API.md` in that same commit.

## Safety the whole team keeps

The server computes green, yellow, and red. The browser and the phone only display it. No role can override a red. Names and phones are encrypted. The partner report has day, tier, grant, units, and pounds.

Postgres is the database. Auth uses `pwdlib` (Argon2) and PyJWT. Roles are doctor, client, warehouse staff, admin, and community partner. Food data comes from USDA FoodData Central and Open Food Facts.

## Local demo logins

After the backend seed, password `nest-local-demo`:

`admin@demo.local`, `doctor@demo.local`, `staff@demo.local`, `partner@demo.local`, and the five fictional clients in `docs/golden.json`.

Copy `.env.example` to `.env` before seeding. Do not commit `.env`.

## Contest

Public repo. Free tools. Submit by 9:00 AM on 15 November 2026 at https://bit.ly/26NestforAwhileSol. A dietitian has not signed the color matrix. Do not call this HIPAA compliant.
