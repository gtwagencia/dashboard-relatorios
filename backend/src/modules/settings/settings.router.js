'use strict';

const { Router } = require('express');
const settingsService = require('./settings.service');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = Router();

// All settings routes require admin
router.use(authenticate, requireAdmin);

/**
 * GET /api/settings
 * Get all managed system settings (values shown, never masked).
 */
router.get('/', async (req, res, next) => {
  try {
    const settings = await settingsService.getAllSettings();
    return res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/settings
 * Update one or more system settings.
 * Body: { META_ACCESS_TOKEN?: string, OPENAI_API_KEY?: string }
 */
router.put('/', async (req, res, next) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Body must be an object of key/value pairs', code: 400 });
    }
    await settingsService.updateSettings(data);
    const settings = await settingsService.getAllSettings();
    return res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
