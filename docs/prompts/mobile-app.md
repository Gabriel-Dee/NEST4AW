# Epic Cure – Shopping Companion

Paste this whole file into a new chat. Build only inside `mobile/`. Do not edit `backend/`, `frontend/`, `docs/schema.sql`, or `docs/API.md`.

The folder already contains only `mobile/README.md.bak`. Move that file out of `mobile/` before the Expo command so the directory is empty. Do not start the dev server.

=== STEP 0 — MANDATORY PROJECT SETUP (DO THIS FIRST, DO NOT SKIP) ===

You are writing REAL CODE into the existing folder named "mobile". This is NOT a static HTML mockup, NOT a design canvas, NOT a showcase poster of phone frames. The deliverable is a runnable Expo React Native project.

1. cd into the "mobile" folder.
2. Initialize the Expo project IN THAT FOLDER (current directory) by running exactly:
   npx create-expo-app@latest . --template default@sdk-58 --yes
   - The "." means: create it here, inside "mobile". Do NOT create a nested subfolder like mobile/my-app.
   - If the folder is not empty and the command refuses, move existing files aside, run it, then restore them.
3. Run the project's reset script (npm run reset-project) to clear the starter example, then delete the leftover example folder (app-example).
4. Do NOT start the dev server. I will run it myself.
5. Before writing any screens, confirm in your reply: "Expo SDK 58 project initialized in /mobile" and show the resulting folder tree.

If you cannot run terminal commands, STOP and tell me. Do NOT fall back to generating HTML/CSS.

=== TECH RULES ===
- Expo SDK 58, TypeScript, Expo Router (file-based routing in the app/ folder), React Native components only (View, Text, Pressable, ScrollView, FlatList). No HTML tags, no web-only CSS.
- Camera/barcode: use expo-camera (CameraView with barcode scanning). Include a manual "Type item code" fallback.
- Icons: @expo/vector-icons. Styling: StyleSheet or a single theme.ts file with colors, spacing, font sizes.
- Install any package with: npx expo install <package> (never plain npm install for Expo packages).

=== FRONTEND ONLY — NO BACKEND YET ===
- Do NOT build a server, database, auth, or call any AI/LLM API.
- Put ALL sample data in mobile/data/mock.ts (client profile, ~25 products with nutrients/status/aisle-shelf-bin, cart, 3 recipes).
- Access data ONLY through mobile/services/api.ts with async functions (getSession, getRecommendations, scanItem(sku), getCart, getRecipes) that return mock data after a short fake delay. This is the single seam where the real backend will be plugged in later. Screens must never import mock.ts directly.
- Also put cart mutations in that same file: addToCart(sku), saveRecipe(id). Screens call those. Do not import mock data from a screen.

=== DESIGN SYSTEM ===
Apple-style (HIG): clean, generous spacing, SF-like system font, large titles, rounded cards, subtle shadows, bottom tab bar. Brand: fresh greens on warm off-white. Accessibility: tap targets ≥ 48px, body text ≥ 16px, support large text, status ALWAYS = color + icon + word (never color alone).

=== GAMIFICATION (gentle, dignity-first) ===
- "Healthy Picks" points: earn points for each GREEN item added and for saving a recipe. Show a friendly progress ring on Welcome/Cart ("6 of 8 healthy picks today").
- Small celebratory feedback (badge/confetti-lite) when completing the recommended list or saving a first recipe. A short opacity animation is enough. Do not add a heavy confetti package.
- Streak: "3 visits with healthy carts" badge on the welcome screen.
- NEVER penalize, shame, or subtract points for RED items. No leaderboards (health data is private). Rewards only.

=== APP: "Epic Cure – Shopping Companion" ===

Design a mobile-first app (phone screen, 390px wide) called "Epic Cure – Shopping Companion" for a free, nonprofit food warehouse in St. Augustine, Florida that runs a "Food is Medicine" program. Clients have chronic conditions (Type 2 Diabetes, Hypertension, Chronic Kidney Disease, often more than one) and push a physical cart through the warehouse while using this app on their own phone.

Tone: warm, dignified, calm, never clinical or judgmental. Many users are seniors, veterans, or low-literacy, so use large tap targets (min 48px), big readable text (min 16px body), plain language, and simple icons. Brand: fresh greens with a warm off-white background, rounded cards, friendly sans-serif font.

Status system used everywhere (never rely on color alone, always pair color + icon + word):
- GREEN "Great choice" (check icon): safe for your health plan
- YELLOW "Limit to N" (caution icon): OK in limited quantity, show the limit
- RED "Not for you today" (stop icon): restricted for your condition, with a short reason (e.g., "High sodium – 890mg")

Screens:
1. Welcome / Session started: greeting with first name ("Hi Maria"), their diet plan badge (e.g., "Heart & Kidney Friendly"), household size, and a "Start Shopping" button.
2. My Shopping List (recommendations): grouped by Produce, Proteins, Dairy, Grains, Pantry. Each item card shows name, photo placeholder, status badge, suggested quantity for their household, and location ("Aisle B · Shelf 2 · Bin 4"). Top banner: "Picked for you based on what's in stock today."
3. Scan Item: full-screen camera viewfinder with barcode frame, plus a "Type item code instead" fallback.
4. Scan Result: large status card (green/yellow/red), item name, key nutrients that matter for their conditions (sodium, sugar, potassium, carbs) shown as simple bars vs. their limit, reason text, and buttons "Add to Cart" / "Show me a better option". For RED items, show 1–2 safe alternatives with their aisle locations.
5. My Cart: list of scanned items with status badges, a running summary ("8 great choices, 1 to limit"), and a prominent "Get Recipe Ideas" button.
6. Recipe Ideas (AI): 2–3 recipe cards built from cart items, each with photo placeholder, time, "Uses 4 items from your cart", a "Missing ingredients" section with aisle locations and a "Find it" button, and a "Save to my profile" button. Show a small "AI-suggested – reviewed against your health plan" label.
7. Finish / Head to Checkout: summary, "Show this screen to the volunteer" QR code, saved recipes.

Also design these states: loading (AI thinking, with friendly skeleton cards), weak warehouse Wi-Fi/offline banner ("Saved on your phone, will sync"), scan not recognized, and an empty cart.

Use realistic sample data: client "Maria G., household of 3, Type 2 Diabetes + Hypertension"; items like "Low-sodium black beans", "Brown rice", "Fresh spinach", "Canned chicken noodle soup (RED – high sodium)".

=== ROUTES ===

Map the 7 screens to Expo Router:
- `app/index.tsx` Welcome
- `app/(tabs)/list.tsx` My Shopping List
- `app/(tabs)/scan.tsx` Scan Item
- `app/(tabs)/cart.tsx` My Cart
- `app/(tabs)/recipes.tsx` Recipe Ideas
- `app/scan-result.tsx` Scan Result (opened with the scanned code)
- `app/checkout.tsx` Finish / Head to Checkout

Tab labels: List, Scan, Cart, Recipes. Welcome "Start Shopping" opens the List tab. Cart "Get Recipe Ideas" opens Recipes. A "Head to Checkout" button on Cart opens checkout. "Find it" on a missing ingredient opens Scan with the code filled in if you have one, or List scrolled to that item.

Photo placeholders are local rounded views with an icon. Do not load remote images.

=== HOW THE MOCK LINES UP WITH THE WAREHOUSE ===

This slice does not call the API. The verdict is already stored on each product in `mock.ts`. Screens display that verdict. They do not recompute green, yellow, or red from nutrients.

Words on the badge:
- `green` → "Great choice"
- `yellow` → "Limit to {suggestedQty}" where `suggestedQty` is the household shopping quantity on that item
- `red` → "Not for you today" plus `reason`
- unknown code → the scan-not-recognized state, never a green badge

"Add to Cart" adds only green and yellow items. On red, the button stays visible, does not add, and the screen shows 1–2 alternatives that are already green in the mock. Red items do not change the points.

Maria's conditions in the data are Type 2 Diabetes and Hypertension, household 3, first name Maria. There is no potassium limit on her sample, so high-potassium produce such as spinach and banana stays green. Fruit juice is red even when sodium is 0, reason "Fruit juice isn't part of the plan today".

Put these rows in the 25, then fill the rest with the same shape. Every extra row needs a verdict already set. Do not mark juice, a sugar-sweetened drink, or an item at or over 460 mg sodium as green for Maria.

| Name | Group | Verdict | Sodium mg | Notes |
| --- | --- | --- | --- | --- |
| Low-sodium black beans | Pantry | green | 140 | Aisle B · Shelf 2 · Bin 4, suggested qty 3 |
| Brown rice | Grains | green | 5 | suggested qty 2 |
| Fresh spinach | Produce | green | 79 | potassium may be high; still green for Maria |
| Banana | Produce | green | 1 | still green for Maria |
| Canned chicken noodle soup | Pantry | red | 890 | reason "High sodium – 890mg". Alternatives: black beans, brown rice |
| Orange juice | Produce | red | 0 | reason "Fruit juice isn't part of the plan today" |
| Canned diced tomatoes | Pantry | yellow | 300 | badge "Limit to 1" |

Nutrient bars compare the item's sodium, added sugar, potassium, and carbs to guide numbers stored on the session in mock data (sodium guide 460 mg, added sugar guide 0.5 g). The bar is a picture of the number. The badge still comes from `verdict`, not from the bar.

The checkout QR encodes the mock session id only. The phone does not mark the visit paid and does not change stock. Title the screen "Show this screen to the volunteer".

Show the offline banner "Saved on your phone, will sync" on List, Cart, and Recipes in this slice, because nothing leaves the phone yet.

Recipe cards are static mock text. The label "AI-suggested – reviewed against your health plan" is a label only. Do not call a model. `getRecipes` waits about 700 ms and the screen shows skeleton cards during that wait. One recipe uses several cart items and lists one missing ingredient with an aisle.

Points: +1 for each green item added, +1 when the first recipe is saved. The ring on Welcome and Cart uses greens added against the count of green items on the recommended list. Copy stays warm. No red penalty, no leaderboard.

=== DONE MEANS ===
- `npx expo start` would run with zero errors. Do not start it.
- Every screen is reachable through navigation, all driven by `services/api.ts` mock data.
- At the end, list the files created and the exact command to run the app: `cd mobile && npx expo start`.
