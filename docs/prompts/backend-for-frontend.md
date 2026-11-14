# Backend prompt for the frontend

You are building the API that the web app (`frontend/src/lib/api.ts`) and the Expo phone (`mobile/services/api.ts`) will call. Implement this contract. Do not rename fields. The clients will turn off their mocks and point at this base URL. If a field name here differs from a name you already used, this file wins.

Postgres only. Passwords go through `pwdlib` (Argon2). Staff and client sessions are JWTs from PyJWT, HS256 only. The rules engine sets every `status.level`. A model may write recipe steps. It never sets green, yellow, or red. Scan, cart, check-in, and checkout must work when the model is down.

Base URL: `http://localhost:8000`

Every path below is prefixed with `/api/v1`.

## Errors

Failure body, always:

```json
{ "error": { "code": "not_at_store", "message": "You're 2.1 km away. Check in when you arrive." } }
```

`401` bad or missing token. `403` wrong role. `404` unknown id. `409` the floor, the geofence, the cart, or the stock refused. `422` the body is invalid or the condition is outside the matrix (`N18.5`, `N18.6`).

## Three credentials

Send the one the route asks for. Do not mix them up.

| Header | What it is | Who holds it |
| --- | --- | --- |
| `Authorization: Bearer <access_token>` | Account login. 8 hours. Claims `sub`, `role`. | Client app, staff site, admin site. Never the kiosk check-in screen. |
| `X-Visit-Token: <visit_token>` | This trip inside one store. Dies when they leave or the lease ends. | Phone after check-in. Kiosk success screen. Staff checkout. |
| `X-Kiosk-Code: <kiosk_code>` | Which tablet, which store. Saved on the tablet after first-run setup. | Kiosk only. |

Roles stay `doctor`, `client`, `warehouse_staff`, `admin`, `community_partner`.

A kiosk check-in screen has no email form. Staff and admin log in on a separate page.

## Shared types

Use these names in JSON.

```ts
type StatusLevel = "green" | "yellow" | "red";
type Status = { level: StatusLevel; label: string; reason: string | null; limit_qty: number | null };
type Location = { aisle: string; shelf: number; bin: number; label: string };
type Product = {
  id: string; sku: string; name: string; category: string; image_url: string | null;
  location: Location | null; in_stock: number;
};
type Store = {
  id: string; name: string; address: string;
  lat: number; lng: number; geofence_radius_m: number;
  hours: { day: string; open: string; close: string }[];
  max_capacity: number; on_floor: number; waiting: number; is_open: boolean;
  kiosk_codes?: string[];
};
```

`location.label` is the sentence the UI prints, for example `Aisle B · Shelf 2 · Bin 4`. `shelf` and `bin` are numbers.

Status labels the UI will show as-is:

- green: `label` = `Great choice`, `reason` may be a short kind line, `limit_qty` = null
- yellow: `label` = `Limit to N` where N is `limit_qty`
- red: `label` = `Not for you today`, `reason` required (example `High sodium – 890mg`), `limit_qty` = null

The server fills those from the rules table. The clients will not recompute them.

`category` is one of `Produce`, `Proteins`, `Dairy`, `Grains`, `Pantry`.

## Auth and registration

### `POST /api/v1/auth/register`

No token. One call after the phone collects every step. Body:

```json
{
  "email": "maria@demo.local",
  "password": "nest-local-demo",
  "first_name": "Maria",
  "last_name": "G",
  "phone": "555-0100",
  "household_size": 3,
  "conditions": ["type_2_diabetes", "hypertension"],
  "allergies": [],
  "consent": true
}
```

`conditions` may include `type_2_diabetes`, `hypertension`, `ckd_stage_3_4`. Map those to the existing `dm`, `htn`, `ckd34` flags and a tier T1–T7. Do not set a color here. `allergies` is only the nine codes: `milk`, `eggs`, `fish`, `crustacean_shellfish`, `tree_nuts`, `peanuts`, `wheat`, `soybeans`, `sesame`. `consent` must be true or return `422`.

`N18.5` and `N18.6` are not in this self-serve list. A doctor still records ICD codes on the staff site. A potassium-limit flag is doctor-only. Self-serve never turns it on.

Response `201`:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 28800,
  "role": "client",
  "client": {
    "id": "...",
    "first_name": "Maria",
    "household_size": 3,
    "plan_badge": "Heart & Kidney Friendly",
    "conditions_label": "Type 2 Diabetes + Hypertension",
    "tier_id": "T4",
    "client_code": "482913",
    "allergies": []
  }
}
```

`client_code` is the short keypad code for the kiosk. It is not the visit token and not the QR secret. Return it on register and on `GET /auth/me`. The logged-in client must be able to read it again so the phone can show it.

### `POST /api/v1/auth/login`

Body `{ "email", "password" }`. Same `401` text for unknown email, bad password, and disabled user: `invalid email or password`.

Response:

```json
{ "access_token": "...", "token_type": "bearer", "expires_in": 28800, "role": "warehouse_staff" }
```

Clients get the same shape plus `client` as in register. Staff and admin do not get a client object.

### `GET /api/v1/auth/me`

Account token. `{ "id", "email", "role", "client": null | Client }`. `client` is present only for role `client`.

### `POST /api/v1/auth/change-password`

Account token. `{ "current_password", "new_password" }`. New password length at least 8.

### Staff users, still required

Account token, admin.

- `POST /api/v1/admin/users` `{ "email", "password", "role", "store_id" }`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:id` `{ "disabled" }` or `{ "role" }` or `{ "store_id" }`

`warehouse_staff` has one `store_id`. `admin` may pass a store id later to switch. Do not create clients here.

## Stores, kiosk binding, check-in

Seed at least one store: Epic Cure – St. Augustine Warehouse, with lat/lng in St. Augustine, a geofence radius in meters, hours, and `max_capacity` 25. The floor cap and the queue cap still come from the warehouse limits (25 on the floor, 15 waiting, 30 minute lease) and they are per store.

### `GET /api/v1/stores?lat=&lng=`

Account token, role client. Stores sorted by distance from the coordinates. Each store includes `distance_m`, `is_open`, `on_floor`, `waiting`, `max_capacity`. Do not include `kiosk_codes`.

### `GET /api/v1/stores/nearest?lat=&lng=`

Account token. The closest store, plus `distance_m` and `inside_geofence: true|false`.

### `GET /api/v1/stores/:id`

Account token. One store. `kiosk_codes` only when the caller is admin.

### `GET /api/v1/admin/stores`

Admin. All stores, including `kiosk_codes`.

### `POST /api/v1/admin/stores` and `PATCH /api/v1/admin/stores/:id`

Admin. Body may set `name`, `address`, `lat`, `lng`, `geofence_radius_m`, `hours`, `max_capacity`.

### `POST /api/v1/kiosks/setup`

First-run on the tablet. Body `{ "pin", "store_id" }`. The pin matches a staff or admin kiosk pin (seed one pin per store in env, not in git). Response `{ "kiosk_code", "store": { "id", "name" } }`. The tablet stores `kiosk_code` locally. This is the only kiosk call that takes a pin. Later check-in calls send `X-Kiosk-Code` and no login form.

### `GET /api/v1/kiosks/me`

Header `X-Kiosk-Code`. Response `{ "store": { "id", "name" } }`. Unknown code is `401`.

### `GET /api/v1/me/checkin-qr`

Account token, role client. Response `{ "token", "expires_in": 60 }`. A new call replaces the previous token. The phone shows this QR when GPS is off.

### `POST /api/v1/visits/check-in`

Phone. Account token. Body:

```json
{ "store_id": "...", "lat": 29.89, "lng": -81.31 }
```

Enabled path: the coordinates are inside that store's geofence and the store `is_open`. Then run the floor transaction for that store (expire leases, promote the queue, admit) under the per-store advisory lock.

Responses:

- Active: `{ "status": "active", "visit_token": "...", "queue_position": null, "store": Store }`
- Queue: `{ "status": "queued", "visit_token": "...", "queue_position": 3, "eta_min": 6, "store": Store }`
- Already inside this store: `{ "status": "already_checked_in", "visit_token": "...", "store": Store }`
- Outside the fence: `409` code `not_at_store`, and `error.distance_m`
- Closed: `409` code `store_closed`
- Full floor and full queue: `409` code `floor_full`, message `please see a volunteer`
- Bad or expired account: `401`

`eta_min` may be `queue_position * 2`. Label it as an estimate.

### `POST /api/v1/kiosk/check-in`

Header `X-Kiosk-Code`. Body is one of `{ "qr_token": "..." }` or `{ "client_code": "482913" }`. Same response statuses as visit check-in. Method stored on the visit is `kiosk`. Geofence is not required. A bad code is `404` code `not_found`. An expired QR is `401` code `expired`. Message for both: `please see a volunteer`. Already checked in returns `already_checked_in`.

### `POST /api/v1/stores/:id/check-in`

Staff or admin account token. The staff member's store must match `:id` unless the caller is admin. Body `{ "client_id" }` or `{ "client_code" }`. Method stored is `staff`. Same response shape. This is the manual override.

### `GET /api/v1/visits/current`

Header `X-Visit-Token`, or account token for the client who owns the visit. Response is the visit object or `404` when there is none.

```json
{
  "visit_token": "...",
  "status": "active",
  "queue_position": null,
  "store": { "id": "...", "name": "Epic Cure – St. Augustine Warehouse" },
  "started_at": "2026-11-14T15:00:00Z"
}
```

### `POST /api/v1/visits/leave`

Header `X-Visit-Token`. Sets the visit closed. Response `{ "ok": true }`.

### `GET /api/v1/stores/:id/floor`

Header `X-Kiosk-Code` for that store, or staff/admin account token scoped to that store.

```json
{
  "on_floor": 18,
  "max_capacity": 25,
  "waiting": 3,
  "shoppers": [
    { "first_name": "Maria", "started_at": "2026-11-14T15:00:00Z", "method": "geofence" }
  ],
  "queue": [
    { "position": 1, "first_name": "James", "method": "kiosk" }
  ]
}
```

`method` is `geofence`, `kiosk`, or `staff`. No last name, no phone, no ICD, no client id on this payload. The kiosk widget only needs the three counts. Staff may use the lists.

## Shopping while a visit is active

All of these require `X-Visit-Token`. The visit's tier and flags are the rules input. Do not accept a color from the client.

### `GET /api/v1/recommendations`

```json
{ "products": [ { "product": {}, "status": {}, "nutrients": {}, "suggested_qty": 3 } ] }
```

`nutrients` is `{ "sodium_mg", "sugar_g", "potassium_mg", "carbs_g" }`. Null stays null. `suggested_qty` is the household count for green, and the same number as `status.limit_qty` for yellow. `product` is the Product type above.

### `POST /api/v1/scan`

Body `{ "sku": "BEANS" }` or `{ "barcode": "00041196419429" }`.

Known item:

```json
{
  "product": {},
  "status": { "level": "green", "label": "Great choice", "reason": null, "limit_qty": null },
  "nutrients": { "sodium_mg": 140, "sugar_g": 0.3, "potassium_mg": 370, "carbs_g": 20 },
  "suggested_qty": 3,
  "goes_great_in": { "recipe_id": "...", "title": "Black Bean & Brown Rice Bowl" }
}
```

`goes_great_in` is null when no current recipe uses that product. Unknown code:

```json
{ "product": null, "status": null }
```

Never a green status for an unknown code.

### `POST /api/v1/cart/lines`

Body `{ "product_id": "..." }`. Header `X-Visit-Token`. Green and yellow only. Red or unknown returns `409` code `not_eligible` and does not insert a line.

### `DELETE /api/v1/cart/lines/:product_id`

Header `X-Visit-Token`.

### `GET /api/v1/cart`

Header `X-Visit-Token`.

```json
{
  "lines": [ { "product": {}, "status": {}, "qty": 1 } ],
  "great": 8,
  "limit": 1,
  "points": 6
}
```

`points` counts green lines added plus one if they saved a recipe this visit. Red lines are not in the cart. Do not subtract points.

### `POST /api/v1/checkout`

Staff or admin account token, plus the visit. Body `{ "visit_token": "..." }`. Re-run the rules on every line first. Any red or missing status rolls back with `409` code `red_in_cart` and changes no quantity. Stock decrement stays the existing Postgres transaction: lock the cart, lock the product, take the oldest lot with `expires_on` after today, decrement only when quantity is at least 1. A second sale of the last unit is `409` code `out_of_stock`.

Response:

```json
{
  "visit_id": "...",
  "store_name": "Epic Cure – St. Augustine Warehouse",
  "lines": [ { "name": "Brown rice", "qty": 1, "status": {} } ],
  "recipes": []
}
```

`recipes` has one or two Recipe objects for today's groceries, or an empty array when the model and the library both fail. The sale still commits.

## Recipes

Copy this type. Do not rename a field.

```ts
type Ingredient = {
  product: Product | null; name: string; amount: string; in_cart: boolean;
  status: Status | null; location: Location | null;
};
type Recipe = {
  id: string; title: string; description: string; time_min: number; servings: number;
  difficulty: "easy" | "medium"; tags: string[]; why_good_for_you: string;
  ingredients: Ingredient[]; uses_from_cart: string[];
  missing_ingredients: { product: Product; status: Status }[];
  steps: string[];
  nutrition_per_serving: {
    calories: number; carbs_g: number; sugar_g: number;
    sodium_mg: number; potassium_mg: number; phosphorus_mg: number;
  };
  pantry_staples_assumed: string[];
  source: "ai" | "library";
};
type RecipeResponse = { mode: "profile" | "cart"; source: "ai" | "fallback"; recipes: Recipe[] };
```

Before a recipe is returned, every ingredient product is run through the rules engine for this client. A red ingredient is removed from `missing_ingredients`. If a required ingredient is red, drop that recipe. If the model times out, returns bad JSON, or every model recipe drops, return `source: "fallback"` and `Recipe.source: "library"` from the seeded collection. The client shows no error in that case.

`uses_from_cart` is product ids that are both in the recipe and in the active visit cart. `in_cart` on an ingredient matches that. Profile mode (no visit) sets `in_cart` false and `uses_from_cart` to `[]`.

### `GET /api/v1/recipes/for-me`

Account token. No visit required. Response `RecipeResponse` with `mode: "profile"`.

### `POST /api/v1/recipes/from-cart`

Header `X-Visit-Token`. Response `RecipeResponse` with `mode: "cart"`. Empty cart still returns `200` and `recipes: []`.

### `GET /api/v1/recipes/:id`

Account token, or visit token. One `Recipe`. `404` if the caller should not see it.

### `POST /api/v1/recipes/saved`

Account token. Body `{ "recipe_id": "..." }`. Response `{ "saved": true }`.

### `DELETE /api/v1/recipes/saved/:id`

Account token.

### `GET /api/v1/recipes/saved`

Account token. `{ "recipes": [] }`. This list survives after they leave the store.

### `GET /api/v1/recipes/library?tag=&search=`

Staff or admin. Seeded fallback recipes. Return:

```json
{ "recipes": [ { "recipe": {}, "passes": ["type_2_diabetes", "hypertension", "ckd_stage_3_4"] } ] }
```

`passes` lists which condition checks the rules engine cleared for that seeded recipe. The UI will not compute this.

### `GET /api/v1/clients/:id/recipes/saved`

Staff or admin. Body of the response:

```json
{ "client": { "first_name": "Maria", "tier_id": "T4" }, "recipes": [] }
```

No phone, no last name, no ICD list.

### `GET /api/v1/clients/:id/recipes/for-me`

Staff or admin preview of what `for-me` would return for that client. `RecipeResponse` plus `client: { "first_name", "tier_id" }`.

### `GET /api/v1/recipes/eval-report`

Admin.

```json
{
  "runs": 0,
  "restricted_ingredients": 0,
  "fallback_rate": 0,
  "avg_seconds": 0,
  "personas": [],
  "failures": []
}
```

When runs exist, fill `personas` with `{ "name", "tier_id", "passed", "fallback" }` and `failures` with `{ "at", "persona", "what", "handled" }`. `restricted_ingredients` counts model recipes that still contained a red item after the rules check. The target is 0. Do not invent a pass rate you did not run.

## Store-scoped staff tools

Staff calls are limited to their `store_id`. Admin may pass `?store_id=`. Omitting it as admin means all stores, and only on the report.

### `POST /api/v1/session/store`

Admin. Body `{ "store_id": "..." }`. Response `{ "store": Store }`. Staff who post a different store get `403`.

### `GET /api/v1/inventory?store_id=`

Products with `location`, `in_stock`, and `soon_to_expire: true` when the next sellable lot is within 7 days. An expired lot is not `in_stock`.

### `GET /api/v1/lots?product_id=&store_id=`

### `GET /api/v1/alerts?store_id=`

```json
{ "alerts": [ { "kind": "low_stock", "product": {}, "detail": "Under the bin minimum" } ] }
```

`kind` is `low_stock` or `soon_to_expire`.

### `GET /api/v1/restock?store_id=`

Products under the bin minimum, with `location.label`.

### `GET /api/v1/products?q=&store_id=`

Search by name or sku. Rows are `Product` only. No `status` here, because color depends on the person.

### `GET /api/v1/reports/dispensed?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=`

Admin and community partner. `store_id` may be `all`. Rows: `day`, `tier_id`, `grant_id`, `units`, `pounds`, `store_id`. No names. `day` is `YYYY-MM-DD`.

### Clinical records the staff site already calls

Keep these on `/api/v1` as well. Doctor and admin. Names are decrypted only on these routes.

- `GET /api/v1/clients`
- `POST /api/v1/clients`
- `GET /api/v1/clients/:id`
- `PATCH /api/v1/clients/:id`
- `POST /api/v1/clients/:id/tokens/revoke`
- `POST /api/v1/staff/lookup` `{ "name" }` exact HMAC match
- `POST /api/v1/staff/reissue` `{ "client_id" }` returns a new `client_code` once
- `GET /api/v1/rules` read only
- `GET /api/v1/me/profile` and `GET /api/v1/me/visits` for the client role

`PATCH /api/v1/clients/:id` still cannot contain a status or a color. Updating flags updates the active visit for that client in the same transaction.

## What the frontend will send first

Maria, household 3, Type 2 diabetes and hypertension, no allergy, no potassium order. These scans must come back as follows:

| sku | level | reason |
| --- | --- | --- |
| BEANS, low-sodium black beans, 140 mg sodium | green | |
| RICE, brown rice | green | |
| SPINACH, fresh spinach | green | |
| SOUP, canned chicken noodle, 890 mg sodium | red | High sodium – 890mg |
| OJ, orange juice, 0 mg sodium | red | Fruit juice isn't part of the plan today |
| TOMATOES, canned diced, about 300 mg sodium | yellow | limit_qty 1 |

Juice is red for her even when sodium is 0. Spinach stays green. She has no potassium order.

## Done when

A client can register, log in, and `GET /auth/me`. With a coordinate inside the St. Augustine geofence, `POST /visits/check-in` returns `active` and a visit token. The same person at the kiosk with `client_code` returns `already_checked_in` if that visit is still open. `GET /stores/:id/floor` counts match. `POST /scan` for `SOUP` is red and `POST /cart/lines` for that id is `409`. `GET /recipes/for-me` returns `RecipeResponse` with the field names above. `POST /recipes/from-cart` with the visit token does too, and a killed model still returns `source: "fallback"`. Checkout of a red line does not change a quantity.
