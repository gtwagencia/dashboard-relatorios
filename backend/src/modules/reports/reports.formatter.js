'use strict';

/**
 * Map report type to event name.
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 * @returns {string}
 */
function getEventName(type) {
  const map = { daily: 'report.daily', weekly: 'report.weekly', monthly: 'report.monthly' };
  return map[type] || `report.${type}`;
}

/**
 * Compute summary object from raw metrics rows.
 * @param {object[]} metrics - Rows from campaign_metrics
 * @returns {object}
 */
function computeSummary(metrics) {
  let totalSpend = 0;
  let totalLeads = 0;
  let totalConversions = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalReach = 0;

  for (const m of metrics) {
    totalSpend += parseFloat(m.spend || 0);
    totalLeads += parseInt(m.leads || 0, 10);
    totalConversions += parseInt(m.conversions || 0, 10);
    totalImpressions += parseInt(m.impressions || 0, 10);
    totalClicks += parseInt(m.clicks || 0, 10);
    totalReach += parseInt(m.reach || 0, 10);
  }

  const costPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;

  return {
    total_spend: Math.round(totalSpend * 100) / 100,
    total_leads: totalLeads,
    cost_per_lead: Math.round(costPerLead * 100) / 100,
    total_reach: totalReach,
    avg_ctr: Math.round(avgCtr * 10000) / 10000,
    avg_cpm: Math.round(avgCpm * 100) / 100,
    total_conversions: totalConversions,
    cost_per_conversion: Math.round(costPerConversion * 100) / 100,
  };
}

/**
 * Format a campaign row into report-friendly shape.
 * @param {object} c - Campaign row with aggregated metrics
 * @returns {object}
 */
function formatCampaign(c) {
  return {
    id: c.campaign_id || c.id,
    name: c.name,
    objective: c.objective,
    spend: Math.round(parseFloat(c.total_spend || c.spend || 0) * 100) / 100,
    leads: parseInt(c.total_leads || c.leads || 0, 10),
    conversions: parseInt(c.total_conversions || c.conversions || 0, 10),
    ctr: parseFloat(c.avg_ctr || c.ctr || 0),
    cpc: parseFloat(c.avg_cpc || c.cpc || 0),
    cpm: parseFloat(c.avg_cpm || c.cpm || 0),
    reach: parseInt(c.total_reach || c.reach || 0, 10),
    impressions: parseInt(c.total_impressions || c.impressions || 0, 10),
    clicks: parseInt(c.total_clicks || c.clicks || 0, 10),
  };
}

/**
 * Build the full n8n webhook payload for a report.
 *
 * @param {string}   clientId
 * @param {string}   clientName
 * @param {string}   type           - 'daily' | 'weekly' | 'monthly'
 * @param {string}   objective      - e.g. 'leads' | 'all'
 * @param {string}   periodStart    - YYYY-MM-DD
 * @param {string}   periodEnd      - YYYY-MM-DD
 * @param {object[]} metrics        - Raw metric rows
 * @param {object[]} campaigns      - Campaign rows with aggregated spend/leads etc.
 * @param {string}   [aiInsight]    - Optional AI-generated insight text
 * @returns {object}
 */
function formatReport(clientId, clientName, type, objective, periodStart, periodEnd, metrics, campaigns, aiInsight) {
  const summary = computeSummary(metrics);
  const formattedCampaigns = campaigns.map(formatCampaign);

  const payload = {
    event: getEventName(type),
    generated_at: new Date().toISOString(),
    client_id: clientId,
    client_name: clientName,
    period: {
      start: periodStart,
      end: periodEnd,
    },
    objective_type: objective || 'all',
    summary,
    campaigns: formattedCampaigns,
  };

  if (aiInsight) {
    payload.ai_insight = aiInsight;
  }

  return payload;
}

module.exports = { formatReport, computeSummary, formatCampaign, getEventName };
