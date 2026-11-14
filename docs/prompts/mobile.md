# Mobile prompt

Paste this whole file into the chat that is working in `mobile/`. This is the aisle phone, not the staff desk. Build only this folder.

Read `docs/PLAN.md` and `docs/API.md`. The phone never decides the color. It shows the server `verdict`. Checkout is not on this device.

## Stack

Vite, React, TypeScript. Dev server port 5174. `VITE_API_URL` defaults to `http://localhost:8000`. One barcode library. Prefer the browser `BarcodeDetector` when it exists, with that one library as the fallback.

## Flow

1. A person scans their card QR or pastes the card token. Call `POST /floor/arrive`.
2. On success, store the session payload in IndexedDB: tier, flags, allergens, lease time. Do not store a name. The server does not send one.
3. Open the camera and scan a product barcode. Online, `POST /scan` and show the verdict, the reason rule ids, and the bin.
4. Green or yellow can be added with `POST /cart/lines`. Red and unknown show a stop state and do not call add.
5. A queued session shows a waiting state. A rejected token shows `please see a volunteer`.

## Offline

The phone caches products it has already scanned, keyed by barcode, plus the session flags.

When the network fails after arrive:

- If the barcode is in the cache, show the last server verdict with a visible label `unverified`.
- If the barcode is not in the cache, show unknown, not green.
- Queue adds in IndexedDB. On reconnect, flush the queue and replace the local verdict with the server verdict.
- Never call checkout from the phone.

A service worker caches the scan page so it opens with no network.

## Done when

Arrive, scan, and a stop on red all work against the local API. Airplane mode on a cached page shows `unverified` or unknown, and never a fresh green for a barcode the server has not judged.
