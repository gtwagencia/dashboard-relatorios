-- System-wide key/value settings (tokens, API keys stored in DB)
-- Values are stored encrypted at the application level when sensitive.
CREATE TABLE IF NOT EXISTS system_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
