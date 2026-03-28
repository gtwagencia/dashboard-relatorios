'use strict';

const { Router } = require('express');
const { getCampaigns, getCampaignById, getCampaignMetrics, getCampaignAds } = require('./campaigns.service');
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
    // Admins see all campaigns; clients see only their own
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const { objective, status, search, page, limit, metaAccountId, dateFrom, dateTo } = req.query;

    const result = await getCampaigns(clientId, { objective, status, search, page, limit, metaAccountId, dateFrom, dateTo });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/campaigns/:id/ads
 * Get all ads for a campaign with aggregated metrics.
 * Query params: dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)
 */
router.get('/:id/ads', async (req, res, next) => {
  try {
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const { dateFrom, dateTo } = req.query;

    const ads = await getCampaignAds(clientId, req.params.id, dateFrom, dateTo);

    return res.status(200).json({ ads });
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
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const campaign = await getCampaignById(clientId, req.params.id);
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
    const clientId = req.user.role === 'admin' ? null : req.user.clientId;
    const { dateFrom, dateTo } = req.query;

    const metrics = await getCampaignMetrics(
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
