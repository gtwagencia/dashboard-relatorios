'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { getAdAccounts } = require('./meta.service');
const { syncAccount } = require('./meta.sync');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const logger = require('../../utils/logger');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/meta-accounts
 * List Meta accounts for the current client (or all, if admin).
 */
router.get('/', async (req, res, next) => {
  try {
    const { clientId, role } = req.user;

    const { rows } = await query(
      `SELECT id, client_id, ad_account_id, business_name, currency, timezone, synced_at, created_at
       FROM meta_accounts
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [clientId]
    );

    const accounts = rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      adAccountId: r.ad_account_id,
      businessName: r.business_name,
      currency: r.currency,
      timezone: r.timezone,
      syncedAt: r.synced_at,
      createdAt: r.created_at,
    }));

    return res.status(200).json({ accounts });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meta-accounts
 * Add a Meta ad account for a client. ADMIN ONLY.
 * Body: { adAccountId, businessName, clientId, currency?, timezone? }
 *
 * The access token is configured globally via META_ACCESS_TOKEN env variable.
 */
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const {
      adAccountId,
      businessName,
      clientId,
      currency = 'BRL',
      timezone = 'America/Sao_Paulo',
    } = req.body;

    if (!adAccountId || !clientId) {
      return res.status(400).json({ error: 'adAccountId e clientId são obrigatórios', code: 400 });
    }

    // Verify target client exists
    const { rows: clientRows } = await query(
      `SELECT id FROM clients WHERE id = $1 AND is_active = true`,
      [clientId]
    );
    if (clientRows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado', code: 404 });
    }

    const id = uuidv4();
    const { rows } = await query(
      `INSERT INTO meta_accounts
         (id, client_id, ad_account_id, business_name, currency, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, client_id, ad_account_id, business_name, currency, timezone, created_at`,
      [id, clientId, adAccountId, businessName || '', currency, timezone]
    );

    const r = rows[0];
    const account = {
      id: r.id,
      clientId: r.client_id,
      adAccountId: r.ad_account_id,
      businessName: r.business_name,
      currency: r.currency,
      timezone: r.timezone,
      createdAt: r.created_at,
    };
    logger.info('Meta account added', { clientId, metaAccountId: id, adAccountId });

    // Trigger async sync (do not await)
    syncAccount(id).catch((err) =>
      logger.error('Initial sync failed', { metaAccountId: id, error: err.message })
    );

    return res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/meta-accounts/:id
 * Remove a Meta account. ADMIN ONLY.
 */
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM meta_accounts WHERE id = $1`,
      [req.params.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Conta Meta não encontrada', code: 404 });
    }

    return res.status(200).json({ message: 'Conta Meta removida' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meta-accounts/:id/sync
 * Trigger a manual sync. Admin or the owning client.
 */
router.post('/:id/sync', async (req, res, next) => {
  try {
    const { clientId, role } = req.user;

    const whereClause = role === 'admin'
      ? `WHERE id = $1`
      : `WHERE id = $1 AND client_id = $2`;
    const params = role === 'admin' ? [req.params.id] : [req.params.id, clientId];

    const { rows } = await query(
      `SELECT id FROM meta_accounts ${whereClause}`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conta Meta não encontrada', code: 404 });
    }

    syncAccount(req.params.id).catch((err) =>
      logger.error('Manual sync failed', { metaAccountId: req.params.id, error: err.message })
    );

    return res.status(202).json({ message: 'Sincronização iniciada', metaAccountId: req.params.id });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/meta-accounts/available
 * Returns the ad accounts accessible by the global token (admin only).
 * Useful to discover account IDs when adding a new client.
 */
router.get('/available', requireAdmin, async (req, res, next) => {
  try {
    const adAccounts = await getAdAccounts();
    return res.status(200).json({ adAccounts });
  } catch (err) {
    if (err.response) {
      return res.status(400).json({
        error: 'Meta API error: ' + (err.response.data?.error?.message || 'Erro desconhecido'),
        code: 400,
      });
    }
    next(err);
  }
});

module.exports = router;
