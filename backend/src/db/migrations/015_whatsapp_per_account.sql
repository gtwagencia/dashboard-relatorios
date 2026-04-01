-- Move WhatsApp notification config from clients to meta_accounts
-- Each ad account can now have its own WhatsApp delivery settings

ALTER TABLE meta_accounts
  ADD COLUMN IF NOT EXISTS whatsapp_enabled  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_number   VARCHAR(30),
  ADD COLUMN IF NOT EXISTS whatsapp_api_url  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_api_key  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_instance VARCHAR(100);

-- Track which account a report belongs to (for per-account report history)
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS meta_account_id UUID REFERENCES meta_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_meta_account_id ON reports(meta_account_id);
