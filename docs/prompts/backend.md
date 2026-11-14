# Backend prompt

Paste this whole file into the chat that is working in `backend/`. Build only that folder. Leave `frontend/` and `mobile/` alone. When a route changes, update `docs/API.md` in the same change.

Read these files and treat them as the spec:

- `docs/PLAN.md`
- `docs/API.md`
- `docs/schema.sql`
- `docs/seed_reference.sql`
- `docs/golden.json`

Apply the schema and the reference seed as written. Do not add a second database, an ORM, or a vector service in this slice.

## Stack

Python 3.12, FastAPI, psycopg (version 3), Pydantic v2, uvicorn.

Auth libraries, which you must call:

- `pwdlib.PasswordHash.recommended()` for every password hash and verify. That uses Argon2. Do not hash passwords with SHA-256, MD5, or a hand-written function.
- `jwt.encode` and `jwt.decode` from PyJWT. Sign with HS256. Decode with `algorithms=["HS256"]` only. Reject the `none` algorithm. Access tokens last 8 hours and carry `sub`, `role`, and `email`.
- `fastapi.security.HTTPBearer` for the Authorization header.
- A dependency `require_role(*roles)` on every protected route. A missing role returns 403.

Postgres is the only database. Connection string `DATABASE_URL`. Keys `JWT_SECRET`, `PHI_KEY`, `HMAC_KEY`, and `FDC_API_KEY` come from the environment. Copy `.env.example` and do not commit `.env`.

CORS allows `http://localhost:5173` and `http://localhost:5174`.

Layout:

```
backend/
  pyproject.toml
  app/main.py
  app/db.py
  app/auth.py
  app/roles.py
  app/tier.py
  app/rules.py
  app/phi.py
  app/routes/
  seed/load.py
  tests/test_rules.py
  tests/test_tier.py
  tests/test_auth.py
  tests/test_checkout.py
```

`app/rules.py` and the scan and checkout routes must not import an HTTP client for a language model. Scan and checkout have to work with the model absent.

## Roles

The enum is already in the schema: `doctor`, `client`, `warehouse_staff`, `admin`, `community_partner`.

- Doctor: client create, read, update, token revoke, read rules. No checkout.
- Client: `GET /me/profile` and `GET /me/visits` only, plus auth routes. A client JWT cannot scan and cannot check out.
- Warehouse staff: floor board, lookup, reissue, lots, checkout. No client create. No report endpoint.
- Admin: user create, list, disable, role change, plus the doctor and staff routes, plus reports. Cannot delete ledger rows. No request field can set a verdict.
- Community partner: `GET /reports/dispensed` and auth routes. The query selects from `analytics_public` only.

There is no public self-signup. An admin creates staff, doctors, admins, and partners. A doctor creates a client, which also creates the client user.

Login failure text is always `invalid email or password`, including a disabled user and a wrong password.

## Identity and the floor card

Passwords are for people using the web app. The floor card is a different secret.

- Card raw value: `secrets.token_urlsafe(32)`.
- Store `hashlib.sha256(raw.encode()).digest()` in `enrollment_tokens.token_hash`.
- Return the raw value once, from create-client and from reissue.
- Names and phones: `pgp_sym_encrypt` with `PHI_KEY`.
- `name_hmac` is `hmac(lower(btrim(name)), HMAC_KEY, 'sha256')` in SQL. Staff lookup hashes the typed name the same way and returns a row only on equality.

The arrive payload and the scan payload contain tier and flags. They do not contain legal name, phone, or the ICD list.

## Tier

Derive booleans from ICD-10-CM, then the tier from the booleans.

- `E11.*` sets diabetes.
- `E10.*` and `E13.*` do not set a tier by themselves. Return a warning that a person must confirm the type.
- `I10`, `I11.*`, `I15.*` set hypertension.
- `I12.*` and `I13.*` set hypertension only. CKD still needs an N18 stage.
- `N18.30`, `N18.31`, `N18.32`, `N18.4` set CKD stage 3 or 4.
- `N18.1`, `N18.2`, `N18.9` do not.
- `N18.5` and `N18.6` return 422 `outside_matrix`. Do not invent a tier.
- `E11.22` sets diabetes only. Diabetic CKD still needs the stage code.

`tier_of(dm, htn, ckd34)` returns T1 diabetes, T2 hypertension, T3 CKD, T4 both diabetes and hypertension, T5 diabetes and CKD, T6 hypertension and CKD, T7 all three. Allergens sit beside the tier. They do not change the tier id.

A vague ICD allergy code never turns on one of the nine allergen flags. Those flags come only from the request list, limited to milk, eggs, fish, crustacean_shellfish, tree_nuts, peanuts, wheat, soybeans, sesame.

When flags change, update active sessions for that client in the same transaction.

## Rules engine

Load thresholds from the `rules` table by `rule_id` at startup. Refuse to serve if a required id is missing. Do not copy the numbers into a second constant.

Votes, then combine: red if any red vote, else yellow if any yellow vote, else unknown if any unknown vote, else green.

1. Unknown barcode or unknown internal code: verdict `unknown`, product null.
2. Person has an allergen and the product has neither tags nor ingredient text: unknown.
3. Tag intersection with the person's allergens, or the allergen word in the ingredient text: red, rule `ALG`. This beats a nutrient green.
4. If the person has diabetes or hypertension or CKD stage 3 or 4: missing sodium is unknown. Else `NA_G` at or under the table threshold, `NA_R` at or over the table threshold, otherwise `NA_Y`.
5. CKD and the ingredients contain `potassium chloride`: red, `K_SALT`. Do not match the word salt alone.
6. `k_limit_ordered`: missing potassium is unknown. At or over the `K_ORDER` threshold is red. Under it adds no potassium color.
7. CKD without that order: `K_DEFAULT` adds no color, including bananas, potatoes, and beans.
8. CKD and ingredients match `phosphate`, `phosphoric`, or `pyrophosphate`: yellow, `P_ADD`.
9. CKD and phosphorus is null: yellow, `P_MISS`.
10. Diabetes and (`is_drink` or `is_juice`): red, `SUG_DRINK`, even when sodium is 0.
11. Diabetes and not a drink: missing added sugar is unknown. Under the `SUG_G` threshold is a green vote. At or over `SUG_Y` is yellow. The words on the package never enter this function.
12. Diabetes and a non-null GI at or over `GI_Y`: yellow. Null GI adds nothing (`GI_MISS`).
13. Carbohydrate never votes (`CARB`).
14. Fiber at or over `FIBER_RANK` sets `fiber_rank_bonus` and does not vote.
15. Potassium rank is a sort key only when the person has hypertension, does not have CKD stage 3 or 4, and does not have a potassium order (`K_RANK`). Hypertension plus CKD with no order does not rank potassium.

Return the rule ids that voted, with the source text from the table.

Protein is counseling only. Do not add a protein color. Household size is returned as a number. Do not invent pounds per person.

## Floor SQL

One transaction. Hold the lock the whole time.

```sql
BEGIN;
SELECT pg_advisory_xact_lock(861104);

UPDATE sessions SET status = 'expired'
WHERE status = 'active' AND lease_expires_at <= now();

WITH lim AS (
  SELECT max_floor, lease_minutes FROM warehouse_limits
), free AS (
  SELECT GREATEST(0,
    (SELECT max_floor FROM lim)
    - (SELECT COUNT(*) FROM sessions WHERE status = 'active')
  ) AS n
)
UPDATE sessions SET status = 'active',
  lease_expires_at = now() + make_interval(mins => (SELECT lease_minutes FROM lim))
WHERE id IN (
  SELECT id FROM sessions
  WHERE status = 'queued'
  ORDER BY queued_at, id
  LIMIT (SELECT n FROM free)
);
-- still holding the lock: admit this arrival as active when active < max_floor,
-- else as queued when queued < max_queue, else insert nothing
COMMIT;
```

Seed limits are 25, 15, and 30 minutes.

## Checkout SQL

Re-run the verdict on every cart line first. If any line is red or unknown, roll back and return `red_in_cart` before any stock update.

```sql
BEGIN;
SELECT verdict FROM cart_lines
WHERE session_id = $2
FOR UPDATE;

SELECT id FROM products WHERE id = $1 FOR UPDATE;

WITH nxt AS (
  SELECT id FROM lots
  WHERE product_id = $1 AND qty > 0 AND expires_on > CURRENT_DATE
  ORDER BY arrived_on, expires_on, id
  LIMIT 1
  FOR UPDATE
)
UPDATE lots SET qty = qty - 1
FROM nxt
WHERE lots.id = nxt.id AND lots.qty >= 1
RETURNING lots.id, lots.grant_id, lots.product_id;
-- zero rows: roll back, out_of_stock
-- else insert checkout_ledger from the returned lot, the session tier, and the grant
COMMIT;
```

A lot that expires today does not sell. `soon_to_expire` is true when `expires_on` is after today and within 7 days. That flag does not block the sale. The phone's cached color is ignored.

## Food data

Two sources, both free:

- USDA FoodData Central, `https://api.nal.usda.gov/fdc/v1/`. Official US nutrients. Use it for produce with no barcode and to fill nutrients. Search and detail calls send `api_key` from `FDC_API_KEY`. Read nutrient names (sodium, potassium, phosphorus, carbohydrate, fiber, sugars added, serving size). Do not guess nutrient id numbers. Branded values are per 100 g. Store per serving: `value_per_100g * serving_g / 100`.
- Open Food Facts, `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`. Real barcodes, ingredients, and allergen tags. No API key. Send `OFF_USER_AGENT`. The database is under the Open Database License, so store a credit on the product row. Skip photos.

Join on the barcode. Prefer a labeled serving. If an Open Food Facts unit is grams for sodium, potassium, or phosphorus, multiply by 1000 to store milligrams. If the unit is missing, leave the nutrient null.

Map Open Food Facts allergen tags onto the nine codes: `en:milk`, `en:eggs`, `en:fish`, `en:crustaceans`, `en:tree-nuts`, `en:peanuts`, `en:gluten` as wheat, `en:soybeans`, `en:sesame`.

Always load `docs/golden.json` first so the 30 cases exist offline. Then, when `FDC_API_KEY` is set, pull more products until the table has at least 100. The finished table must include a sodium value at or over 460, a sodium value at or under 140, a sugar-sweetened drink, a fruit juice, a phosphate additive, a high-potassium produce item, and one real item for each of the nine allergens. If a class is missing, print which class and exit non-zero. Do not invent a nutrient to fill the gap.

Whole produce with no ingredient list stores added sugar 0 and `added_sugar_assumed` true. That assumption is marked for a dietitian in the golden file.

Lots: many products get one lot expiring within 7 days, one later lot, and one lot already expired. Keep quantities small enough that two sales can hit zero. Produce lots use grant A. Staple lots use grant B.

Seed users, password from `SEED_PASSWORD`, default `nest-local-demo`:

- `admin@demo.local` admin
- `doctor@demo.local` doctor
- `staff@demo.local` warehouse_staff
- `partner@demo.local` community_partner
- the five personas in `docs/golden.json` as clients, with their ICD codes, allergens, and potassium-order flag

Print the five raw card tokens once. They are demo secrets for a fictional pantry.

## Tests

`pytest` must pass before you call the slice done.

- Every persona and food in `docs/golden.json` returns the expected verdict. That is 30 cases. Zero cases may be green when the file says yellow, red, or unknown.
- `tier_of` and the ICD mapping, including N18.5 rejected and E11.22 not setting CKD by itself.
- Hypothesis: no sodium at or over the red threshold is green for diabetes, hypertension, or CKD. No allergen hit is green. Juice is never green for diabetes even when sodium is 0. Potassium changes nothing unless the order flag is on, and then a value at or over the order threshold is never green. A phosphate ingredient is never green for CKD. Null sodium is never green for those three conditions. One red vote makes the item red. An expired lot is never the row checkout updates. After any decrements, quantity is at least 0.
- Auth: each role gets 403 on a route it does not own. Partner JSON has only day, tier_id, grant_id, units, pounds. Password hashes verify through pwdlib and are not the raw password. A JWT with a bad signature or `alg` none is 401.
- Checkout: a lot of quantity 1 sells once. The second sale returns `out_of_stock` and the quantity stays 0. A red line sells nothing.

## Done when

`GET /health` is ok. A doctor can enroll Maria and receive a token. Arrive with that token returns T4 and no name. Scan of the banana internal code is green for James and red for Luis. Scan of the juice is red for Maria while sodium is 0. Staff checkout cannot drive quantity below 0. Partner cannot read `/clients`. The 30 cases pass.

Leave recipes, `docs/schema_recipes.sql`, embeddings, and Ollama until that list is true.

## Clinical hold

Do not describe the server as HIPAA compliant. Do not hide `rd_confirm` on rule rows. The potassium-order flag on Luis is a test switch. A dietitian has to agree before a real person carries it.
