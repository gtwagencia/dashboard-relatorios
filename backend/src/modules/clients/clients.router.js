'use strict';

const { Router } = require('express');
const clientsService = require('./clients.service');
const { query } = require('../../config/database');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = Router();

// All routes require authentication + admin role
router.use(authenticate, requireAdmin);

/**
 * GET /api/admin/clients
 * List all clients.
 */
router.get('/', async (req, res, next) => {
  try {
    const clients = await clientsService.listClients();
    return res.status(200).json({ clients });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/clients/:id
 * Get a single client.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const client = await clientsService.getClientById(req.params.id);
    return res.status(200).json({ client });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/clients
 * Create a new client.
 * Body: { name, email, password, role? }
 */
router.post('/', async (req, res, next) => {
  try {
    const client = await clientsService.createClient(req.body);
    return res.status(201).json({ client });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/clients/:id
 * Update a client.
 * Body: { name?, email?, password? }
 */
router.put('/:id', async (req, res, next) => {
  try {
    const client = await clientsService.updateClient(req.params.id, req.body);
    return res.status(200).json({ client });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/clients/:id/toggle
 * Toggle active status of a client.
 */
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const client = await clientsService.toggleStatus(req.params.id);
    return res.status(200).json({ client });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/clients/:id
 * Soft-delete: just deactivate the client.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const client = await clientsService.toggleStatus(req.params.id);
    return res.status(200).json({ message: 'Client deactivated', client });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/clients/:id/meta-accounts
 * List all Meta accounts assigned to a specific client.
 */
router.get('/:id/meta-accounts', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, ad_account_id, business_name, currency, timezone, synced_at, created_at
       FROM meta_accounts
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    return res.status(200).json({ accounts: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
