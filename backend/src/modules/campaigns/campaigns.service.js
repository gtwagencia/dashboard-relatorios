'use strict';

const { query } = require('../../config/database');

/**
 * List campaigns for a client with optional filters.
 * @param {string} clientId
 * @param {{ objective?: string, status?: string, page?: number, limit?: number }} filters
 * @returns {Promise<{ campaigns: object[], total: number, page: number, limit: number }>}
 */
async function getCampaigns(clientId, filters = {}) {
  const { objective, status } = filters;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const conditions = ['ma.client_id = $1'];
  const params = [clientId];
  let paramIdx = 2;

  if (objective) {
    conditions.push(`c.objective = $${paramIdx++}`);
    params.push(objective);
  }
  if (status) {
    conditions.push(`c.status = $${paramIdx++}`);
    params.push(status.toUpperCase());
  }

  const whereClause = conditions.join(' AND ');

  // Total count
  const countResult = await query(
    `SELECT COUNT(*) AS total
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].total, 10);

  // Paginated results with latest spend/metrics
  const { rows: campaigns } = await query(
    `SELECT
       c.id,
       c.campaign_id,
       c.name,
       c.objective,
       c.status,
       c.daily_budget,
       c.lifetime_budget,
       c.start_time,
       c.end_time,
       c.synced_at,
       c.created_at,
       ma.business_name,
       ma.ad_account_id,
       ma.currency,
       COALESCE(SUM(cm.spend), 0)       AS total_spend,
       COALESCE(SUM(cm.impressions), 0) AS total_impressions,
       COALESCE(SUM(cm.clicks), 0)      AS total_clicks,
       COALESCE(SUM(cm.leads), 0)       AS total_leads,
       COALESCE(SUM(cm.conversions), 0) AS total_conversions
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id
     WHERE ${whereClause}
     GROUP BY c.id, ma.business_name, ma.ad_account_id, ma.currency
     ORDER BY c.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  return { campaigns, total, page, limit };
}

/**
 * Get a single campaign by internal UUID, verified to belong to the client.
 * @param {string} clientId
 * @param {string} campaignId - Internal UUID
 * @returns {Promise<object>}
 */
async function getCampaignById(clientId, campaignId) {
  const { rows } = await query(
    `SELECT
       c.*,
       ma.business_name,
       ma.ad_account_id,
       ma.currency
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE c.id = $1 AND ma.client_id = $2`,
    [campaignId, clientId]
  );

  if (rows.length === 0) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  const campaign = rows[0];

  // Fetch latest 30 days of metrics
  const { rows: metrics } = await query(
    `SELECT date_start, date_stop, impressions, reach, clicks, spend,
            ctr, cpc, cpm, conversions, leads, cost_per_lead, cost_per_result,
            frequency, video_views
     FROM campaign_metrics
     WHERE campaign_id = $1
     ORDER BY date_start DESC
     LIMIT 30`,
    [campaignId]
  );

  campaign.recentMetrics = metrics;
  return campaign;
}

/**
 * Return time-series metrics for a campaign over a date range.
 * @param {string} clientId
 * @param {string} campaignId - Internal UUID
 * @param {string} dateFrom   - YYYY-MM-DD
 * @param {string} dateTo     - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function getCampaignMetrics(clientId, campaignId, dateFrom, dateTo) {
  // Verify ownership first
  const { rows: ownership } = await query(
    `SELECT c.id
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE c.id = $1 AND ma.client_id = $2`,
    [campaignId, clientId]
  );

  if (ownership.length === 0) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  const conditions = ['cm.campaign_id = $1'];
  const params = [campaignId];
  let paramIdx = 2;

  if (dateFrom) {
    conditions.push(`cm.date_start >= $${paramIdx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`cm.date_stop <= $${paramIdx++}`);
    params.push(dateTo);
  }

  const { rows } = await query(
    `SELECT
       date_start,
       date_stop,
       impressions,
       reach,
       clicks,
       spend,
       ctr,
       cpc,
       cpm,
       conversions,
       leads,
       cost_per_lead,
       cost_per_result,
       frequency,
       video_views
     FROM campaign_metrics cm
     WHERE ${conditions.join(' AND ')}
     ORDER BY date_start ASC`,
    params
  );

  return rows;
}

module.exports = { getCampaigns, getCampaignById, getCampaignMetrics };
