'use strict';

const { Router } = require('express');
const { getCampaigns, getCampaignById, getCampaignMetrics, getCampaignAds } = require('./campaigns.service');
const { getAdCreative } = require('../meta/meta.service');
const { query } = require('../../config/database');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const logger = require('../../utils/logger');

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

/**
 * POST /api/campaigns/:id/refresh-thumbnails
 * Re-fetch creative thumbnails for all ads of a campaign. ADMIN ONLY.
 * Useful after clearing thumbnails or when images fail to load.
 */
router.post('/:id/refresh-thumbnails', requireAdmin, async (req, res, next) => {
  try {
    const { rows: ads } = await query(
      `SELECT id, ad_id FROM ads WHERE campaign_id = $1`,
      [req.params.id]
    );

    if (ads.length === 0) {
      return res.status(200).json({ message: 'Nenhum anúncio encontrado para esta campanha', updated: 0 });
    }

    let updated = 0;
    const results = [];

    for (const ad of ads) {
      const { thumbnailUrl, creativeId } = await getAdCreative(ad.ad_id);
      results.push({ adId: ad.ad_id, thumbnailUrl: thumbnailUrl ? '✓' : 'null' });

      if (thumbnailUrl) {
        await query(
          `UPDATE ads SET thumbnail_url = $1, creative_id = $2, synced_at = NOW() WHERE id = $3`,
          [thumbnailUrl, creativeId, ad.id]
        );
        updated++;
      }
    }

    logger.info('Thumbnail refresh complete', { campaignId: req.params.id, total: ads.length, updated });
    return res.status(200).json({ updated, total: ads.length, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
