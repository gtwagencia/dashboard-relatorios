'use strict';

const { query } = require('../../config/database');

const OBJECTIVES = ['leads', 'sales', 'engagement', 'awareness', 'traffic'];

async function listTemplates() {
  const { rows } = await query(
    `SELECT id, objective, name, header_block, campaign_block, ad_block, summary_block, is_active, updated_at
     FROM message_templates ORDER BY objective`
  );
  return rows;
}

async function getTemplate(objective) {
  const { rows } = await query(
    `SELECT id, objective, name, header_block, campaign_block, ad_block, summary_block, is_active
     FROM message_templates WHERE objective = $1`,
    [objective]
  );
  return rows[0] || null;
}

async function upsertTemplate(objective, { name, headerBlock, campaignBlock, adBlock, summaryBlock, isActive }) {
  if (!OBJECTIVES.includes(objective)) {
    const err = new Error(`Objetivo inválido: ${objective}`);
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `INSERT INTO message_templates (objective, name, header_block, campaign_block, ad_block, summary_block, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (objective) DO UPDATE SET
       name           = EXCLUDED.name,
       header_block   = EXCLUDED.header_block,
       campaign_block = EXCLUDED.campaign_block,
       ad_block       = EXCLUDED.ad_block,
       summary_block  = EXCLUDED.summary_block,
       is_active      = EXCLUDED.is_active,
       updated_at     = NOW()
     RETURNING *`,
    [objective, name, headerBlock, campaignBlock, adBlock ?? '', summaryBlock, isActive ?? true]
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
function renderMessage(template, { clientName, accountName, reportType, periodStart, periodEnd, campaigns, summary, balance }) {
  const periodo = formatPeriod(reportType, periodStart, periodEnd);

  const globalVars = {
    nome_cliente:        clientName,
    nome_conta_anuncio:  accountName || clientName,
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

  function buildAdVars(a, adIndex) {
    return {
      indice_anuncio: String(adIndex + 1),
      nome_anuncio:   a.name,
      leads:          fmtNumber(a.leads),
      custo_lead:     fmtCurrency(a.leads > 0 ? a.spend / a.leads : 0),
      cliques:        fmtNumber(a.clicks),
      investimento:   fmtCurrency(a.spend),
      vendas:         fmtNumber(a.conversions),
      custo_venda:    fmtCurrency(a.conversions > 0 ? a.spend / a.conversions : 0),
      valor_vendas:   fmtCurrency(a.conversions_value || 0),
      impressoes:     fmtNumber(a.impressions),
      ctr:            fmtPercent(a.ctr),
      cpm:            fmtCurrency(a.cpm),
      cpc:            fmtCurrency(a.cpc),
    };
  }

  const campaignBlocks = campaigns.map((c, i) => {
    const campaignVars = {
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

    const campaignHeader = substituteVars(template.campaign_block, campaignVars);

    // When campaign has multiple ads, append individual ad blocks below campaign header
    if (c.ads && c.ads.length > 1 && template.ad_block) {
      const adLines = c.ads.map((a, ai) =>
        substituteVars(template.ad_block, buildAdVars(a, ai))
      );
      return campaignHeader + '\n' + adLines.join('\n');
    }

    return campaignHeader;
  });

  const summary_block = substituteVars(template.summary_block, globalVars);

  const parts = [header, ...campaignBlocks, summary_block];
  if (globalVars.saldo_conta) {
    parts.push(`💳 Saldo Disponível: ${globalVars.saldo_conta}`);
  }
  return parts.join('\n\n');
}

/**
 * Render a single WhatsApp message containing ALL campaign types present in the data.
 * Campaigns are grouped by objective. Each group uses its own template (campaign_block/ad_block).
 * A single global header and summary wrap everything.
 *
 * @param {{ clientName, reportType, periodStart, periodEnd, campaigns, summary, balance }} data
 * @returns {Promise<string>}
 */
async function renderFullMessage({ clientName, accountName, reportType, periodStart, periodEnd, campaigns, summary, balance }) {
  const periodo = formatPeriod(reportType, periodStart, periodEnd);

  const globalVars = {
    nome_cliente:        clientName,
    nome_conta_anuncio:  accountName || clientName,
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

  // Section label per objective
  const OBJECTIVE_LABELS = {
    leads:      '💼 *Leads*',
    sales:      '🛒 *Vendas*',
    engagement: '👁️ *Engajamento*',
    awareness:  '📢 *Alcance/Awareness*',
    traffic:    '🖱️ *Tráfego*',
  };

  // Group campaigns by objective (only include objectives that have campaigns)
  const grouped = {};
  for (const c of campaigns) {
    const obj = c.objective || 'leads';
    if (!grouped[obj]) grouped[obj] = [];
    grouped[obj].push(c);
  }

  const objectiveOrder = ['leads', 'sales', 'engagement', 'awareness', 'traffic'];
  const sections = [];

  for (const obj of objectiveOrder) {
    const group = grouped[obj];
    if (!group || group.length === 0) continue;

    // Load template for this objective; skip section if template inactive or missing
    const template = await getTemplate(obj);
    if (!template || !template.is_active) continue;

    const sectionLabel = OBJECTIVE_LABELS[obj] || `📊 *${obj}*`;
    const campaignLines = group.map((c, i) => {
      const campaignVars = {
        indice:        String(i + 1),
        nome_campanha: c.name,
        leads:         fmtNumber(c.leads),
        custo_lead:    fmtCurrency(c.leads > 0 ? c.spend / c.leads : 0),
        cliques:       fmtNumber(c.clicks),
        investimento:  fmtCurrency(c.spend),
        vendas:        fmtNumber(c.conversions),
        custo_venda:   fmtCurrency(c.conversions > 0 ? c.spend / c.conversions : 0),
        valor_vendas:  fmtCurrency(c.conversions_value || 0),
        impressoes:    fmtNumber(c.impressions),
        ctr:           fmtPercent(c.ctr),
        cpm:           fmtCurrency(c.cpm),
        cpc:           fmtCurrency(c.cpc),
      };
      const line = substituteVars(template.campaign_block, campaignVars);

      if (c.ads && c.ads.length > 1 && template.ad_block) {
        const adLines = c.ads.map((a, ai) =>
          substituteVars(template.ad_block, {
            indice_anuncio: String(ai + 1),
            nome_anuncio:   a.name,
            leads:          fmtNumber(a.leads),
            custo_lead:     fmtCurrency(a.leads > 0 ? a.spend / a.leads : 0),
            cliques:        fmtNumber(a.clicks),
            investimento:   fmtCurrency(a.spend),
            vendas:         fmtNumber(a.conversions),
            custo_venda:    fmtCurrency(a.conversions > 0 ? a.spend / a.conversions : 0),
            valor_vendas:   fmtCurrency(a.conversions_value || 0),
            impressoes:     fmtNumber(a.impressions),
            ctr:            fmtPercent(a.ctr),
            cpm:            fmtCurrency(a.cpm),
            cpc:            fmtCurrency(a.cpc),
          })
        );
        return line + '\n' + adLines.join('\n');
      }
      return line;
    });

    sections.push(`${sectionLabel}\n${campaignLines.join('\n')}`);
  }

  // Use the 'leads' template header/summary as global wrapper (most common),
  // falling back to whichever template is available
  const wrapperObjective = Object.keys(grouped).find(o => grouped[o].length > 0) || 'leads';
  const wrapperTemplate = await getTemplate(wrapperObjective);

  const header  = wrapperTemplate ? substituteVars(wrapperTemplate.header_block, globalVars) : `📊 *Relatório ${reportType} — ${clientName}*\n📅 ${periodo}`;
  const summaryBlock = wrapperTemplate ? substituteVars(wrapperTemplate.summary_block, globalVars) : `💰 Total investido: ${globalVars.total_investido}`;

  const parts = [header, ...sections, summaryBlock];
  if (globalVars.saldo_conta) {
    parts.push(`💳 Saldo Disponível: ${globalVars.saldo_conta}`);
  }

  return parts.join('\n\n');
}

module.exports = { listTemplates, getTemplate, upsertTemplate, renderMessage, renderFullMessage, OBJECTIVES };
