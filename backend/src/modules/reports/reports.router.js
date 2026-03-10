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
    const clientId = req.user.clientId;
    const { type, objective = 'all', periodStart, periodEnd } = req.body;

    if (!type || !periodStart || !periodEnd) {
      return res.status(400).json({
        error: 'type, periodStart and periodEnd are required',
        code: 400,
      });
    }

    if (!['daily', 'weekly', 'monthly', 'custom'].includes(type)) {
      return res.status(400).json({
        error: 'type must be one of: daily, weekly, monthly, custom',
        code: 400,
      });
    }

    const result = await reportsService.triggerReport(clientId, type, objective, periodStart, periodEnd);

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
