'use strict';

const { Router } = require('express');
const reportsService = require('./reports.service');
const { authenticate } = require('../../middleware/auth');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/reports
 * List past reports for the authenticated client.
 * Query params: page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);

    const result = await reportsService.listReports(clientId, page, limit);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reports/trigger
 * Manually generate and dispatch a report.
 * Body: { type, objective?, periodStart, periodEnd }
 */
router.post('/trigger', async (req, res, next) => {
  try {
    const { type, metaAccountId, periodStart, periodEnd } = req.body;

    if (!type || !metaAccountId || !periodStart || !periodEnd) {
      return res.status(400).json({
        error: 'type, metaAccountId, periodStart e periodEnd são obrigatórios',
        code: 400,
      });
    }

    if (!['daily', 'weekly', 'monthly', 'custom'].includes(type)) {
      return res.status(400).json({
        error: 'type deve ser: daily, weekly, monthly ou custom',
        code: 400,
      });
    }

    // Non-admin: verify the account belongs to their client
    if (req.user.role !== 'admin') {
      const { query } = require('../../config/database');
      const { rows } = await query(
        `SELECT id FROM meta_accounts WHERE id = $1 AND client_id = $2`,
        [metaAccountId, req.user.clientId]
      );
      if (!rows.length) {
        return res.status(403).json({ error: 'Acesso negado a esta conta', code: 403 });
      }
    }

    const result = await reportsService.triggerReport(metaAccountId, type, periodStart, periodEnd);

    return res.status(202).json({
      message: 'Report generated',
      reportId: result.id,
      status: result.status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/:id
 * Get a single report with full payload.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const report = await reportsService.getReportById(clientId, req.params.id);
    return res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
