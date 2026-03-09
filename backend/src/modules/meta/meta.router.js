'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { encrypt } = require('../../utils/crypto');
const { getAdAccounts } = require('./meta.service');
const { syncAccount } = require('./meta.sync');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../utils/logger');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/meta-accounts
 * List Meta accounts for the current client.
 */
router.get('/', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    const { rows } = await query(
      `SELECT id, ad_account_id, business_name, currency, timezone, token_expires_at, created_at
       FROM meta_accounts
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [clientId]
    );

    return res.status(200).json({ accounts: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meta-accounts
 * Add a new Meta ad account.
 * Body: { adAccountId, accessToken, businessName, currency?, timezone? }
 */
router.post('/', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { adAccountId, accessToken, businessName, currency = 'BRL', timezone = 'America/Sao_Paulo' } = req.body;

    if (!adAccountId || !accessToken) {
      return res.status(400).json({ error: 'adAccountId and accessToken are required', code: 400 });
    }

    // Encrypt token before persisting
    const accessTokenEnc = encrypt(accessToken);
    const id = uuidv4();

    const { rows } = await query(
      `INSERT INTO meta_accounts
         (id, client_id, ad_account_id, access_token_enc, business_name, currency, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, ad_account_id, business_name, currency, timezone, created_at`,
      [id, clientId, adAccountId, accessTokenEnc, businessName || '', currency, timezone]
    );

    const account = rows[0];
    logger.info('Meta account added', { clientId, metaAccountId: id, adAccountId });

    // Trigger async sync (do not wait for it)
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
 * Remove a Meta account (and cascades to campaigns/metrics).
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    const { rowCount } = await query(
      `DELETE FROM meta_accounts WHERE id = $1 AND client_id = $2`,
      [req.params.id, clientId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Meta account not found', code: 404 });
    }

    return res.status(200).json({ message: 'Meta account removed' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/meta-accounts/:id/sync
 * Trigger a manual sync for one account.
 */
router.post('/:id/sync', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;

    // Verify ownership
    const { rows } = await query(
      `SELECT id FROM meta_accounts WHERE id = $1 AND client_id = $2`,
      [req.params.id, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Meta account not found', code: 404 });
    }

    // Kick off sync in background
    syncAccount(req.params.id).catch((err) =>
      logger.error('Manual sync failed', { metaAccountId: req.params.id, error: err.message })
    );

    return res.status(202).json({ message: 'Sync started', metaAccountId: req.params.id });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/meta-accounts/ad-accounts
 * Validate a token and return available ad accounts from Meta.
 * Query: ?accessToken=...
 */
router.get('/ad-accounts', async (req, res, next) => {
  try {
    const { accessToken } = req.query;
    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken query param is required', code: 400 });
    }

    const adAccounts = await getAdAccounts(accessToken);
    return res.status(200).json({ adAccounts });
  } catch (err) {
    if (err.response) {
      return res.status(400).json({
        error: 'Meta API error: ' + (err.response.data?.error?.message || 'Unknown error'),
        code: 400,
      });
    }
    next(err);
  }
});

module.exports = router;
