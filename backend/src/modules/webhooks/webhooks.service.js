'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * List webhook configs for a client.
 * @param {string} clientId
 * @returns {Promise<object[]>}
 */
async function listWebhooks(clientId) {
  const { rows } = await query(
    `SELECT id, event_type, url, is_active, created_at
     FROM webhook_configs
     WHERE client_id = $1
     ORDER BY created_at DESC`,
    [clientId]
  );
  // Never return the secret to the client
  return rows;
}

/**
 * Create a new webhook configuration.
 * @param {string} clientId
 * @param {string} eventType
 * @param {string} url
 * @param {string|undefined} secret
 * @returns {Promise<object>}
 */
async function createWebhook(clientId, eventType, url, secret) {
  if (!eventType || !url) {
    const err = new Error('eventType and url are required');
    err.statusCode = 400;
    throw err;
  }

  const id = uuidv4();

  const { rows } = await query(
    `INSERT INTO webhook_configs (id, client_id, event_type, url, secret)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, event_type, url, is_active, created_at`,
    [id, clientId, eventType, url, secret || null]
  );

  logger.info('Webhook created', { clientId, webhookId: id, eventType, url });
  return rows[0];
}

/**
 * Update a webhook configuration.
 * @param {string} clientId
 * @param {string} id
 * @param {{ eventType?: string, url?: string, secret?: string, isActive?: boolean }} data
 * @returns {Promise<object>}
 */
async function updateWebhook(clientId, id, data) {
  const { eventType, url, secret, isActive } = data;

  const setClauses = [];
  const params = [];
  let idx = 1;

  if (eventType !== undefined) { setClauses.push(`event_type = $${idx++}`); params.push(eventType); }
  if (url !== undefined)       { setClauses.push(`url = $${idx++}`);         params.push(url); }
  if (secret !== undefined)    { setClauses.push(`secret = $${idx++}`);      params.push(secret); }
  if (isActive !== undefined)  { setClauses.push(`is_active = $${idx++}`);   params.push(isActive); }

  if (setClauses.length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    throw err;
  }

  params.push(id, clientId);

  const { rows } = await query(
    `UPDATE webhook_configs
     SET ${setClauses.join(', ')}
     WHERE id = $${idx++} AND client_id = $${idx}
     RETURNING id, event_type, url, is_active, created_at`,
    params
  );

  if (rows.length === 0) {
    const err = new Error('Webhook not found');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

/**
 * Delete a webhook configuration.
 * @param {string} clientId
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteWebhook(clientId, id) {
  const { rowCount } = await query(
    `DELETE FROM webhook_configs WHERE id = $1 AND client_id = $2`,
    [id, clientId]
  );

  if (rowCount === 0) {
    const err = new Error('Webhook not found');
    err.statusCode = 404;
    throw err;
  }

  logger.info('Webhook deleted', { clientId, webhookId: id });
}

/**
 * Send a test payload to a webhook URL.
 * @param {string} clientId
 * @param {string} id
 * @returns {Promise<{ success: boolean, statusCode?: number }>}
 */
async function testWebhook(clientId, id) {
  const { rows } = await query(
    `SELECT url, secret FROM webhook_configs WHERE id = $1 AND client_id = $2`,
    [id, clientId]
  );

  if (rows.length === 0) {
    const err = new Error('Webhook not found');
    err.statusCode = 404;
    throw err;
  }

  const { url, secret } = rows[0];

  const testPayload = {
    event: 'webhook.test',
    generated_at: new Date().toISOString(),
    client_id: clientId,
    message: 'This is a test payload from Meta Ads Dashboard',
  };

  const headers = { 'Content-Type': 'application/json' };

  if (secret) {
    const sig = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(testPayload))
      .digest('hex');
    headers['X-Signature'] = `sha256=${sig}`;
  }

  try {
    const response = await axios.post(url, testPayload, { headers, timeout: 10000 });
    logger.info('Test webhook sent successfully', { webhookId: id, statusCode: response.status });
    return { success: true, statusCode: response.status };
  } catch (err) {
    const statusCode = err.response?.status;
    logger.warn('Test webhook failed', { webhookId: id, error: err.message, statusCode });
    return { success: false, statusCode, error: err.message };
  }
}

/**
 * Find all active webhooks for a client+event and POST the payload to each.
 * @param {string} clientId
 * @param {string} eventType
 * @param {object} payload
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendToWebhooks(clientId, eventType, payload) {
  const { rows: webhooks } = await query(
    `SELECT id, url, secret
     FROM webhook_configs
     WHERE client_id = $1
       AND is_active = true
       AND (event_type = $2 OR event_type = '*')`,
    [clientId, eventType]
  );

  let sent = 0;
  let failed = 0;

  for (const wh of webhooks) {
    const headers = { 'Content-Type': 'application/json' };

    if (wh.secret) {
      const sig = crypto
        .createHmac('sha256', wh.secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      headers['X-Signature'] = `sha256=${sig}`;
    }

    try {
      await axios.post(wh.url, payload, { headers, timeout: 15000 });
      sent++;
    } catch (err) {
      logger.error('Webhook dispatch failed', { webhookId: wh.id, url: wh.url, error: err.message });
      failed++;
    }
  }

  return { sent, failed };
}

module.exports = { listWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, sendToWebhooks };
