'use strict';

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { formatReport, getEventName } = require('./reports.formatter');
const logger = require('../../utils/logger');

/**
 * Query aggregated metrics and campaigns for a client in a date range.
 * @param {string} clientId
 * @param {string} periodStart
 * @param {string} periodEnd
 * @param {string} [objective]
 */
async function fetchPeriodData(clientId, periodStart, periodEnd, objective) {
  const conditions = ['ma.client_id = $1', 'cm.date_start >= $2', 'cm.date_stop <= $3'];
  const params = [clientId, periodStart, periodEnd];
  let idx = 4;

  if (objective && objective !== 'all') {
    conditions.push(`c.objective = $${idx++}`);
    params.push(objective);
  }

  const whereClause = conditions.join(' AND ');

  // Raw daily metrics for summary computation
  const { rows: metrics } = await query(
    `SELECT cm.spend, cm.impressions, cm.reach, cm.clicks, cm.leads, cm.conversions, cm.conversions_value, cm.ctr, cm.cpm, cm.cpc
     FROM campaign_metrics cm
     JOIN campaigns c ON c.id = cm.campaign_id
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     WHERE ${whereClause}`,
    params
  );

  // Per-campaign aggregates
  const { rows: campaigns } = await query(
    `SELECT
       c.id,
       c.campaign_id,
       c.name,
       c.objective,
       c.status,
       COALESCE(SUM(cm.spend), 0)                AS total_spend,
       COALESCE(SUM(cm.impressions), 0)           AS total_impressions,
       COALESCE(SUM(cm.clicks), 0)               AS total_clicks,
       COALESCE(SUM(cm.reach), 0)                AS total_reach,
       COALESCE(SUM(cm.leads), 0)                AS total_leads,
       COALESCE(SUM(cm.conversions), 0)          AS total_conversions,
       COALESCE(SUM(cm.conversions_value), 0)    AS total_conversions_value,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.clicks)::NUMERIC / SUM(cm.impressions) * 100)
            ELSE 0 END                            AS avg_ctr,
       CASE WHEN SUM(cm.impressions) > 0
            THEN (SUM(cm.spend) / SUM(cm.impressions) * 1000)
            ELSE 0 END                            AS avg_cpm,
       CASE WHEN SUM(cm.clicks) > 0
            THEN (SUM(cm.spend) / SUM(cm.clicks))
            ELSE 0 END                            AS avg_cpc
     FROM campaigns c
     JOIN meta_accounts ma ON ma.id = c.meta_account_id
     LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id
       AND cm.date_start >= $2 AND cm.date_stop <= $3
     WHERE ma.client_id = $1
       ${objective && objective !== 'all' ? `AND c.objective = '${objective.replace(/'/g, "''")}'` : ''}
     GROUP BY c.id
     ORDER BY total_spend DESC`,
    [clientId, periodStart, periodEnd]
  );

  return { metrics, campaigns };
}

/**
 * Send payload to a webhook URL, return true on success.
 * @param {string} url
 * @param {object} payload
 * @param {string|undefined} secret - HMAC secret for X-Signature header
 * @returns {Promise<boolean>}
 */
async function sendWebhookPayload(url, payload, secret) {
  try {
    const headers = { 'Content-Type': 'application/json' };

    if (secret) {
      const crypto = require('crypto');
      const sig = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
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
 * Generate a report for a client, persist it, and dispatch to configured webhooks.
 *
 * @param {string} clientId
 * @param {string} type         - 'daily' | 'weekly' | 'monthly'
 * @param {string} objective    - 'all' | 'leads' | 'sales' | ...
 * @param {string} periodStart  - YYYY-MM-DD
 * @param {string} periodEnd    - YYYY-MM-DD
 * @returns {Promise<object>}   - The created report row
 */
async function generateReport(clientId, type, objective, periodStart, periodEnd) {
  // Load client name
  const { rows: clientRows } = await query(
    'SELECT name FROM clients WHERE id = $1',
    [clientId]
  );
  const clientName = clientRows[0]?.name || 'Unknown';

  // Fetch data
  const { metrics, campaigns } = await fetchPeriodData(clientId, periodStart, periodEnd, objective);

  // Build payload
  const payload = formatReport(
    clientId,
    clientName,
    type,
    objective || 'all',
    periodStart,
    periodEnd,
    metrics,
    campaigns
  );

  // Render WhatsApp message if client has notifications enabled
  let whatsappPayload = null;
  try {
    const { rows: clientConfig } = await query(
      `SELECT name, whatsapp_number, whatsapp_enabled, whatsapp_api_url, whatsapp_api_key, whatsapp_instance, report_objective
       FROM clients WHERE id = $1`,
      [clientId]
    );
    const cfg = clientConfig[0];
    if (cfg?.whatsapp_enabled && cfg.whatsapp_number) {
      const notifSvc = require('../notifications/notifications.service');
      const resolvedObjective = cfg.report_objective || 'leads';
      const template = await notifSvc.getTemplate(resolvedObjective);
      if (template && template.is_active) {
        const message = notifSvc.renderMessage(template, {
          clientName,
          reportType: type,
          periodStart,
          periodEnd,
          campaigns: payload.campaigns,
          summary: payload.summary,
          balance: null,
        });
        whatsappPayload = {
          event: 'whatsapp.report',
          clientId,
          clientName,
          whatsappNumber: cfg.whatsapp_number,
          evolutionApiUrl: cfg.whatsapp_api_url,
          evolutionApiKey: cfg.whatsapp_api_key,
          evolutionInstance: cfg.whatsapp_instance,
          message,
          reportType: type,
          period: payload.period,
        };
      }
    }
  } catch (err) {
    // Non-fatal — log and continue
    logger.warn('WhatsApp notification render failed', { clientId, error: err.message });
  }

  // Save to DB with status 'pending'
  const reportId = uuidv4();
  await query(
    `INSERT INTO reports (id, client_id, type, objective, period_start, period_end, status, payload_json)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [reportId, clientId, type, objective || 'all', periodStart, periodEnd, JSON.stringify(payload)]
  );

  // Find active webhook configs matching this event type
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

  if (webhooks.length === 0) {
    // No webhooks configured — mark as sent with note
    reportStatus = 'sent';
  } else {
    for (const wh of webhooks) {
      const success = await sendWebhookPayload(wh.url, payload, wh.secret);
      if (!success) {
        reportStatus = 'failed';
        lastError = `Webhook delivery failed: ${wh.url}`;
      }
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
      logger.warn('WhatsApp webhook dispatch failed', { clientId, error: err.message });
    }
  }

  // Update report status
  await query(
    `UPDATE reports
     SET status = $1, sent_at = $2, error_msg = $3, webhook_url = $4
     WHERE id = $5`,
    [
      reportStatus,
      reportStatus === 'sent' ? sentAt : null,
      lastError,
      webhooks.map((w) => w.url).join(', ') || null,
      reportId,
    ]
  );

  logger.info('Report generated', { reportId, clientId, type, status: reportStatus });

  return { id: reportId, status: reportStatus, payload };
}

/**
 * List past reports for a client, newest first.
 * @param {string} clientId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<{ reports: object[], total: number }>}
 */
async function listReports(clientId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const { rows: countRows } = await query(
    'SELECT COUNT(*) AS total FROM reports WHERE client_id = $1',
    [clientId]
  );
  const total = parseInt(countRows[0].total, 10);

  const { rows: reportRows } = await query(
    `SELECT id, type, objective, period_start, period_end, status, webhook_url, sent_at, error_msg, created_at
     FROM reports
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  const data = reportRows.map((r) => ({
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
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Manually trigger a report for the given parameters.
 * Thin wrapper around generateReport for clarity.
 */
async function triggerReport(clientId, type, objective, periodStart, periodEnd) {
  return generateReport(clientId, type, objective, periodStart, periodEnd);
}

/**
 * Get a single report by ID, verified to belong to the client.
 * @param {string} clientId
 * @param {string} reportId
 * @returns {Promise<object>}
 */
async function getReportById(clientId, reportId) {
  const { rows } = await query(
    `SELECT * FROM reports WHERE id = $1 AND client_id = $2`,
    [reportId, clientId]
  );

  if (rows.length === 0) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

module.exports = { generateReport, listReports, triggerReport, getReportById };
