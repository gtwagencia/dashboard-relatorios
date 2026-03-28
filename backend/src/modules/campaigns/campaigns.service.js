'use strict';

const { query } = require('../../config/database');

/**
 * List campaigns for a client with optional filters.
 * @param {string} clientId
 * @param {{ objective?: string, status?: string, page?: number, limit?: number }} filters
 * @returns {Promise<{ campaigns: object[], total: number, page: number, limit: number }>}
 */
async function getCampaigns(clientId, filters = {}) {
  const { objective, status, search, metaAccountId, dateFrom, dateTo } = filters;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const whereParams = [];
  let whereIdx = 1;

  // null clientId means admin sees all campaigns; non-admin sees owned + shared
  if (clientId) {
    conditions.push(`(ma.client_id = $${whereIdx} OR EXISTS (SELECT 1 FROM meta_account_shares s WHERE s.meta_account_id = ma.id AND s.client_id = $${whereIdx}))`);
    whereIdx++;
    whereParams.push(clientId);
  }
  if (objective) {
    conditions.push(`c.objective = $${whereIdx++}`);
    whereParams.push(objective);
  }
  if (status) {
    conditions.push(`c.status = $${whereIdx++}`);
    whereParams.push(status.toUpperCase());
  }
  if (search) {
    conditions.push(`c.name ILIKE $${whereIdx++}`);
    whereParams.push(`%${search}%`);
  }
  if (metaAccountId) {
    conditions.push(`ma.id = $${whereIdx++}`);
    whereParams.push(metaAccountId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Date filter for LEFT JOIN on campaign_metrics (so totals reflect selected period)
  const dataParams = [...whereParams];
  let dataIdx = whereIdx;
  const joinDateParts = [];
  if (dateFrom) {
    joinDateParts.push(`AND cm.date_start >= $${dataIdx++}`);
    dataParams.push(dateFrom);
  }
  if (dateTo) {
    joinDateParts.push(`AND cm.date_stop <= $${dataIdx++}`);
    dataParams.push(dateTo);
  }
  const joinDateClause = joinDateParts.join(' ');

  // Only show campaigns that had at least 1 impression in the selected period
  const havingClause = (dateFrom || dateTo) ? 'HAVING COALESCE(SUM(cm.impressions), 0) > 0' : '';

  // Total count (respects date filter + impressions filter)
  const countResult = await query(
    `SELECT COUNT(*) AS total FROM (
       SELECT c.id
       FROM campaigns c
       JOIN meta_accounts ma ON ma.id = c.meta_account_id
       LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id ${joinDateClause}
       ${whereClause}
       GROUP BY c.id
       ${havingClause}
     ) sub`,
    dataParams
  );

  const total = parseInt(countResult.rows[0].total, 10);

  // Paginated results with spend/metrics filtered by date range
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
       COALESCE(SUM(cm.spend), 0)::NUMERIC(14,2)        AS total_spend,
       COALESCE(SUM(cm.impressions), 0)::BIGINT          AS total_impressions,
       COALESCE(SUM(cm.clicks), 0)::BIGINT               AS total_clicks,
       COALESCE(SUM(cm.leads), 0)::INT                   AS total_leads,
       COALESCE(SUM(cm.conversions), 0)::INT             AS total_conversions,
       COALESCE(SUM(cm.conversions_value), 0)::NUMERIC(14,2) AS total_conversions_value
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id ${joinDateClause}
     ${whereClause}
     GROUP BY c.id, ma.business_name, ma.ad_account_id, ma.currency
     ${havingClause}
     ORDER BY
       CASE c.status
         WHEN 'ACTIVE'   THEN 1
         WHEN 'PAUSED'   THEN 2
         WHEN 'INACTIVE' THEN 3
         ELSE                 4
       END,
       c.start_time DESC NULLS LAST,
       c.created_at DESC
     LIMIT $${dataIdx++} OFFSET $${dataIdx++}`,
    [...dataParams, limit, offset]
  );

  const data = campaigns.map((c) => ({
    id: c.id,
    campaignId: c.campaign_id,
    name: c.name,
    objective: c.objective,
    status: c.status,
    dailyBudget: c.daily_budget ? Number(c.daily_budget) : null,
    lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) : null,
    startTime: c.start_time,
    endTime: c.end_time,
    syncedAt: c.synced_at,
    businessName: c.business_name,
    adAccountId: c.ad_account_id,
    currency: c.currency,
    totalSpend: Number(c.total_spend),
    totalImpressions: Number(c.total_impressions),
    totalLeads: Number(c.total_leads),
    totalClicks: Number(c.total_clicks),
    totalConversions: Number(c.total_conversions),
    totalConversionsValue: Number(c.total_conversions_value),
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single campaign by internal UUID, verified to belong to the client.
 * @param {string} clientId
 * @param {string} campaignId - Internal UUID
 * @returns {Promise<object>}
 */
async function getCampaignById(clientId, campaignId) {
  // clientId null = admin, sees any campaign; non-admin sees owned + shared
  const whereExtra = clientId
    ? `AND (ma.client_id = $2 OR EXISTS (SELECT 1 FROM meta_account_shares s WHERE s.meta_account_id = ma.id AND s.client_id = $2))`
    : '';
  const params = clientId ? [campaignId, clientId] : [campaignId];

  const { rows } = await query(
    `SELECT
       c.*,
       ma.business_name,
       ma.ad_account_id,
       ma.currency
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE c.id = $1 ${whereExtra}`,
    params
  );

  if (rows.length === 0) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }

  const c = rows[0];

  // Fetch latest 30 days of metrics
  const { rows: metricsRows } = await query(
    `SELECT date_start, date_stop, impressions, reach, clicks, spend,
            ctr, cpc, cpm, conversions, leads, cost_per_lead, cost_per_result,
            frequency, video_views
     FROM campaign_metrics
     WHERE campaign_id = $1
     ORDER BY date_start DESC
     LIMIT 30`,
    [campaignId]
  );

  return {
    id: c.id,
    campaignId: c.campaign_id,
    name: c.name,
    objective: c.objective,
    status: c.status,
    dailyBudget: c.daily_budget ? Number(c.daily_budget) : null,
    lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) : null,
    startTime: c.start_time,
    endTime: c.end_time,
    syncedAt: c.synced_at,
    businessName: c.business_name,
    adAccountId: c.ad_account_id,
    currency: c.currency,
    recentMetrics: metricsRows.map((m) => ({
      dateStart: m.date_start,
      dateStop: m.date_stop,
      impressions: Number(m.impressions),
      reach: Number(m.reach),
      clicks: Number(m.clicks),
      spend: Number(m.spend),
      ctr: Number(m.ctr),
      cpc: Number(m.cpc),
      cpm: Number(m.cpm),
      conversions: Number(m.conversions),
      leads: Number(m.leads),
      costPerLead: m.cost_per_lead ? Number(m.cost_per_lead) : null,
      frequency: m.frequency ? Number(m.frequency) : null,
      videoViews: Number(m.video_views || 0),
    })),
  };
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
  // Verify ownership or shared access (skip check for admin: clientId null)
  if (clientId) {
    const { rows: ownership } = await query(
      `SELECT c.id
       FROM campaigns c
       JOIN meta_accounts ma ON ma.id = c.meta_account_id
       WHERE c.id = $1
         AND (ma.client_id = $2 OR EXISTS (SELECT 1 FROM meta_account_shares s WHERE s.meta_account_id = ma.id AND s.client_id = $2))`,
      [campaignId, clientId]
    );
    if (ownership.length === 0) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      throw err;
    }
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

  return rows.map((m) => ({
    dateStart: m.date_start,
    dateStop: m.date_stop,
    impressions: Number(m.impressions),
    reach: Number(m.reach),
    clicks: Number(m.clicks),
    spend: Number(m.spend),
    ctr: Number(m.ctr),
    cpc: Number(m.cpc),
    cpm: Number(m.cpm),
    conversions: Number(m.conversions),
    leads: Number(m.leads),
    costPerLead: m.cost_per_lead ? Number(m.cost_per_lead) : null,
    frequency: m.frequency ? Number(m.frequency) : null,
    videoViews: Number(m.video_views || 0),
  }));
}

/**
 * Get all ads for a campaign with aggregated metrics over a date range.
 * @param {string} clientId    - null for admin
 * @param {string} campaignId  - Internal UUID
 * @param {string} [dateFrom]  - YYYY-MM-DD
 * @param {string} [dateTo]    - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function getCampaignAds(clientId, campaignId, dateFrom, dateTo) {
  // Verify ownership or shared access (skip check for admin: clientId null)
  if (clientId) {
    const { rows: ownership } = await query(
      `SELECT c.id
       FROM campaigns c
       JOIN meta_accounts ma ON ma.id = c.meta_account_id
       WHERE c.id = $1
         AND (ma.client_id = $2 OR EXISTS (SELECT 1 FROM meta_account_shares s WHERE s.meta_account_id = ma.id AND s.client_id = $2))`,
      [campaignId, clientId]
    );
    if (ownership.length === 0) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      throw err;
    }
  }

  const params = [campaignId];
  let paramIdx = 2;
  const dateConditions = [];
  if (dateFrom) {
    dateConditions.push(`AND am.date_start >= $${paramIdx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    dateConditions.push(`AND am.date_stop <= $${paramIdx++}`);
    params.push(dateTo);
  }
  const dateClause = dateConditions.join(' ');

  const { rows } = await query(
    `SELECT
       a.id,
       a.ad_id,
       a.name,
       a.status,
       a.thumbnail_url,
       a.creative_id,
       COALESCE(SUM(am.spend), 0)::NUMERIC(14,2)       AS total_spend,
       COALESCE(SUM(am.impressions), 0)::BIGINT         AS total_impressions,
       COALESCE(SUM(am.clicks), 0)::INT                 AS total_clicks,
       COALESCE(SUM(am.leads), 0)::INT                  AS total_leads,
       COALESCE(SUM(am.conversions), 0)::INT            AS total_conversions,
       COALESCE(SUM(am.conversions_value), 0)::NUMERIC(14,2) AS total_conversions_value,
       CASE WHEN SUM(am.impressions) > 0
            THEN (SUM(am.clicks)::FLOAT / SUM(am.impressions) * 100)
            ELSE 0 END::NUMERIC(8,4)                    AS avg_ctr,
       CASE WHEN SUM(am.clicks) > 0
            THEN (SUM(am.spend) / SUM(am.clicks))
            ELSE 0 END::NUMERIC(10,4)                   AS avg_cpc,
       CASE WHEN SUM(am.impressions) > 0
            THEN (SUM(am.spend) / SUM(am.impressions) * 1000)
            ELSE 0 END::NUMERIC(10,4)                   AS avg_cpm
     FROM ads a
     LEFT JOIN ad_metrics am ON am.ad_id = a.id ${dateClause}
     WHERE a.campaign_id = $1
     GROUP BY a.id
     ORDER BY total_spend DESC`,
    params
  );

  return rows.map((a) => ({
    id: a.id,
    adId: a.ad_id,
    name: a.name,
    status: a.status,
    thumbnailUrl: a.thumbnail_url || null,
    creativeId: a.creative_id || null,
    totalSpend: Number(a.total_spend),
    totalImpressions: Number(a.total_impressions),
    totalClicks: Number(a.total_clicks),
    totalLeads: Number(a.total_leads),
    totalConversions: Number(a.total_conversions),
    totalConversionsValue: Number(a.total_conversions_value),
    avgCtr: Number(a.avg_ctr),
    avgCpc: Number(a.avg_cpc),
    avgCpm: Number(a.avg_cpm),
  }));
}

module.exports = { getCampaigns, getCampaignById, getCampaignMetrics, getCampaignAds };
