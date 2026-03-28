'use strict';

const { query } = require('../../config/database');

const OBJECTIVES = ['leads', 'sales', 'engagement', 'awareness', 'traffic'];

async function listTemplates() {
  const { rows } = await query(
    `SELECT id, objective, name, header_block, campaign_block, summary_block, is_active, updated_at
     FROM message_templates ORDER BY objective`
  );
  return rows;
}

async function getTemplate(objective) {
  const { rows } = await query(
    `SELECT id, objective, name, header_block, campaign_block, summary_block, is_active
     FROM message_templates WHERE objective = $1`,
    [objective]
  );
  return rows[0] || null;
}

async function upsertTemplate(objective, { name, headerBlock, campaignBlock, summaryBlock, isActive }) {
  if (!OBJECTIVES.includes(objective)) {
    const err = new Error(`Objetivo inválido: ${objective}`);
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `INSERT INTO message_templates (objective, name, header_block, campaign_block, summary_block, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (objective) DO UPDATE SET
       name           = EXCLUDED.name,
       header_block   = EXCLUDED.header_block,
       campaign_block = EXCLUDED.campaign_block,
       summary_block  = EXCLUDED.summary_block,
       is_active      = EXCLUDED.is_active,
       updated_at     = NOW()
     RETURNING *`,
    [objective, name, headerBlock, campaignBlock, summaryBlock, isActive ?? true]
  );
  return rows[0];
}

function fmtCurrency(value) {
  return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function fmtPercent(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function formatPeriod(type, periodStart, periodEnd) {
  const fmt = (d) => {
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  };
  if (type === 'daily') return fmt(periodStart);
  return `de ${fmt(periodStart)} a ${fmt(periodEnd)}`;
}

/**
 * Render a full WhatsApp message from a template + report data.
 */
function renderMessage(template, { clientName, reportType, periodStart, periodEnd, campaigns, summary, balance }) {
  const periodo = formatPeriod(reportType, periodStart, periodEnd);

  const globalVars = {
    nome_cliente:       clientName,
    periodo,
    total_investido:    fmtCurrency(summary.total_spend),
    total_leads:        fmtNumber(summary.total_leads),
    custo_lead_medio:   fmtCurrency(summary.cost_per_lead),
    total_vendas:       fmtNumber(summary.total_conversions),
    custo_venda_medio:  fmtCurrency(summary.cost_per_conversion),
    valor_vendas_total: fmtCurrency(summary.total_conversions_value || 0),
    total_impressoes:   fmtNumber(summary.total_impressions || 0),
    total_cliques:      fmtNumber(summary.total_clicks || 0),
    ctr_medio:          fmtPercent(summary.avg_ctr),
    saldo_conta:        balance ? fmtCurrency(balance) : '',
  };

  function substituteVars(tmpl, vars) {
    return tmpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{{${key}}}`);
  }

  const header = substituteVars(template.header_block, globalVars);

  const campaignBlocks = campaigns.map((c, i) => {
    const vars = {
      indice:          String(i + 1),
      nome_campanha:   c.name,
      leads:           fmtNumber(c.leads),
      custo_lead:      fmtCurrency(c.leads > 0 ? c.spend / c.leads : 0),
      cliques:         fmtNumber(c.clicks),
      investimento:    fmtCurrency(c.spend),
      vendas:          fmtNumber(c.conversions),
      custo_venda:     fmtCurrency(c.conversions > 0 ? c.spend / c.conversions : 0),
      valor_vendas:    fmtCurrency(c.conversions_value || 0),
      impressoes:      fmtNumber(c.impressions),
      ctr:             fmtPercent(c.ctr),
      cpm:             fmtCurrency(c.cpm),
      cpc:             fmtCurrency(c.cpc),
    };
    return substituteVars(template.campaign_block, vars);
  });

  const summary_block = substituteVars(template.summary_block, globalVars);

  const parts = [header, ...campaignBlocks, summary_block];
  if (globalVars.saldo_conta) {
    parts.push(`💳 Saldo Disponível: ${globalVars.saldo_conta}`);
  }
  return parts.join('\n\n');
}

module.exports = { listTemplates, getTemplate, upsertTemplate, renderMessage, OBJECTIVES };
