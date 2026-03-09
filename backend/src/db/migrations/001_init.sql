-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────────────
-- clients
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  role         VARCHAR(20)  NOT NULL DEFAULT 'client',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_email     ON clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients (is_active);

-- ──────────────────────────────────────────────────────────────────────────────
-- meta_accounts
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  ad_account_id     VARCHAR(100) NOT NULL,
  access_token_enc  TEXT NOT NULL,
  token_expires_at  TIMESTAMPTZ,
  business_name     VARCHAR(255),
  currency          VARCHAR(10) NOT NULL DEFAULT 'BRL',
  timezone          VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_accounts_client_id     ON meta_accounts (client_id);
CREATE INDEX IF NOT EXISTS idx_meta_accounts_ad_account_id ON meta_accounts (ad_account_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- campaigns
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id  UUID NOT NULL REFERENCES meta_accounts (id) ON DELETE CASCADE,
  campaign_id      VARCHAR(100) NOT NULL UNIQUE,
  name             VARCHAR(512),
  objective        VARCHAR(100),
  status           VARCHAR(50),
  daily_budget     NUMERIC(14, 2),
  lifetime_budget  NUMERIC(14, 2),
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_meta_account_id ON campaigns (meta_account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_campaign_id    ON campaigns (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status         ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_objective      ON campaigns (objective);

-- ──────────────────────────────────────────────────────────────────────────────
-- campaign_metrics
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  date_start          DATE NOT NULL,
  date_stop           DATE NOT NULL,
  impressions         BIGINT DEFAULT 0,
  reach               BIGINT DEFAULT 0,
  clicks              BIGINT DEFAULT 0,
  spend               NUMERIC(12, 2) DEFAULT 0,
  ctr                 NUMERIC(8, 4)  DEFAULT 0,
  cpc                 NUMERIC(10, 4) DEFAULT 0,
  cpm                 NUMERIC(10, 4) DEFAULT 0,
  conversions         INT DEFAULT 0,
  leads               INT DEFAULT 0,
  cost_per_lead       NUMERIC(10, 4) DEFAULT 0,
  cost_per_result     NUMERIC(10, 4) DEFAULT 0,
  frequency           NUMERIC(6, 3)  DEFAULT 0,
  video_views         INT DEFAULT 0,
  raw_json            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign_id  ON campaign_metrics (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date_start   ON campaign_metrics (date_start);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date_stop    ON campaign_metrics (date_stop);

-- ──────────────────────────────────────────────────────────────────────────────
-- reports
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  type          VARCHAR(20)  NOT NULL,           -- daily | weekly | monthly
  objective     VARCHAR(50)  NOT NULL DEFAULT 'all',
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
  webhook_url   TEXT,
  payload_json  JSONB,
  sent_at       TIMESTAMPTZ,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_client_id   ON reports (client_id);
CREATE INDEX IF NOT EXISTS idx_reports_status      ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at  ON reports (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- ai_insights
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_insights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  campaign_id  UUID REFERENCES campaigns (id) ON DELETE SET NULL,
  scope        VARCHAR(20) NOT NULL DEFAULT 'campaign',
  content      TEXT NOT NULL,
  model_used   VARCHAR(100),
  tokens_used  INT DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_client_id   ON ai_insights (client_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_campaign_id ON ai_insights (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at  ON ai_insights (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- webhook_configs
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,
  url         TEXT NOT NULL,
  secret      TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_client_id  ON webhook_configs (client_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_event_type ON webhook_configs (event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_is_active  ON webhook_configs (is_active);

-- ──────────────────────────────────────────────────────────────────────────────
-- refresh_tokens
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id  ON refresh_tokens (client_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- ──────────────────────────────────────────────────────────────────────────────
-- updated_at trigger for clients
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed: default admin user
-- Password placeholder must be replaced before first use.
-- bcrypt hash of "Admin@123" (cost 10) as example:
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO clients (id, name, email, password_hash, role)
VALUES (
  gen_random_uuid(),
  'Admin',
  'admin@dashboard.com',
  '$2a$10$placeholder_change_this_hash_before_going_to_production',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
