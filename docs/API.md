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
