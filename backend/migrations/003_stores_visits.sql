-- Stores, per-store lots, and visit check-in. Existing floor sessions stay in place.

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  geofence_radius_m int NOT NULL DEFAULT 150 CHECK (geofence_radius_m > 0),
  timezone text NOT NULL DEFAULT 'America/New_York',
  open_hours_json jsonb NOT NULL,
  max_floor_capacity int NOT NULL CHECK (max_floor_capacity > 0),
  active_floor_shoppers int NOT NULL DEFAULT 0 CHECK (active_floor_shoppers >= 0),
  max_queue int NOT NULL DEFAULT 15 CHECK (max_queue >= 0),
  is_active boolean NOT NULL DEFAULT true,
  kiosk_code text NOT NULL UNIQUE
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone_hmac bytea;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores (id);
ALTER TABLE checkout_ledger ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores (id);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_token_hash bytea NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients (id),
  store_id uuid NOT NULL REFERENCES stores (id),
  status text NOT NULL CHECK (status IN (
    'queue_waiting', 'active', 'checking_out', 'completed', 'expired'
  )),
  queue_position int,
  check_in_method text NOT NULL CHECK (check_in_method IN ('geofence', 'kiosk', 'staff')),
  check_in_lat double precision,
  check_in_lng double precision,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS visits_one_open
  ON visits (client_id)
  WHERE status IN ('queue_waiting', 'active', 'checking_out');

CREATE INDEX IF NOT EXISTS lots_store_fifo_idx ON lots (store_id, product_id, arrived_on, expires_on);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash bytea PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
