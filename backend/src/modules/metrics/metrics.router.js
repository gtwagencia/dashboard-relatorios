'use strict';

const { Router } = require('express');
const metricsService = require('./metrics.service');
const { authenticate } = require('../../middleware/auth');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/metrics/summary
 * Aggregate totals for the authenticated client.
 * Query params: dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)
 */
router.get('/summary', async (req, res, next) => {
  try {
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const { dateFrom, dateTo, metaAccountId } = req.query;

    const summary = await metricsService.getSummary(clientId, dateFrom, dateTo, metaAccountId);
    return res.status(200).json({ summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/metrics/by-objective
 * Metrics grouped by campaign objective.
 * Query params: dateFrom, dateTo
 */
router.get('/by-objective', async (req, res, next) => {
  try {
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const { dateFrom, dateTo, metaAccountId } = req.query;

    const data = await metricsService.getByObjective(clientId, dateFrom, dateTo, metaAccountId);
    return res.status(200).json({ byObjective: data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/metrics/timeseries
 * Daily time-series for chart rendering.
 * Query params: dateFrom, dateTo, campaignId (optional)
 */
router.get('/timeseries', async (req, res, next) => {
  try {
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const { dateFrom, dateTo, campaignId, metaAccountId } = req.query;

    const timeseries = await metricsService.getTimeseries(clientId, dateFrom, dateTo, campaignId, metaAccountId);
    return res.status(200).json({ timeseries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
