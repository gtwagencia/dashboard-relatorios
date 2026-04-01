-- Migration 016: Add 'messages' objective template and update existing campaigns

-- Update campaigns that have MESSAGES meta objective to use 'messages' objective
UPDATE campaigns SET objective = 'messages'
WHERE objective = 'engagement'
  AND LOWER(name) SIMILAR TO '%(whatsapp|mensagem|mensagens|conversa|carrossel|wpp)%';

-- Insert default template for messages objective
INSERT INTO message_templates (objective, name, header_block, campaign_block, ad_block, summary_block, is_active)
VALUES (
  'messages',
  'Padrão - Mensagens',
  '*CLIENTE: {{nome_cliente}}*

📱 *DADOS META ADS {{periodo}}*',
  '💬 *Campanha {{indice}}*:
📌 Nome: {{nome_campanha}}
💬 Mensagens: {{mensagens}}
💰 Custo por Mensagem: {{custo_mensagem}}
🖱 Cliques: {{cliques}}
💸 Investimento: {{investimento}}',
  '📣 *Anúncio {{indice_anuncio}}*: {{nome_anuncio}}
💬 Mensagens: {{mensagens}} | 🖱 Cliques: {{cliques}} | 💸 Invest: {{investimento}}',
  '📊 *RESUMO TOTAL*
💰 Total Investido: {{total_investido}}
💬 Total Mensagens: {{total_leads}}
💰 Custo por Mensagem: {{custo_lead_medio}}',
  true
)
ON CONFLICT (objective) DO NOTHING;
