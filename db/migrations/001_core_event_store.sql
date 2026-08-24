BEGIN;

CREATE TABLE IF NOT EXISTS journal_events (
  sequence_id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('decision', 'order', 'receipt', 'position')),
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_events_type_sequence_idx
  ON journal_events (event_type, sequence_id);

CREATE TABLE IF NOT EXISTS service_checkpoints (
  consumer_name TEXT PRIMARY KEY,
  last_sequence_id BIGINT NOT NULL REFERENCES journal_events(sequence_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_documents (
  strategy_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (strategy_id, version)
);

CREATE TABLE IF NOT EXISTS project_registry_items (
  item_id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  item JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
