-- Reference rows the rules engine reads by rule_id.
-- Thresholds live here. The Python engine must not hardcode a second copy.
-- A dietitian still has to confirm every row where rd_confirm is true
-- before a real person depends on the color.

INSERT INTO grants (id, name) VALUES
  ('grant-a', 'Grant A produce'),
  ('grant-b', 'Grant B staples');

INSERT INTO warehouse_limits (id, max_floor, max_queue, lease_minutes)
VALUES (1, 25, 15, 30);

INSERT INTO rules (
  rule_id, applies, nutrient, op, threshold, color, source, source_url, rd_confirm, note
) VALUES
(
  'NA_G', 'dm_or_htn_or_ckd', 'sodium_mg', 'lte', 140, 'green',
  '21 CFR 101.61 low sodium is 140 mg or less per RACC. We apply it to the labeled serving.',
  'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-D/section-101.61',
  true,
  'Daily ceiling under 2300 mg is ADA 2025 rec 5.20, KDOQI 2020 statement 6.5.1, and the AHA ceiling. That daily number is context. The scan color uses the labeled serving.'
),
(
  'NA_R', 'dm_or_htn_or_ckd', 'sodium_mg', 'gte', 460, 'red',
  '21 CFR 101.54 high is at least 20 percent of the DV. FDA sodium DV is 2300 mg, so 460 mg.',
  'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-D/section-101.54',
  true,
  'FDA DV table: https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels'
),
(
  'NA_Y', 'dm_or_htn_or_ckd', 'sodium_mg', 'between', NULL, 'yellow',
  'Serving sodium above the low claim and below the high claim.',
  'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-D/section-101.61',
  true,
  'Yellow band is 141 mg through 459 mg on the labeled serving.'
),
(
  'K_DEFAULT', 'ckd34_and_not_k_order', 'potassium_mg', NULL, NULL, NULL,
  'KDOQI 2020 statements 6.4.1 and 6.4.2: no milligram cap. Adjust to the person.',
  'https://www.ajkd.org/article/S0272-6386(20)30726-5/fulltext',
  true,
  'Default CKD does not paint bananas, potatoes, or beans red.'
),
(
  'K_ORDER', 'k_order', 'potassium_mg', 'gte', 200, 'red',
  'NKF education line: a food with 200 mg potassium or more per serving is a higher-potassium food.',
  'https://www.kidney.org/kidney-topics/potassium-your-ckd-diet',
  true,
  'Fires only when a clinician has recorded k_limit_ordered. The flag is not an ICD code.'
),
(
  'K_SALT', 'ckd34', NULL, 'ingredient', NULL, 'red',
  'AHA warns that potassium chloride salt substitutes can be unsafe when kidneys or medicines cannot handle the load. Hard stop for CKD stage 3 or 4 is our safety choice on top of that caution.',
  'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure/how-potassium-can-help-control-high-blood-pressure',
  true,
  'Match the ingredient potassium chloride. Do not match the word salt by itself.'
),
(
  'K_RANK', 'htn_and_not_ckd_and_not_k_order', 'potassium_mg', 'rank', NULL, NULL,
  'AHA: 3500 to 5000 mg potassium a day from food when kidneys and medicines allow.',
  'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure/how-potassium-can-help-control-high-blood-pressure',
  true,
  'Sort key only. No color. HTN plus CKD with no order does not rank potassium up or down.'
),
(
  'P_ADD', 'ckd34', NULL, 'ingredient', NULL, 'yellow',
  'KDOQI 2020 statements 6.3.1 and 6.3.2: no milligram cap. Additive phosphorus is the practical signal.',
  'https://www.ajkd.org/article/S0272-6386(20)30726-5/fulltext',
  true,
  'Match phosphate, phosphoric, or pyrophosphate. Yellow until a dietitian promotes a row to red. Do not use the FDA phosphorus DV of 1250 mg as a CKD limit.'
),
(
  'P_MISS', 'ckd34', 'phosphorus_mg', 'missing', NULL, 'yellow',
  'Missing phosphorus on a CKD stage 3 or 4 profile cannot be shown as green.',
  'https://www.ajkd.org/article/S0272-6386(20)30726-5/fulltext',
  true,
  'Yellow, not red. Plant phosphorus stays allowed when the amount is present and no additive matched.'
),
(
  'SUG_DRINK', 'dm', NULL, 'category', NULL, 'red',
  'ADA 2025 rec 5.25: replace sugar-sweetened drinks, including fruit juice, with water.',
  'https://diabetesjournals.org/care/article/48/Supplement_1/S86/157563/5-Facilitating-Positive-Health-Behaviors-and-Well',
  false,
  'Juice, or a drink with 0.5 g or more sugar (added or total, whichever is larger), is red on a diabetes tier even when sodium is 0. Water and unsweetened drinks follow the normal sugar bands; missing sugar data is Ask a volunteer.'
),
(
  'SUG_G', 'dm', 'added_sugar_g', 'lt', 0.5, 'green',
  '21 CFR 101.60 sugar free is under 0.5 g sugars per reference amount. We use 0.5 g added sugar on a non-drink as the green band.',
  'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-D/section-101.60',
  true,
  'Analogy to the sugar-free magnitude. A dietitian must confirm. Package claims never set the color.'
),
(
  'SUG_Y', 'dm', 'added_sugar_g', 'gte', 0.5, 'yellow',
  'Non-drink added sugar at or above 0.5 g per labeled serving.',
  'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-D/section-101.60',
  true,
  'Yellow, not red. ADA has no gram cap that would make this red. AHA daily context is 25 g for most women and 36 g for most men.'
),
(
  'CARB', 'dm', 'carb_g', NULL, NULL, NULL,
  'ADA 2025 rec 5.15: no gram cap for total carbohydrate.',
  'https://diabetesjournals.org/care/article/48/Supplement_1/S86/157563/5-Facilitating-Positive-Health-Behaviors-and-Well',
  false,
  'Recorded on the product. Never a color.'
),
(
  'FIBER_RANK', 'dm_or_htn_or_ckd', 'fiber_g', 'gte', 5.6, NULL,
  'ADA 2025 rec 5.24 is at least 14 g per 1000 kcal. Rank bonus uses 5.6 g, which is 20 percent of the FDA fiber DV of 28 g.',
  'https://diabetesjournals.org/care/article/48/Supplement_1/S86/157563/5-Facilitating-Positive-Health-Behaviors-and-Well',
  false,
  'Sort bonus only. Low fiber is never red.'
),
(
  'GI_Y', 'dm', 'gi', 'gte', 70, 'yellow',
  'University of Sydney: high GI is 70 or above.',
  'https://glycemicindex.com/about-gi/',
  true,
  'Yellow, never red, and only when a tested GI value is stored.'
),
(
  'GI_MISS', 'dm', 'gi', 'missing', NULL, NULL,
  'A missing GI value adds no color.',
  'https://glycemicindex.com/about-gi/',
  false,
  'Do not invent a GI.'
),
(
  'ALG', 'has_allergen', NULL, 'tag', NULL, 'red',
  'FD&C Act 201(qq) nine foods: milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, sesame.',
  'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies',
  false,
  'An allergen hit beats a nutrient green. No role can override it.'
);
