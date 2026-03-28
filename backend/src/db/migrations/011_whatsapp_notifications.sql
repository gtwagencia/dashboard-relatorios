-- WhatsApp delivery config per client
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_number        TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_api_url         TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_api_key         TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_instance        TEXT,
  ADD COLUMN IF NOT EXISTS report_objective         VARCHAR(20) DEFAULT 'leads';

-- Message templates (global, admin-managed, one per objective)
CREATE TABLE IF NOT EXISTS message_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective    VARCHAR(20) NOT NULL,
  name         VARCHAR(100) NOT NULL,
  header_block  TEXT NOT NULL DEFAULT '',
  campaign_block TEXT NOT NULL DEFAULT '',
  summary_block  TEXT NOT NULL DEFAULT '',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(objective)
);

-- Seed default templates
INSERT INTO message_templates (objective, name, header_block, campaign_block, summary_block) VALUES
('leads', 'Padrão - Leads',
  '*CLIENTE: {{nome_cliente}}*

📊 *DADOS META ADS {{periodo}}*',
  '🟢 *Campanha {{indice}}*:
📌 Nome: {{nome_campanha}}
👤 Leads: {{leads}}
🖱️ Cliques: {{cliques}}
💰 Valor por Lead: {{custo_lead}}
💸 Investimento: {{investimento}}',
  '📈 *RESUMO TOTAL*
🏦 Total Investido: {{total_investido}}
👥 Leads Gerados: {{total_leads}}
💰 Valor por Lead: {{custo_lead_medio}}'
),
('sales', 'Padrão - Vendas',
  '*CLIENTE: {{nome_cliente}}*

📊 *DADOS META ADS {{periodo}}*',
  '🟢 *Campanha {{indice}}*:
📌 Nome: {{nome_campanha}}
🛒 Vendas: {{vendas}}
🖱️ Cliques: {{cliques}}
💰 Custo por Venda: {{custo_venda}}
💵 Total em Vendas: {{valor_vendas}}
💸 Investimento: {{investimento}}',
  '📈 *RESUMO TOTAL*
🏦 Total Investido: {{total_investido}}
🛒 Vendas Realizadas: {{total_vendas}}
💵 Total em Vendas: {{valor_vendas_total}}
💰 Custo por Venda: {{custo_venda_medio}}'
),
('engagement', 'Padrão - Engajamento',
  '*CLIENTE: {{nome_cliente}}*

📊 *DADOS META ADS {{periodo}}*',
  '🟢 *Campanha {{indice}}*:
📌 Nome: {{nome_campanha}}
👁️ Impressões: {{impressoes}}
🖱️ Cliques: {{cliques}}
📊 CTR: {{ctr}}
💸 Investimento: {{investimento}}',
  '📈 *RESUMO TOTAL*
🏦 Total Investido: {{total_investido}}
👁️ Total Impressões: {{total_impressoes}}
🖱️ Total Cliques: {{total_cliques}}
📊 CTR Médio: {{ctr_medio}}'
),
('awareness', 'Padrão - Alcance',
  '*CLIENTE: {{nome_cliente}}*

📊 *DADOS META ADS {{periodo}}*',
  '🟢 *Campanha {{indice}}*:
📌 Nome: {{nome_campanha}}
👁️ Impressões: {{impressoes}}
🖱️ Cliques: {{cliques}}
💸 Investimento: {{investimento}}',
  '📈 *RESUMO TOTAL*
🏦 Total Investido: {{total_investido}}
👁️ Total Impressões: {{total_impressoes}}
🖱️ Total Cliques: {{total_cliques}}'
),
('traffic', 'Padrão - Tráfego',
  '*CLIENTE: {{nome_cliente}}*

📊 *DADOS META ADS {{periodo}}*',
  '🟢 *Campanha {{indice}}*:
📌 Nome: {{nome_campanha}}
🖱️ Cliques: {{cliques}}
📊 CTR: {{ctr}}
💸 Investimento: {{investimento}}',
  '📈 *RESUMO TOTAL*
🏦 Total Investido: {{total_investido}}
🖱️ Total Cliques: {{total_cliques}}
📊 CTR Médio: {{ctr_medio}}'
)
ON CONFLICT (objective) DO NOTHING;
