# Demo scan results: barcode test sheet × the four condition groups

Tested 2026-11-14 against the local backend (`http://<mac-ip>:8001`, `backend` branch) through the
same API calls the phone app makes: sign in → check in at Epic Cure main warehouse → `POST /scan`
→ `POST /cart/items`. All 23 products on `barcode-test-sheet.pdf` were scanned for six clients.
Every product that is not red was also added to the cart, and **all of those adds succeeded**.
The app flow (check in, scan, add, open Cart) was also checked in the iOS simulator as James.

The colors come only from the deterministic rules engine (`backend/app/rules.py`). The AI model
never decides safety, so this table is the same whichever model runs the recipe feature.

## How the four condition groups are handled

| Condition (app label) | Flag | Rules that apply | Source |
|---|---|---|---|
| Type 2 diabetes | `dm` | Sodium bands; added sugar ≥0.5 g → yellow; juice or a sweetened drink → **red** | ADA Standards of Care 2025 (water instead of sweetened drinks) |
| Hypertension (heart) | `htn` | Sodium: ≤140 mg green, 141–459 yellow, ≥460 mg (20% DV) **red** | FDA "low sodium" claim and %DV guide |
| Chronic kidney disease stage 3–4 | `ckd34` | Sodium bands; phosphate additives → yellow; **phosphorus not on the label → yellow "ask a volunteer"**; potassium chloride → red | KDOQI 2020: limit phosphate additives, individualize potassium and phosphorus |
| Other (allergies + clinician orders) | allergen list, `k_limit_ordered` | Any listed allergen in tags or ingredients, including "may contain" → **red**; potassium ≥200 mg → red only when a clinician ordered a potassium limit | FDA major allergens; allergist advice to avoid precautionary labels |

The worst color wins. Missing data is never green: it is yellow and tells the shopper to ask a volunteer.

Note: picking "Other" at sign-up records nothing today, because the app has no code for it.
Allergies are captured separately and do apply. A potassium limit can only be set by staff or a clinician.

## Results

| Product | Diabetes only + nut allergy | Maria: diabetes + high BP | James: high BP + kidney | Helen: kidney + sesame | Asha: all 3 + peanut | Luis: all 3 + K limit + milk |
|---|---|---|---|---|---|---|
| Tomato Soup | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R |
| Ancient Grains Probiotic Granola | 🔴 ALG | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y |
| Pumpkin Seed + Flax Granola | 🔴 ALG | 🟡 SUG_Y | 🟡 P_MISS | 🟡 P_MISS | 🔴 ALG | 🟡 P_MISS |
| Organic Creamy Peanut Butter | 🔴 ALG | 🟢 NA_G | 🟡 P_MISS | 🟡 P_MISS | 🔴 ALG | 🟡 P_MISS |
| Creamy Peanut Butter | 🔴 ALG | 🟡 SUG_Y | 🟡 P_MISS | 🟡 P_MISS | 🔴 ALG | 🟡 P_MISS |
| No Calcium OJ | 🔴 SUG_DRINK | 🔴 SUG_DRINK | 🟡 P_MISS | 🟡 P_MISS | 🔴 SUG_DRINK | 🔴 K_ORDER |
| Sprouted Rolled Oats | 🟢 NA_G | 🟢 NA_G | 🟡 P_MISS | 🟡 P_MISS | 🟡 P_MISS | 🔴 K_ORDER |
| Old Fashioned Oats | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G |
| Organic Diced Tomatoes | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y |
| Black Beans Organic | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🔴 K_ORDER |
| Baked Beans, Original | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R |
| Oats 'N Honey Granola Bars | 🔴 ALG | 🟡 SUG_Y | 🟡 P_MISS | 🟡 P_MISS | 🔴 ALG | 🟡 P_MISS |
| ClifBar Crunchy Peanut Butter | 🔴 ALG | 🟡 SUG_Y | 🟢 NA_G | 🟢 NA_G | 🔴 ALG | 🔴 ALG |
| Organic Chia & Quinoa Restaurant Style | 🟢 NA_G | 🟢 NA_G | 🟡 P_MISS | 🟡 P_MISS | 🟡 P_MISS | 🟡 P_MISS |
| Veggie Puffs Crispy Taco | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🔴 ALG |
| ALMOND FLOUR CRACKERS Farmhouse Chedda | 🔴 ALG | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🔴 ALG |
| Harvest Snaps Organic Sea Salt | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🟢 NA_G | 🔴 K_ORDER |
| organic GREEK YOGURT plain | 🟢 NA_G | 🟢 NA_G | 🟡 P_MISS | 🟡 P_MISS | 🟡 P_MISS | 🔴 ALG |
| Greek Yogurt Nonfat Plain | 🟢 NA_G | 🟢 NA_G | 🟡 P_MISS | 🟡 P_MISS | 🟡 P_MISS | 🔴 ALG |
| Marinara | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🔴 K_ORDER |
| Pasta Sauce | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y | 🟡 NA_Y |
| Chicken Noodle | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R |
| Chicken Ramen Noodle Soup | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R | 🔴 NA_R |

Reason codes: `NA_G/NA_Y/NA_R` sodium green/yellow/red · `SUG_Y` added sugar · `SUG_DRINK` juice or
sweetened drink · `P_MISS` phosphorus not on label (kidney) · `K_ORDER` potassium over a clinician's
limit · `ALG` contains or "may contain" one of the client's allergens.

## Why the results make sense in the real world

**Red for everyone: the three soups and the baked beans.** 480 to 1,590 mg sodium per serving is
at or above FDA's "high" line (20% DV = 460 mg). Every condition here needs low sodium: blood
pressure, kidney disease, and heart risk in diabetes.

**Good for everyone: Old Fashioned Oats.** No salt, 1 g sugar, and its label lists phosphorus
(130 mg), so even kidney patients get green. Use it as the demo's "great choice".

**Diabetes (Maria, and the diabetes-only test account).**
- Orange juice is red even though it has no sodium, because ADA says to replace juice and sweetened drinks with water.
- Plain Greek yogurt, oats, black beans and plain tortilla chips are green: little added sugar and low sodium.
- Granola, granola bars, Clif bar and Jif are yellow ("limit"): they have added sugar. ADA sets no gram cap that would make them red.

**Diabetes test account with a nut allergy: why "healthy" items turned red.** Both granolas, the
granola bars, the almond-flour crackers and the peanut items all contain nuts or carry a
"may contain peanut/almond/pecan" warning. For a nut allergy, red is the right answer.
The account you created earlier lists only peanuts, so tree-nut items show yellow for it.
New sign-ups that pick "Nuts" get both peanuts and tree nuts.

**Hypertension + kidney (James) and kidney only (Helen).**
- Many items are yellow `P_MISS`: Open Food Facts rarely lists phosphorus, and KDOQI asks to watch
  phosphate additives. The app says "Missing phosphorus information — ask a volunteer"; it is not a ban.
- Items with phosphorus on the label and low sodium are green: oats, black beans, Harvest Snaps, Clif bar.
- Orange juice is only yellow for James: juice is a diabetes rule, and potassium only limits him
  if his clinician orders it (KDOQI 2020 says to individualize potassium).

**Everything (Asha) and everything + potassium limit + milk allergy (Luis).** These are the strictest
plans. Luis gets red for beans, sprouted oats, marinara and pea snacks (potassium ≥200 mg) and for
yogurt, cheese crackers and veggie puffs (milk). That's what a dietitian would expect for a
dialysis-track patient with a milk allergy.

## What was broken and is fixed

1. **"Couldn't add this item"**: the 23 sheet products existed but had no stock at any store, so
   the backend correctly refused (`409 out_of_stock`). They are now stocked at all three stores on
   startup (`backend/seed/data/demo_sheet_products.json`, `stock_demo_sheet()` in `seed/load.py`).
   The app now says "Out of stock at this store right now. Ask a volunteer." instead of a generic error.
2. **"Not verified yet" yellow** on the first scan of a sheet item went away for the same reason:
   the products are now in the catalog before the demo.
3. **Shown reason did not match the color** (e.g. juice red but reason "low sodium"): the backend
   needed a restart to load the rule-ordering fix. Restarted.
4. Earlier fixes: plant foods wrongly stored as drinks (oats were red for every diabetic), water red,
   empty cart screen, "Nuts" covering only peanuts.

## Known data limits to mention if asked

- Nutrition comes from Open Food Facts (crowd-sourced). Example: it lists the Clif bar at 0 mg sodium;
  the real label is higher. Staff can correct a product, and the rules recompute instantly.
- Phosphorus is usually missing, so kidney plans see many yellows. That is on purpose: missing data is never shown as safe.
- Thresholds are per labeled serving, as FDA claims are.

## Sources

- FDA, [Sodium in your diet](https://www.fda.gov/food/nutrition-education-resources-materials/sodium-your-diet) and [Using the Nutrition Facts label to reduce sodium](https://www.fda.gov/food/labeling-nutrition/use-nutrition-facts-label-reduce-your-intake-sodium-your-diet): low sodium ≤140 mg; 20% DV or more is high; DV 2,300 mg.
- ADA, [Standards of Care in Diabetes 2025 press release](https://www.diabetes.org/newsroom/press-releases/american-diabetes-association-releases-standards-care-diabetes-2025) and [summary](https://diatribe.org/diabetes-management/your-guide-2025-ada-standards-care): water instead of sweetened drinks.
- KDOQI Clinical Practice Guideline for Nutrition in CKD, 2020 update: [commentary](https://pmc.ncbi.nlm.nih.gov/articles/PMC9303594), [Healio summary](https://www.healio.com/news/nephrology/20200122/new-kdoqi-guidelines-offer-a-reset-on-nutrition), [Academy of Nutrition and Dietetics](https://foodandnutrition.org/from-the-magazine/new-approaches-to-the-kidney-diet/): individualize potassium and phosphorus, limit phosphate additives, plant phosphorus is less absorbed.
- Precautionary allergen labels: [Allergic Living](https://www.allergicliving.com/2014/01/06/may-contains-on-food-labels-what-you-need-to-know/), [FARE](https://www.foodallergy.org/fare-blog/blog-post-may-contain-food-thought-about-precautionary-allergen-labeling).

This is a decision-support prototype, not medical advice. A registered dietitian should confirm thresholds before real use.
