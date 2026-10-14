CREATE TABLE IF NOT EXISTS trace_webhook_inbox (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
-- A separate worker should process unprocessed rows transactionally.
-- Receipt is durable; this starter does not perform merchant side effects.
