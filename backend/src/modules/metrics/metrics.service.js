'use strict';

const { query } = require('../../config/database');

/**
 * Build a WHERE clause and params for metrics queries scoped to a client.
 * @param {string} clientId
 * @param {string|undefined} dateFrom
 * @param {string|undefined} dateTo
 * @param {string|undefined} campaignId - Optional campaign UUID filter
 * @returns {{ conditions: string[], params: Array, nextIdx: number }}
 */
function buildBaseConditions(clientId, dateFrom, dateTo, campaignId, metaAccountId) {
  const conditions = ['ma.client_id = $1'];
  const params = [clientId];
  let nextIdx = 2;

  if (dateFrom) {
    conditions.push(`cm.date_start >= $${nextIdx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`cm.date_stop <= $${nextIdx++}`);
    params.push(dateTo);
  }
  if (campaignId) {
    conditions.push(`c.id = $${nextIdx++}`);
    params.push(campaignId);
  }
  if (metaAccountId) {
    conditions.push(`ma.id = $${nextIdx++}`);
    params.push(metaAccountId);
  }

  return { conditions, params, nextIdx };
}

/**
 * Aggregate totals across all campaigns for a client.
 * @param {string} clientId
 * @param {string|undefined} dateFrom
 * @param {string|undefined} dateTo
 * @returns {Promise<object>}
 */
async function getSummary(clientId, dateFrom, dateTo, metaAccountId) {
  const { conditions, params } = buildBaseConditions(clientId, dateFrom, dateTo, undefined, metaAccountId);

  const { rows } = await query(
    `SELECT
       COALESCE(SUM(cm.spend), 0)::NUMERIC(14,2)        AS total_spend,
       COALESCE(SUM(cm.impressions), 0)::BIGINT          AS total_impressions,
       COALESCE(SUM(cm.clicks), 0)::BIGINT               AS total_clicks,
       COALESCE(SUM(cm.reach), 0)::BIGINT                AS total_reach,
       COALESCE(SUM(cm.leads), 0)::INT                   AS total_leads,
       COALESCE(SUM(cm.conversions), 0)::INT             AS total_conversions,
       COALESCE(SUM(cm.video_views), 0)::INT             AS total_video_views,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.clicks)::NUMERIC / SUM(cm.impressions) * 100)::NUMERIC(8,4)
            ELSE 0 END                                   AS avg_ctr,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.spend) / SUM(cm.impressions) * 1000)::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cpm,
       CASE WHEN SUM(cm.clicks) > 0
            THEN (SUM(cm.spend) / SUM(cm.clicks))::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cpc,
       CASE WHEN SUM(cm.leads) > 0
            THEN (SUM(cm.spend) / SUM(cm.leads))::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cost_per_lead,
       CASE WHEN SUM(cm.conversions) > 0
            THEN (SUM(cm.spend) / SUM(cm.conversions))::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cost_per_conversion
     FROM campaign_metrics cm
     JOIN campaigns c ON c.id = cm.campaign_id
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  return rows[0];
}

/**
 * Group metrics by campaign objective type.
 * @param {string} clientId
 * @param {string|undefined} dateFrom
 * @param {string|undefined} dateTo
 * @returns {Promise<object[]>}
 */
async function getByObjective(clientId, dateFrom, dateTo, metaAccountId) {
  const { conditions, params } = buildBaseConditions(clientId, dateFrom, dateTo, undefined, metaAccountId);

  const { rows } = await query(
    `SELECT
       c.objective                                        AS objective_type,
       COUNT(DISTINCT c.id)::INT                         AS campaign_count,
       COALESCE(SUM(cm.spend), 0)::NUMERIC(14,2)        AS total_spend,
       COALESCE(SUM(cm.impressions), 0)::BIGINT          AS total_impressions,
       COALESCE(SUM(cm.clicks), 0)::BIGINT               AS total_clicks,
       COALESCE(SUM(cm.reach), 0)::BIGINT                AS total_reach,
       COALESCE(SUM(cm.leads), 0)::INT                   AS total_leads,
       COALESCE(SUM(cm.conversions), 0)::INT             AS total_conversions,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.clicks)::NUMERIC / SUM(cm.impressions) * 100)::NUMERIC(8,4)
            ELSE 0 END                                   AS avg_ctr,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.spend) / SUM(cm.impressions) * 1000)::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cpm,
       CASE WHEN SUM(cm.clicks) > 0
            THEN (SUM(cm.spend) / SUM(cm.clicks))::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cpc,
       CASE WHEN SUM(cm.leads) > 0
            THEN (SUM(cm.spend) / SUM(cm.leads))::NUMERIC(10,4)
            ELSE 0 END                                   AS avg_cost_per_lead
     FROM campaign_metrics cm
     JOIN campaigns c ON c.id = cm.campaign_id
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.objective
     ORDER BY total_spend DESC`,
    params
  );

  return rows;
}

/**
 * Daily time-series of aggregated metrics for charting.
 * @param {string} clientId
 * @param {string|undefined} dateFrom
 * @param {string|undefined} dateTo
 * @param {string|undefined} campaignId - Optionally scope to a single campaign
 * @returns {Promise<object[]>}
 */
async function getTimeseries(clientId, dateFrom, dateTo, campaignId, metaAccountId) {
  const { conditions, params } = buildBaseConditions(clientId, dateFrom, dateTo, campaignId, metaAccountId);

  const { rows } = await query(
    `SELECT
       cm.date_start                                      AS date,
       COALESCE(SUM(cm.spend), 0)::NUMERIC(14,2)        AS spend,
       COALESCE(SUM(cm.impressions), 0)::BIGINT          AS impressions,
       COALESCE(SUM(cm.reach), 0)::BIGINT                AS reach,
       COALESCE(SUM(cm.clicks), 0)::BIGINT               AS clicks,
       COALESCE(SUM(cm.leads), 0)::INT                   AS leads,
       COALESCE(SUM(cm.conversions), 0)::INT             AS conversions,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.clicks)::NUMERIC / SUM(cm.impressions) * 100)::NUMERIC(8,4)
            ELSE 0 END                                   AS ctr,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.spend) / SUM(cm.impressions) * 1000)::NUMERIC(10,4)
            ELSE 0 END                                   AS cpm,
       CASE WHEN SUM(cm.clicks) > 0
            THEN (SUM(cm.spend) / SUM(cm.clicks))::NUMERIC(10,4)
            ELSE 0 END                                   AS cpc
     FROM campaign_metrics cm
     JOIN campaigns c ON c.id = cm.campaign_id
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY cm.date_start
     ORDER BY cm.date_start ASC`,
    params
  );

  return rows;
}

module.exports = { getSummary, getByObjective, getTimeseries };
