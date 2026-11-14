# HTTP contract

Base URL in development: `http://localhost:8000`

Frontend origin: `http://localhost:5173`

Mobile origin: `http://localhost:5174`

Send `Authorization: Bearer <jwt>` on every route that lists a role. Floor routes use a card token or a `session_id` and do not use the JWT.

Error body:

```json
{ "error": "code", "message": "short text" }
```

`401` means signed out or bad token. `403` means the role cannot call this route. `409` means the floor, the cart, or the stock refused the action.

## Auth

### `POST /auth/login`

Body: `{ "email": "staff@demo.local", "password": "nest-local-demo" }`

Response: `{ "access_token": "...", "token_type": "bearer", "role": "warehouse_staff", "expires_in": 28800 }`

Failed login, unknown email, and a disabled account all return `401` with message `invalid email or password`.

### `GET /auth/me`

Any signed-in role. Returns `{ "id", "email", "role" }`.

### `POST /auth/change-password`

Any signed-in role. Body: `{ "current_password", "new_password" }`. New password length at least 8.

### `POST /admin/users`

Admin. Body: `{ "email", "password", "role" }`. Role is one of `doctor`, `client`, `warehouse_staff`, `admin`, `community_partner`. Client accounts are created by `POST /clients`, not here.

### `GET /admin/users`

Admin. Returns id, email, role, disabled. No password hash.

### `PATCH /admin/users/{id}`

Admin. Body: `{ "disabled": true }` or `{ "role": "warehouse_staff" }`.

## Clients and cards

Doctor and admin.

### `POST /clients`

Body:

```json
{
  "legal_name": "Maria Alvarez",
  "phone": "555-0100",
  "email": "maria@demo.local",
  "password": "nest-local-demo",
  "household_size": 3,
  "icd10": ["E11.9", "I10"],
  "allergens": [],
  "k_limit_ordered": false
}
```

The server derives `dm`, `htn`, `ckd34`, and `tier_id`. N18.5 or N18.6 returns `422` with code `outside_matrix`. Response includes the client id, tier, flags, and the raw card token once. The raw token is not stored and is not returned again.

### `GET /clients` and `GET /clients/{id}`

Doctor and admin. Includes decrypted name and phone, ICD codes, flags, tier, allergen codes, token status. No raw token.

### `PATCH /clients/{id}`

Doctor and admin. May change phone, household size, ICD list, allergen codes, and `k_limit_ordered`. The same transaction copies the new flags onto every active session for that client. The body cannot include a verdict or a color.

### `POST /clients/{id}/tokens/revoke`

Doctor and admin. Sets the current token to `revoked`.

### `GET /me/profile` and `GET /me/visits`

Client role only. Own name, own tier, own flags, own token status, own ledger rows. Visits include product name, grant, tier, quantity, and time.

## Floor

### `POST /floor/arrive`

No JWT. Body: `{ "token": "<raw card token>" }`.

Active card and free floor space:

```json
{
  "session_id": "uuid",
  "status": "active",
  "tier_id": "T4",
  "dm": true,
  "htn": true,
  "ckd34": false,
  "k_limit_ordered": false,
  "allergens": [],
  "household_size": 3,
  "lease_expires_at": "2026-11-14T16:30:00Z"
}
```

There is no name, phone, or ICD list in this payload. A bad, expired, or revoked token returns `401` with message `please see a volunteer`. A full floor and a full queue return `409` with code `floor_full` and the same message. A full floor with room in the queue returns `status: "queued"`. Calling arrive again with the same live token returns the same session.

### `GET /floor/board`

Warehouse staff and admin. Counts and queue rows of session id, status, tier, and queued time. No names.

### `GET /sessions/{session_id}`

No JWT. Same shape as arrive. `404` when the id is unknown.

## Scan and cart

No JWT. The session id is the credential. Checkout ignores any color the phone stored.

### `POST /scan`

Body: `{ "session_id", "barcode" }`. Produce with no barcode may send `internal_code` instead.

```json
{
  "verdict": "red",
  "reasons": [
    { "rule_id": "SUG_DRINK", "source": "ADA 2025 rec 5.25" }
  ],
  "product": {
    "id": "uuid",
    "name": "Babyfood, juice, orange",
    "sodium_mg": 0,
    "potassium_mg": 184,
    "phosphorus_mg": 11,
    "added_sugar_g": null,
    "aisle": "A",
    "shelf": "1",
    "bin_code": "A1",
    "soon_to_expire": false
  },
  "fiber_rank_bonus": false
}
```

Unknown barcode: `{ "verdict": "unknown", "reasons": [], "product": null }`.

### `POST /cart/lines`

Body: `{ "session_id", "product_id" }`. Allowed when the fresh verdict is green or yellow. Red or unknown returns `409` with code `not_eligible`.

### `DELETE /cart/lines/{product_id}?session_id=`

### `GET /cart?session_id=`

Returns lines with the stored verdict.

## Checkout and stock

### `POST /checkout`

Warehouse staff and admin. Body: `{ "session_id" }`.

The server re-runs the rules on every line. Any red or unknown line returns `409` `red_in_cart` and changes no quantity. An empty eligible lot returns `409` `out_of_stock` for that product and rolls the sale back. Success returns the ledger rows that were inserted and sets the session to `closed`.

### `POST /staff/lookup`

Warehouse staff and admin. Body: `{ "name": "Maria Alvarez" }`. Exact HMAC match only. Returns client id, tier, and token status, plus the name that matched.

### `POST /staff/reissue`

Warehouse staff and admin. Body: `{ "client_id" }`. Revokes the old token and returns a new raw token once.

### `GET /lots?product_id=`

Warehouse staff and admin. Includes `expires_on`, `qty`, and `soon_to_expire` when the date is within 7 days and still after today.

## Reports and rules

### `GET /reports/dispensed?from=YYYY-MM-DD&to=YYYY-MM-DD`

Community partner and admin. Rows from `analytics_public` only: `day`, `tier_id`, `grant_id`, `units`, `pounds`.

### `GET /rules`

Doctor and admin. The reference rows, including `rd_confirm` and `source_url`. Read only.

### `GET /health`

No JWT. `{ "ok": true }`.

## Backend implementation clarifications (2026-11-14)

Existing routes and fields above are retained. Every request model rejects extra fields,
including caller-supplied verdicts, colors, tiers, or condition booleans. Enrollment and
reissue return the once-only floor secret as `token`; enrollment also returns `warnings`.
Profile responses never return `token`. Errors always use `{error,message}`.

Session UUIDs are cryptographically random bearer credentials as specified above. Keep them
out of URLs shared with other people, analytics, logs, and persistent browser storage.
Expired/closed/queued sessions cannot scan, mutate carts, or check out (`409 session_inactive`).
A session GET accepts queued sessions; closed/expired returns 409. Unknown UUID returns 404.
Revoking or reissuing a card invalidates outstanding sessions. Profile changes update both
active and queued sessions. Disabling an account prevents token use and arrival.

`POST /cart/lines` increments quantity by one; DELETE removes the entire product line.
Adding beyond current eligible stock returns `409 out_of_stock`; carts do not reserve stock.
Checkout returns an array of inserted ledger rows, closes the session, and promotes the queue.
An empty cart returns `409 empty_cart`. No clinical override is supported.

`GET /floor/board` returns `{active, queued, queue:[{session_id,status,tier_id,queued_at}]}`.
Client and user creation return 201. Mutations without another documented result return
`{ok:true}`. `GET /clients`, `/admin/users`, `/cart`, `/lots`, `/rules`, `/me/visits`, and
`/reports/dispensed` return arrays.

### Approved safety correction to golden examples

The written missing-allergen-evidence rule takes precedence over three golden green cells,
as confirmed by the project owner on 2026-11-14. Asha/banana, Helen/banana, and Helen/orange_juice
return **unknown**, because those products have neither ingredients nor allergen tags.
The original golden file is unchanged. The other 27 cells match it exactly. Red and yellow
votes retain their documented precedence; no unsafe expectation was relaxed to green.

### `POST /scan/image`

No JWT. Multipart fields: `session_id` (UUID bearer credential) and `image` (JPEG, PNG, WebP;
maximum 8 MB and 12 megapixels). A single recognized barcode in the catalog returns the
ordinary scan result plus `recognition:"barcode"` and `review_required:false`.

Unknown or ambiguous identity returns `verdict:"unknown"`, `product:null`, `reasons:[]`,
`barcodes`, `recognition` (`extracted`, `unreadable`, or `unavailable`), `extraction`,
`external_candidate`, `catalog_candidates` (literal name matches, never automatic identity confirmation),
and `review_required:true`. Extraction includes raw OCR text,
confidence, warnings, ingredient text, serving grams, and nullable nutrients. External
candidates carry source provenance. Neither OCR nor external candidates alter verified
records or carts. Staff must resolve identity/data before a product can be dispensed.
Unavailable OCR is explicitly labeled; it is never represented as successful extraction.
Invalid images return 422. No legal names, phones, or ICD codes enter OCR requests.

### `POST /recommendations`

No JWT. Body `{session_id}`. Returns `{recommendations,recipes,mode,model,review_required}`.
`mode` is `ollama` only after actual inference and validation; otherwise
`deterministic_fallback`. Fallback has `model:null` and no generated recipes.
Only green products with serving data and positive eligible stock are recommendation candidates.
Each recommendation includes `product_id`, `name`, `suggested_quantity`, `quantity_unit:"package"`,
`reason`, authoritative rule `reasons`, and `location`. Package quantities are not clinical
portion prescriptions. Yellow products remain cart-eligible but are not AI candidates.

Recipe objects contain `name`, `ingredients` (the same product/quantity shape), `instructions`,
and `missing_ingredients` (the same shape with `available:true`). Recipes use cart products;
missing ingredients are checked against actual stock. Model output is restricted to product
IDs, package quantities, and preparation operations. Server-rendered instructions prevent
unvalidated free-text ingredients or medical claims. No claim of aggregate daily nutrient
safety is made. Clinical flags, session status, cart and stock are rechecked after inference.

### Catalog and receiving additions

- `GET /products?q=&limit=50`: doctor, staff, admin. Catalog rows with source and eligible stock;
  limit 1–200. Nutrients are per stated serving. Nullable `calories_kcal`, `protein_g`, `fat_g`,
  and `sugar_g` are additive fields. Existing schema columns and rule thresholds are unchanged.
- `GET /products/search-external?q=`: doctor, staff, admin. USDA candidates `{fdc_id,name,data_type}`.
  Requires configured FDC key; 503 `nutrition_unavailable` on missing credentials/upstream failure.
- `POST /products/import`: staff/admin. Body exactly one of `{barcode}` or `{fdc_id}`.
  Imports a source-attributed catalog record; existing records are not overwritten. Returns
  product row (201). Does not create stock. 404 for absent product; 503 for source failure.
- `GET /inventory`: staff/admin. Bin rows plus `stock`, `low_stock`, `expired_units`,
  `expiring_units`. Counts exclude expired stock from availability.
- `POST /lots`: staff/admin. `{product_id,bin_id,grant_id,arrived_on,expires_on,qty}`.
  Positive integer quantity, expiration after arrival, and bin must match product. Returns
  the inserted lot (201). No existing lot or ledger quantity is rewritten.

All API responses use `Cache-Control:no-store`. Production CORS origins are explicit configuration.
The API has no public signup, stock deletion, ledger deletion, or verdict override endpoint.
