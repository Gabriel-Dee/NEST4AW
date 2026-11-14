# Epic Cure · MTG Warehouse (frontend)

Next.js App Router + Tailwind v4 + shadcn/ui for the Medically Tailored Groceries warehouse lane.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo logins

Password for all: `nest-local-demo`

| Email | Default home |
| --- | --- |
| `staff@demo.local` | Checkout |
| `doctor@demo.local` | Clinical intake |
| `admin@demo.local` | Admin overview |
| `partner@demo.local` | Analytics |

Public kiosk: [/kiosk](http://localhost:3000/kiosk) — try card tokens `1001` (success), `1005` (enrollment expired), `9999` (queue).

## Screens

| Route | Area |
| --- | --- |
| `/kiosk` | Self-service check-in |
| `/checkout` | Volunteer terminal + hard-stop |
| `/warehouse` | Inventory, alerts, restock, floor capacity |
| `/admin/clinical` | Clinical profile intake |
| `/admin/analytics` | Anonymized KPIs + CSV export |
| `/admin/rules` | Clinical rules matrix |

Use the sidebar **Switch role** control to demo role-gated nav after a single login.

## Contract note

Colors come from the API `verdict` field. This UI paints `green` / `yellow` / `red` / `unknown` only — it does not invent a color from nutrients. Live backend: see repo `docs/API.md`. Mock layer: `src/lib/mock/api.ts`.

The aisle phone remains in `../mobile/`.
