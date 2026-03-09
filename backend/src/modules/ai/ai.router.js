'use strict';

const { Router } = require('express');
const aiService = require('./ai.service');
const { authenticate } = require('../../middleware/auth');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/ai/insights
 * Retrieve stored AI insights for the authenticated client.
 * Query params: campaignId (optional), limit (default 10)
 */
router.get('/insights', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { campaignId, limit } = req.query;

    const insights = await aiService.getInsights(clientId, campaignId, limit);
    return res.status(200).json({ insights });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/generate
 * Generate a new AI insight for a campaign.
 * Body: { campaignId, scope? }
 */
router.post('/generate', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { campaignId, scope = 'campaign' } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId is required', code: 400 });
    }

    const insight = await aiService.generateInsight(clientId, campaignId, scope);
    return res.status(200).json({ insight });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
