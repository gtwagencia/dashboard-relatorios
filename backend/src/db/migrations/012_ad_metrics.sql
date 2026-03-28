-- Ad-level tracking
CREATE TABLE IF NOT EXISTS ads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_id        VARCHAR(100) NOT NULL UNIQUE,
  name         VARCHAR(512),
  status       VARCHAR(50),
  synced_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_campaign_id ON ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_ad_id       ON ads(ad_id);
CREATE INDEX IF NOT EXISTS idx_ads_status      ON ads(status);

CREATE TABLE IF NOT EXISTS ad_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id             UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  date_start        DATE NOT NULL,
  date_stop         DATE NOT NULL,
  impressions       BIGINT        DEFAULT 0,
  reach             BIGINT        DEFAULT 0,
  clicks            INT           DEFAULT 0,
  spend             NUMERIC(12,2) DEFAULT 0,
  ctr               NUMERIC(8,4)  DEFAULT 0,
  cpc               NUMERIC(10,4) DEFAULT 0,
  cpm               NUMERIC(10,4) DEFAULT 0,
  conversions       INT           DEFAULT 0,
  leads             INT           DEFAULT 0,
  conversions_value NUMERIC(14,2) DEFAULT 0,
  raw_json          JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(ad_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_ad_metrics_ad_id      ON ad_metrics(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_date_start ON ad_metrics(date_start);

-- Add ad_block to message_templates (per-ad line inside a campaign block)
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS ad_block TEXT NOT NULL DEFAULT '';

-- Seed default ad_block for each objective
UPDATE message_templates SET ad_block =
  '   📣 *Anúncio {{indice_anuncio}}*: {{nome_anuncio}}
   👤 Leads: {{leads}} | 🖱️ Cliques: {{cliques}} | 💰 CPL: {{custo_lead}} | 💸 Invest: {{investimento}}'
WHERE objective = 'leads';

UPDATE message_templates SET ad_block =
  '   📣 *Anúncio {{indice_anuncio}}*: {{nome_anuncio}}
   🛒 Vendas: {{vendas}} | 🖱️ Cliques: {{cliques}} | 💰 Custo/Venda: {{custo_venda}} | 💸 Invest: {{investimento}}'
WHERE objective = 'sales';

UPDATE message_templates SET ad_block =
  '   📣 *Anúncio {{indice_anuncio}}*: {{nome_anuncio}}
   👁️ Impressões: {{impressoes}} | 🖱️ Cliques: {{cliques}} | 📊 CTR: {{ctr}} | 💸 Invest: {{investimento}}'
WHERE objective = 'engagement';

UPDATE message_templates SET ad_block =
  '   📣 *Anúncio {{indice_anuncio}}*: {{nome_anuncio}}
   👁️ Impressões: {{impressoes}} | 🖱️ Cliques: {{cliques}} | 💸 Invest: {{investimento}}'
WHERE objective = 'awareness';

UPDATE message_templates SET ad_block =
  '   📣 *Anúncio {{indice_anuncio}}*: {{nome_anuncio}}
   🖱️ Cliques: {{cliques}} | 📊 CTR: {{ctr}} | 💸 Invest: {{investimento}}'
WHERE objective = 'traffic';
