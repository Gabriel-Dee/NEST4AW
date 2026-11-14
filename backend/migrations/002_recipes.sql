-- Additive recipe library, per-client cards, saves, and a one-day response cache.
-- No clinical table, stock row, or ledger row is rewritten.

CREATE TABLE IF NOT EXISTS recipes_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  time_min int NOT NULL CHECK (time_min > 0),
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium')),
  tags text[] NOT NULL,
  why_good_for_you text NOT NULL,
  steps text[] NOT NULL,
  pantry_staples text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS recipe_library_ingredients (
  recipe_id uuid NOT NULL REFERENCES recipes_library (id) ON DELETE CASCADE,
  sort_order int NOT NULL,
  product_key text NOT NULL DEFAULT '',
  name text NOT NULL,
  amount text NOT NULL,
  category text NOT NULL,
  PRIMARY KEY (recipe_id, sort_order)
);

CREATE TABLE IF NOT EXISTS recipe_cards (
  client_id uuid NOT NULL REFERENCES clients (id),
  id uuid NOT NULL,
  payload jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('ai', 'library')),
  created_on date NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (client_id, id)
);

CREATE TABLE IF NOT EXISTS saved_recipes (
  client_id uuid NOT NULL REFERENCES clients (id),
  recipe_id uuid NOT NULL,
  points int NOT NULL DEFAULT 1 CHECK (points > 0),
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, recipe_id),
  FOREIGN KEY (client_id, recipe_id) REFERENCES recipe_cards (client_id, id)
);

CREATE TABLE IF NOT EXISTS recipe_cache (
  cache_key text PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients (id),
  mode text NOT NULL,
  payload jsonb NOT NULL,
  created_on date NOT NULL DEFAULT CURRENT_DATE
);
