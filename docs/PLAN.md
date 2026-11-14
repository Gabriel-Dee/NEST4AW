# NEST4AW build plan

Epic Cure runs an open choice line with no account. Medically tailored groceries are a second lane. This repo is that second lane: a warehouse dispenses food with a color that comes from a rules table in Postgres.

Green, yellow, and red are a record. A language model may later rank items and rewrite recipe steps. It never sets the color. Scan and checkout must work when the model is off.

A dietitian has not signed the matrix. A lawyer has not said whether this pantry is a HIPAA covered entity. Encrypt names and phones anyway. Do not call the build HIPAA compliant.

## Team split

| Person | Folder | Prompt |
| --- | --- | --- |
| Backend | `backend/` | `docs/prompts/backend.md` |
| Frontend (kiosk, staff, doctor, partner) | `frontend/` | `docs/prompts/frontend.md` |
| Mobile (aisle phone) | `mobile/` | `docs/prompts/mobile-app.md` |

The contract all three share is `docs/API.md`. The tables are `docs/schema.sql`. The 30 expected colors are `docs/golden.json`.

Each person works on a branch named after their folder and merges to `main` the same day. A route change updates `docs/API.md` in that same change.

## Roles

Login is email plus password. Passwords are hashed with Argon2 through `pwdlib`. Sessions for staff, doctors, admins, and partners are signed JWTs through PyJWT. The floor card is a separate random token, stored only as a SHA-256 hash.

| Role | May do |
| --- | --- |
| Doctor | Create a client, record ICD-10-CM codes, set condition flags and the nine allergen flags, issue or revoke a card token. Sees name and phone on the enrollment screen. Cannot set a color. Cannot check out. |
| Client | Sign in and see their own card status and their own visits. The aisle phone uses the card token, not this password. |
| Warehouse staff | Floor board, checkout, lot counts, exact-name card reissue. The aisle payload has tier and flags, not the legal name. |
| Admin | Create the other accounts, disable an account, edit floor limits, read rules, read reports. Cannot force a green. Cannot delete a ledger row. |
| Community partner | Read the de-identified report: day, tier, grant, units, pounds. No names, tokens, or ICD codes. |

No role gets a "give it anyway" button.

## Color

The engine reads thresholds from the `rules` table. One red vote makes the item red. Else any yellow vote makes it yellow. Else any missing required value makes it unknown. Else it is green. Unknown blocks the cart the same way red does.

Sodium, on a diabetes, hypertension, or CKD stage 3 or 4 profile, uses the labeled serving: green at 140 mg or under, yellow from 141 through 459, red at 460 or over. Daily guidance under 2300 mg is context for that band, not a second scan.

Potassium does not change color for ordinary CKD. A recorded potassium limit makes 200 mg or more per serving red. Potassium chloride in the ingredients is red for CKD stage 3 or 4. Hypertension plus CKD with no order does not rank potassium.

Phosphate, phosphoric, or pyrophosphate in the ingredients is yellow for CKD stage 3 or 4. Missing phosphorus on that profile is yellow. The FDA phosphorus daily value is not a CKD cap.

A drink or juice is red on any diabetes tier, including when sodium is 0. Other added sugar under 0.5 g is a green vote and 0.5 g or more is yellow. Total carbohydrate never colors. Fiber only sorts. A stored GI of 70 or more is yellow on diabetes, and a missing GI adds nothing.

An FDA allergen hit is red and beats a nutrient green. The nine flags are milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, and sesame. A vague allergy ICD code does not turn a flag on. A missing ingredient list, when the person has an allergen, is unknown.

An unknown barcode is unknown. A package claim such as "sugar free" never sets the color.

Tiers come from flags, not from showing the ICD string to the phone:

- T1 diabetes
- T2 hypertension
- T3 CKD stage 3 or 4
- T4 diabetes and hypertension
- T5 diabetes and CKD stage 3 or 4
- T6 hypertension and CKD stage 3 or 4
- T7 all three

N18.5 and N18.6 stay off this matrix. Stage 5 and dialysis need a different protein pattern, so enrollment stops for automatic tiering.

Household size is stored. Pounds per person are not invented.

## Floor and stock

The count of people on the floor is a query. The cap is 25 on the floor and 15 waiting. A session lease is 30 minutes. Those three numbers are seed values in `warehouse_limits`. Expire old sessions, promote the queue, then admit the arrival, inside one transaction that holds `pg_advisory_xact_lock(861104)`.

Checkout locks the cart, re-runs the rules, and stops before any stock change when a line is red or unknown. It then locks the product and the oldest unexpired lot, and decrements only when quantity is at least 1. A lot that expires today does not sell. A lot inside 7 days is a warning flag, not a block. Quantity cannot go below 0.

## Food data

USDA FoodData Central supplies official US nutrients, including produce that has no barcode. Open Food Facts supplies real barcodes, ingredient text, and allergen tags. Join them on the barcode. Branded FDC values are per 100 g, so per serving is `value_per_100g * serving_g / 100`. The golden file already has that conversion for the demo foods.

Open Food Facts is under the Open Database License. Credit it. FoodData Central is a US government work. Skip product photos.

The first 100 products can load after the 30 golden cases pass. The cases themselves use `docs/golden.json` and do not need the network.

## What is later

Recipes, pgvector, and a local Ollama model wait until the public path can check a card in, paint a server color, and refuse a second sale of the last unit. The model on the demo laptop is Qwen2.5 3B. Every suggested food is checked by this same engine before it is shown. If the model fails, the stored recipe text is what the screen shows.

## Demo accounts

After the backend seed, these emails use the password in `SEED_PASSWORD` (default `nest-local-demo`):

- `admin@demo.local`
- `doctor@demo.local`
- `staff@demo.local`
- `partner@demo.local`
- `maria@demo.local`, `james@demo.local`, `asha@demo.local`, `luis@demo.local`, `helen@demo.local`

The five people are fictional. The seed prints each card token once. There is no real patient data in this repo.
