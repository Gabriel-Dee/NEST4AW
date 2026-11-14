-- NEST4AW system of record. Postgres only.
-- The backend applies this file before any route talks to the database.
-- Recipe vectors live in docs/schema_recipes.sql and wait until checkout works.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM (
  'doctor',
  'client',
  'warehouse_staff',
  'admin',
  'community_partner'
);

CREATE TYPE token_status AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE session_status AS ENUM ('queued', 'active', 'closed', 'expired');
CREATE TYPE verdict AS ENUM ('green', 'yellow', 'red', 'unknown');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role app_role NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users (id),
  legal_name_enc bytea NOT NULL,
  phone_enc bytea,
  name_hmac bytea NOT NULL,
  dm boolean NOT NULL DEFAULT false,
  htn boolean NOT NULL DEFAULT false,
  ckd34 boolean NOT NULL DEFAULT false,
  k_limit_ordered boolean NOT NULL DEFAULT false,
  household_size int NOT NULL CHECK (household_size >= 1),
  tier_id text CHECK (tier_id IN ('T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_allergens (
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN (
    'milk', 'eggs', 'fish', 'crustacean_shellfish', 'tree_nuts',
    'peanuts', 'wheat', 'soybeans', 'sesame'
  )),
  PRIMARY KEY (client_id, code)
);

CREATE TABLE conditions (
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  icd10 text NOT NULL,
  PRIMARY KEY (client_id, icd10)
);

CREATE TABLE enrollment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id),
  token_hash bytea NOT NULL UNIQUE,
  status token_status NOT NULL DEFAULT 'active',
  expires_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rules (
  rule_id text PRIMARY KEY,
  applies text NOT NULL,
  nutrient text,
  op text,
  threshold numeric,
  color text CHECK (color IN ('green', 'yellow', 'red') OR color IS NULL),
  source text NOT NULL,
  source_url text NOT NULL,
  rd_confirm boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT ''
);

CREATE TABLE grants (
  id text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text UNIQUE,
  internal_code text UNIQUE,
  name text NOT NULL,
  brand text,
  serving_text text,
  serving_g numeric,
  sodium_mg numeric,
  potassium_mg numeric,
  phosphorus_mg numeric,
  added_sugar_g numeric,
  carb_g numeric,
  fiber_g numeric,
  gi numeric,
  ingredients text,
  category text,
  is_drink boolean NOT NULL DEFAULT false,
  is_juice boolean NOT NULL DEFAULT false,
  allergen_tags text[] NOT NULL DEFAULT '{}',
  fdc_id text,
  off_code text,
  net_weight_g numeric,
  source text NOT NULL,
  source_url text,
  added_sugar_assumed boolean NOT NULL DEFAULT false
);

CREATE TABLE bins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aisle text NOT NULL,
  shelf text NOT NULL,
  bin_code text NOT NULL,
  product_id uuid NOT NULL REFERENCES products (id),
  min_qty int NOT NULL DEFAULT 0,
  UNIQUE (aisle, shelf, bin_code)
);

CREATE TABLE lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products (id),
  bin_id uuid REFERENCES bins (id),
  grant_id text NOT NULL REFERENCES grants (id),
  arrived_on date NOT NULL,
  expires_on date NOT NULL,
  qty int NOT NULL CHECK (qty >= 0)
);

CREATE TABLE warehouse_limits (
  id int PRIMARY KEY CHECK (id = 1),
  max_floor int NOT NULL CHECK (max_floor > 0),
  max_queue int NOT NULL CHECK (max_queue > 0),
  lease_minutes int NOT NULL CHECK (lease_minutes > 0)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id),
  status session_status NOT NULL,
  queued_at timestamptz,
  lease_expires_at timestamptz,
  tier_id text,
  dm boolean NOT NULL,
  htn boolean NOT NULL,
  ckd34 boolean NOT NULL,
  k_limit_ordered boolean NOT NULL,
  allergens text[] NOT NULL DEFAULT '{}',
  household_size int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions (id),
  product_id uuid NOT NULL REFERENCES products (id),
  qty int NOT NULL CHECK (qty > 0),
  verdict verdict NOT NULL,
  UNIQUE (session_id, product_id)
);

CREATE TABLE checkout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions (id),
  lot_id uuid NOT NULL REFERENCES lots (id),
  product_id uuid NOT NULL REFERENCES products (id),
  grant_id text NOT NULL REFERENCES grants (id),
  tier_id text,
  qty int NOT NULL CHECK (qty > 0),
  sold_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_status_idx ON sessions (status, queued_at);
CREATE INDEX lots_fifo_idx ON lots (product_id, arrived_on, expires_on);
CREATE INDEX clients_name_hmac_idx ON clients (name_hmac);

-- Partner and admin reports read this view only.
-- It has no name, phone, token, or ICD column.
CREATE VIEW analytics_public AS
SELECT
  l.sold_at::date AS day,
  l.tier_id,
  l.grant_id,
  sum(l.qty) AS units,
  sum(l.qty * p.net_weight_g) FILTER (WHERE p.net_weight_g IS NOT NULL) / 453.59237 AS pounds
FROM checkout_ledger l
JOIN products p ON p.id = l.product_id
GROUP BY 1, 2, 3;
