CREATE TABLE IF NOT EXISTS trace_webhook_inbox (
  tenant_id text NOT NULL DEFAULT 'legacy',
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  result text,
  last_error text,
  PRIMARY KEY (tenant_id,event_id)
);
-- Additive upgrade of the original inbox: accepted raw events are retained.
-- Legacy rows stay in the legacy tenant and are not attached to customer orders.
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'legacy';
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS lease_token text;
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE trace_webhook_inbox ADD COLUMN IF NOT EXISTS last_error text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='trace_webhook_inbox'::regclass AND contype='p' AND cardinality(conkey)=1) THEN
    ALTER TABLE trace_webhook_inbox DROP CONSTRAINT trace_webhook_inbox_pkey;
    ALTER TABLE trace_webhook_inbox ADD PRIMARY KEY (tenant_id,event_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS trace_webhook_inbox_due ON trace_webhook_inbox (tenant_id,next_attempt_at) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS trace_starter_customers (
  tenant_id text NOT NULL,
  id text NOT NULL,
  handle text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,handle)
);
CREATE TABLE IF NOT EXISTS trace_starter_sessions (
  token_hash text PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (tenant_id,customer_id) REFERENCES trace_starter_customers (tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS trace_starter_sessions_expiry ON trace_starter_sessions (expires_at);
CREATE TABLE IF NOT EXISTS trace_starter_auth_attempts (key text PRIMARY KEY,attempts integer NOT NULL,window_until timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS trace_starter_orders (
  tenant_id text NOT NULL,
  id text NOT NULL,
  customer_id text NOT NULL,
  reference text NOT NULL,
  expected_parcels integer NOT NULL DEFAULT 1 CHECK (expected_parcels BETWEEN 1 AND 10),
  simulated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES trace_starter_customers (tenant_id,id)
);
ALTER TABLE trace_starter_orders ADD COLUMN IF NOT EXISTS expected_parcels integer NOT NULL DEFAULT 1 CHECK (expected_parcels BETWEEN 1 AND 10);
CREATE TABLE IF NOT EXISTS trace_starter_shipments (
  tenant_id text NOT NULL,
  shipment_id text NOT NULL,
  order_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision>=1),
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,shipment_id),
  FOREIGN KEY (tenant_id,order_id) REFERENCES trace_starter_orders (tenant_id,id)
);
