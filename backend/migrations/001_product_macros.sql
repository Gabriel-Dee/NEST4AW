-- Additive nullable fields; existing inserts, golden fixtures, and rule thresholds are unchanged.
ALTER TABLE products ADD COLUMN IF NOT EXISTS calories_kcal numeric CHECK (calories_kcal >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS protein_g numeric CHECK (protein_g >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS fat_g numeric CHECK (fat_g >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sugar_g numeric CHECK (sugar_g >= 0);
