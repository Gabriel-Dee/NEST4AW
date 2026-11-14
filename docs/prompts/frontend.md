# Frontend prompt

Paste this whole file into the chat that is working in `frontend/`. Build only that folder. The aisle phone is `mobile/`. The API is `backend/`.

Read `docs/PLAN.md` and `docs/API.md`. Implement the screens against that contract. Do not compute green, yellow, or red in the browser. Paint the `verdict` string the server returned.

## Stack

Vite, React, TypeScript. Dev server port 5173. `VITE_API_URL` defaults to `http://localhost:8000`.

## Screens

1. Login. Email and password. Store the bearer token in memory. Send it on staff, doctor, admin, and partner calls.
2. Home that branches on `GET /auth/me` role.
3. Doctor: enroll a client (name, phone, email, household size, ICD list, the nine allergen checkboxes, potassium-order checkbox). Show the raw card token once, with a copy button. List clients. Edit flags. Revoke a token. Show `rd_confirm` when you render `GET /rules`. No color picker.
4. Client: own profile and own visits from `/me/profile` and `/me/visits`.
5. Warehouse staff: token box that calls `POST /floor/arrive`. Show the session tier and flags, never a name. Floor board. Cart for the active session. Checkout button that calls `POST /checkout` and shows `red_in_cart` or `out_of_stock` without changing the cart into a sale. Name lookup and reissue, exact name, show the new token once.
6. Admin: the staff and doctor screens, plus create user, disable user, and the report table.
7. Community partner: the report table only. Columns day, tier, grant, units, pounds.

A failed arrive shows the server message `please see a volunteer`.

Use a large type size and high contrast on the staff floor screen. The color chip uses the verdict as both text and color, so the color is not the only signal.

## Done when

A staff login can arrive a token, see a server verdict for a barcode, and check out. A doctor can enroll and see a token once. A partner login cannot open the client list. No file under `frontend/` assigns a verdict except by reading the API field.
