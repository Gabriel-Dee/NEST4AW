-- Short checkout codes: the shopper's phone shows a QR and the same 4 digits, so a volunteer
-- can load the visit by scanning or typing. One live code per visit; codes expire quickly and
-- only staff can look them up. Idempotent: runs on every startup.
CREATE TABLE IF NOT EXISTS checkout_codes (
  code text PRIMARY KEY CHECK (code ~ '^[0-9]{4}$'),
  visit_id uuid NOT NULL UNIQUE REFERENCES visits (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
