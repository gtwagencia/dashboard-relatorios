'use strict';

const { Router } = require('express');
const reportsService = require('./reports.service');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { runReportsForAllClients } = require('../../jobs/scheduler');

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
 * POST /api/reports/trigger-all
 * Manually dispatch reports for ALL active meta accounts (admin only).
 * Body: { type } - 'daily' | 'weekly' | 'monthly'
 */
router.post('/trigger-all', requireAdmin, async (req, res, next) => {
  try {
    const { type } = req.body;
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return res.status(400).json({ error: 'type deve ser: daily, weekly ou monthly', code: 400 });
    }

    const now = new Date();
    const isoDate = (offset) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    let periodStart, periodEnd;
    if (type === 'daily') {
      periodStart = periodEnd = isoDate(-1);
    } else if (type === 'weekly') {
      periodEnd   = isoDate(-2); // last Saturday
      periodStart = isoDate(-8); // last Sunday
    } else {
      // monthly: previous calendar month
      const year  = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
      periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      periodEnd   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    // Run async — respond immediately so the request doesn't time out
    runReportsForAllClients(type, periodStart, periodEnd).catch(() => {});

    return res.status(202).json({
      message: `Disparando relatórios ${type} para todas as contas`,
      periodStart,
      periodEnd,
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
