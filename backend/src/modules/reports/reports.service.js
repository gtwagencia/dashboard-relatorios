'use strict';

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { formatReport, getEventName } = require('./reports.formatter');
const { getAccountBalance } = require('../meta/meta.service');
const logger = require('../../utils/logger');

/**
 * Query aggregated metrics and campaigns for a meta account in a date range.
 * All campaign objectives are included (no filtering by objective).
 * @param {string} metaAccountId
 * @param {string} periodStart
 * @param {string} periodEnd
 */
async function fetchPeriodData(metaAccountId, periodStart, periodEnd) {
  const params = [metaAccountId, periodStart, periodEnd];

  const { rows: metrics } = await query(
    `SELECT cm.spend, cm.impressions, cm.reach, cm.clicks, cm.leads, cm.conversions, cm.conversions_value, cm.ctr, cm.cpm, cm.cpc
     FROM campaign_metrics cm
     JOIN campaigns c ON c.id = cm.campaign_id
     WHERE c.meta_account_id = $1
       AND cm.date_start >= $2
       AND cm.date_stop  <= $3`,
    params
  );

  const { rows: campaigns } = await query(
    `SELECT
       c.id,
       c.campaign_id,
       c.name,
       c.objective,
       c.status,
       COALESCE(SUM(cm.spend), 0)             AS total_spend,
       COALESCE(SUM(cm.impressions), 0)       AS total_impressions,
       COALESCE(SUM(cm.clicks), 0)            AS total_clicks,
       COALESCE(SUM(cm.reach), 0)             AS total_reach,
       COALESCE(SUM(cm.leads), 0)             AS total_leads,
       COALESCE(SUM(cm.conversions), 0)       AS total_conversions,
       COALESCE(SUM(cm.conversions_value), 0) AS total_conversions_value,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.clicks)::NUMERIC / SUM(cm.impressions) * 100) ELSE 0 END AS avg_ctr,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.spend) / SUM(cm.impressions) * 1000) ELSE 0 END          AS avg_cpm,
       CASE WHEN SUM(cm.clicks) > 0
            THEN (SUM(cm.spend) / SUM(cm.clicks)) ELSE 0 END                      AS avg_cpc
     FROM campaigns c
     LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id
       AND cm.date_start >= $2 AND cm.date_stop <= $3
     WHERE c.meta_account_id = $1
     GROUP BY c.id
     HAVING COALESCE(SUM(cm.impressions), 0) > 0
     ORDER BY total_spend DESC`,
    params
  );

  const { rows: adRows } = await query(
    `SELECT
       a.id             AS internal_ad_id,
       a.ad_id,
       a.name           AS ad_name,
       a.campaign_id    AS internal_campaign_id,
       COALESCE(SUM(am.spend), 0)             AS total_spend,
       COALESCE(SUM(am.impressions), 0)       AS total_impressions,
       COALESCE(SUM(am.clicks), 0)            AS total_clicks,
       COALESCE(SUM(am.reach), 0)             AS total_reach,
       COALESCE(SUM(am.leads), 0)             AS total_leads,
       COALESCE(SUM(am.conversions), 0)       AS total_conversions,
       COALESCE(SUM(am.conversions_value), 0) AS total_conversions_value,
       CASE WHEN SUM(am.impressions) > 0
            THEN (SUM(am.clicks)::NUMERIC / SUM(am.impressions) * 100) ELSE 0 END AS avg_ctr,
       CASE WHEN SUM(am.impressions) > 0
            THEN (SUM(am.spend) / SUM(am.impressions) * 1000) ELSE 0 END          AS avg_cpm,
       CASE WHEN SUM(am.clicks) > 0
            THEN (SUM(am.spend) / SUM(am.clicks)) ELSE 0 END                      AS avg_cpc
     FROM ads a
     JOIN ad_metrics am ON am.ad_id = a.id
       AND am.date_start >= $2 AND am.date_stop <= $3
     JOIN campaigns c ON c.id = a.campaign_id
     WHERE c.meta_account_id = $1
     GROUP BY a.id
     HAVING SUM(am.spend) > 0
     ORDER BY total_spend DESC`,
    params
  );

  const adsByCampaign = {};
  for (const ad of adRows) {
    const cid = ad.internal_campaign_id;
    if (!adsByCampaign[cid]) adsByCampaign[cid] = [];
    adsByCampaign[cid].push(ad);
  }

  const campaignsWithAds = campaigns.map(c => {
    const ads = adsByCampaign[c.id] || [];
    return ads.length > 1 ? { ...c, ads } : { ...c, ads: [] };
  });

  return { metrics, campaigns: campaignsWithAds };
}

/**
 * Send payload to a webhook URL, return true on success.
 */
async function sendWebhookPayload(url, payload, secret) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (secret) {
      const crypto = require('crypto');
      const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      headers['X-Signature'] = `sha256=${sig}`;
    }
    await axios.post(url, payload, { headers, timeout: 15000 });
    return true;
  } catch (err) {
    logger.error('Webhook delivery failed', { url, error: err.message });
    return false;
  }
}

/**
 * Generate a report for a meta account, persist it, and dispatch to webhooks + WhatsApp.
 *
 * @param {string} metaAccountId
 * @param {string} type         - 'daily' | 'weekly' | 'monthly' | 'custom'
 * @param {string} periodStart  - YYYY-MM-DD
 * @param {string} periodEnd    - YYYY-MM-DD
 * @returns {Promise<object>}
 */
async function generateReport(metaAccountId, type, periodStart, periodEnd) {
  // Load account + client info
  const { rows: accountRows } = await query(
    `SELECT ma.id, ma.client_id, ma.ad_account_id, ma.business_name,
            ma.whatsapp_enabled, ma.whatsapp_number,
            ma.whatsapp_api_url, ma.whatsapp_api_key, ma.whatsapp_instance,
            c.name AS client_name
     FROM meta_accounts ma
     JOIN clients c ON c.id = ma.client_id
     WHERE ma.id = $1`,
    [metaAccountId]
  );

  if (!accountRows.length) {
    const err = new Error(`Meta account not found: ${metaAccountId}`);
    err.statusCode = 404;
    throw err;
  }

  const account = accountRows[0];
  const clientName = account.client_name;
  const clientId = account.client_id;

  // Fetch ALL campaigns for this account (all objectives, no filter)
  const { metrics, campaigns } = await fetchPeriodData(metaAccountId, periodStart, periodEnd);

  // Build JSON payload (for webhook/n8n delivery)
  const payload = formatReport(
    clientId,
    clientName,
    type,
    'all',
    periodStart,
    periodEnd,
    metrics,
    campaigns
  );

  // Render WhatsApp message covering all objective types in one message
  let whatsappPayload = null;
  if (account.whatsapp_enabled && account.whatsapp_number) {
    try {
      const notifSvc = require('../notifications/notifications.service');

      // Fetch account balance (best-effort — don't fail if unavailable)
      let balance = null;
      try {
        const balanceData = await getAccountBalance(account.ad_account_id);
        balance = balanceData?.balance ?? null;
      } catch (e) {
        logger.warn('Could not fetch balance for report', { metaAccountId, error: e.message });
      }

      const message = await notifSvc.renderFullMessage({
        clientName,
        accountName: account.business_name,
        reportType: type,
        periodStart,
        periodEnd,
        campaigns: payload.campaigns,
        summary: payload.summary,
        balance,
      });

      whatsappPayload = {
        event: 'whatsapp.report',
        metaAccountId,
        clientId,
        clientName,
        accountName: account.business_name,
        whatsappNumber: account.whatsapp_number,
        evolutionApiUrl: account.whatsapp_api_url,
        evolutionApiKey: account.whatsapp_api_key,
        evolutionInstance: account.whatsapp_instance,
        message,
        reportType: type,
        period: payload.period,
      };
    } catch (err) {
      logger.warn('WhatsApp message render failed', { metaAccountId, error: err.message });
    }
  }

  // Persist report
  const reportId = uuidv4();
  await query(
    `INSERT INTO reports (id, client_id, meta_account_id, type, objective, period_start, period_end, status, payload_json)
     VALUES ($1, $2, $3, $4, 'all', $5, $6, 'pending', $7)`,
    [reportId, clientId, metaAccountId, type, periodStart, periodEnd, JSON.stringify(payload)]
  );

  // Dispatch JSON payload to configured webhooks
  const eventType = getEventName(type);
  const { rows: webhooks } = await query(
    `SELECT id, url, secret FROM webhook_configs
     WHERE client_id = $1 AND is_active = true
       AND (event_type = $2 OR event_type = 'report.*' OR event_type = '*')`,
    [clientId, eventType]
  );

  let reportStatus = 'sent';
  let lastError = null;
  const sentAt = new Date();

  for (const wh of webhooks) {
    const success = await sendWebhookPayload(wh.url, payload, wh.secret);
    if (!success) {
      reportStatus = 'failed';
      lastError = `Webhook delivery failed: ${wh.url}`;
    }
  }

  // Dispatch WhatsApp payload to webhooks configured for 'whatsapp.report'
  if (whatsappPayload) {
    try {
      const { rows: whatsappWebhooks } = await query(
        `SELECT id, url, secret FROM webhook_configs
         WHERE client_id = $1 AND is_active = true
           AND (event_type = 'whatsapp.report' OR event_type = '*')`,
        [clientId]
      );
      for (const wh of whatsappWebhooks) {
        await sendWebhookPayload(wh.url, whatsappPayload, wh.secret);
      }
    } catch (err) {
      logger.warn('WhatsApp webhook dispatch failed', { metaAccountId, error: err.message });
    }
  }

  await query(
    `UPDATE reports SET status = $1, sent_at = $2, error_msg = $3, webhook_url = $4 WHERE id = $5`,
    [reportStatus, reportStatus === 'sent' ? sentAt : null, lastError,
     webhooks.map(w => w.url).join(', ') || null, reportId]
  );

  logger.info('Report generated', { reportId, metaAccountId, clientId, type, status: reportStatus });
  return { id: reportId, status: reportStatus, payload };
}

/**
 * List past reports for a client, newest first.
 */
async function listReports(clientId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const { rows: countRows } = await query(
    'SELECT COUNT(*) AS total FROM reports WHERE client_id = $1',
    [clientId]
  );
  const total = parseInt(countRows[0].total, 10);

  const { rows: reportRows } = await query(
    `SELECT r.id, r.type, r.objective, r.period_start, r.period_end, r.status,
            r.webhook_url, r.sent_at, r.error_msg, r.created_at,
            ma.business_name AS account_name
     FROM reports r
     LEFT JOIN meta_accounts ma ON ma.id = r.meta_account_id
     WHERE r.client_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  const data = reportRows.map(r => ({
    id: r.id,
    type: r.type,
    objective: r.objective,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status,
    webhookUrl: r.webhook_url,
    sentAt: r.sent_at,
    errorMsg: r.error_msg,
    createdAt: r.created_at,
    accountName: r.account_name || null,
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function triggerReport(metaAccountId, type, periodStart, periodEnd) {
  return generateReport(metaAccountId, type, periodStart, periodEnd);
}

async function getReportById(clientId, reportId) {
  const { rows } = await query(
    `SELECT * FROM reports WHERE id = $1 AND client_id = $2`,
    [reportId, clientId]
  );
  if (!rows.length) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

module.exports = { generateReport, listReports, triggerReport, getReportById };
