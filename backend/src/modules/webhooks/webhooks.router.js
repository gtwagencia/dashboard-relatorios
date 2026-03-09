'use strict';

const { Router } = require('express');
const webhooksService = require('./webhooks.service');
const { authenticate } = require('../../middleware/auth');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/webhooks
 * List webhook configs for the authenticated client.
 */
router.get('/', async (req, res, next) => {
  try {
    const webhooks = await webhooksService.listWebhooks(req.user.clientId);
    return res.status(200).json({ webhooks });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/webhooks
 * Create a new webhook config.
 * Body: { eventType, url, secret? }
 */
router.post('/', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const { eventType, url, secret } = req.body;

    const webhook = await webhooksService.createWebhook(clientId, eventType, url, secret);
    return res.status(201).json({ webhook });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/webhooks/:id
 * Update a webhook config.
 * Body: { eventType?, url?, secret?, isActive? }
 */
router.put('/:id', async (req, res, next) => {
  try {
    const clientId = req.user.clientId;
    const webhook = await webhooksService.updateWebhook(clientId, req.params.id, req.body);
    return res.status(200).json({ webhook });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/webhooks/:id
 * Remove a webhook config.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await webhooksService.deleteWebhook(req.user.clientId, req.params.id);
    return res.status(200).json({ message: 'Webhook deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/webhooks/:id/test
 * Send a test payload to the webhook URL.
 */
router.post('/:id/test', async (req, res, next) => {
  try {
    const result = await webhooksService.testWebhook(req.user.clientId, req.params.id);
    const httpStatus = result.success ? 200 : 502;
    return res.status(httpStatus).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
