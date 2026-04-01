'use strict';

const { Router } = require('express');
const svc = require('./notifications.service');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/templates', async (req, res, next) => {
  try {
    const templates = await svc.listTemplates();
    return res.status(200).json({ templates });
  } catch (err) { next(err); }
});

router.put('/templates/:objective', async (req, res, next) => {
  try {
    const { name, headerBlock, campaignBlock, adBlock, summaryBlock, isActive } = req.body;
    const template = await svc.upsertTemplate(req.params.objective, { name, headerBlock, campaignBlock, adBlock, summaryBlock, isActive });
    return res.status(200).json({ template });
  } catch (err) { next(err); }
});

module.exports = router;
