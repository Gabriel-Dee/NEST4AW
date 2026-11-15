-- Open Food Facts files nearly every plant food under "en:plant-based-foods-and-beverages".
-- The old importer substring-matched "beverages", so bread, oats, muesli, peanut butter and
-- soups were stored as drinks and SUG_DRINK made them red for every diabetes client.
-- app/services/nutrition.py now matches whole tags; this corrects rows already stored.
-- Idempotent: runs on every startup.
UPDATE products SET is_drink = false
WHERE is_drink AND NOT is_juice AND barcode IN (
  -- seed snapshot (backend/seed/data/off_products.json)
  '3760049790214','3760049798609','3168930010265','06175700','3760020507350','3228857002344',
  '7311070032611','3284230006408','3168930163480','3029330022428','3760049794298','7300400481595',
  '7300400481588','3327272107969','3229820160672','3155250358788','3155251205296','3760049791006',
  '6111099003897','3760091727732','3229820019307','3608580124047','3229820129488','3387390123210',
  '20724696','5010477348678','3083681148640',
  -- barcode test sheet items imported live from OFF
  '030000010402','051500255162','041196419429','096619194261','058449770565','747479000413',
  '070662010037','096619555505','096619937325'
);

-- Orange juice imported before juice detection used whole tags.
UPDATE products SET is_juice = true WHERE barcode = '048500205723' AND NOT is_juice;

UPDATE rules SET note = 'Juice, or a drink with 0.5 g or more sugar (added or total, whichever is larger), is red on a diabetes tier even when sodium is 0. Water and unsweetened drinks follow the normal sugar bands; missing sugar data is Ask a volunteer.'
WHERE rule_id = 'SUG_DRINK';
