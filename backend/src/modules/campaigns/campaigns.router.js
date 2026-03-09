'use strict';

const { Router } = require('express');
const campaignsService = require('./campaigns.service');
const { authenticate } = require('../../middleware/auth');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/campaigns
 * List campaigns for the current client.
 * Query params: objective, status, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { objective, status, page, limit } = req.query;

    const result = await campaignsService.getCampaigns(clientId, { objective, status, page, limit });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/campaigns/:id
 * Get a single campaign with its recent metrics.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const campaign = await campaignsService.getCampaignById(clientId, req.params.id);
    return res.status(200).json({ campaign });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/campaigns/:id/metrics
 * Get time-series metrics for a campaign.
 * Query params: dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)
 */
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { dateFrom, dateTo } = req.query;

    const metrics = await campaignsService.getCampaignMetrics(
      clientId,
      req.params.id,
      dateFrom,
      dateTo
    );

    return res.status(200).json({ metrics });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
