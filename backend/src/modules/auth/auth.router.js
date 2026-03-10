'use strict';

const { Router } = require('express');
const authService = require('./auth.service');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../utils/logger');

const router = Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required', code: 400 });
    }

    const result = await authService.login(email, password);

    return res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      client: result.client,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required', code: 400 });
    }

    const result = await authService.refresh(refreshToken);

    return res.status(200).json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 * Optionally authenticated; gracefully handles missing token.
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Returns the current user's profile.
 */
router.get('/me', authenticate, (req, res) => {
  return res.status(200).json({ user: req.user });
});

/**
 * PUT /api/auth/profile
 * Update name and/or email. Returns new access token with updated claims.
 * Body: { name?, email? }
 */
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name && !email) {
      return res.status(400).json({ error: 'Informe ao menos name ou email', code: 400 });
    }
    const result = await authService.updateProfile(req.user.clientId, { name, email });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios', code: 400 });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres', code: 400 });
    }
    await authService.changePassword(req.user.clientId, currentPassword, newPassword);
    return res.status(200).json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
