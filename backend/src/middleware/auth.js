'use strict';

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Extract and verify JWT from the Authorization: Bearer <token> header.
 * Attaches the decoded payload to req.user on success.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header', code: 401 });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({ error: 'No token provided', code: 401 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET is not configured');
    return res.status(500).json({ error: 'Server misconfiguration', code: 500 });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 401 });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token', code: 401 });
    }
    logger.error('JWT verification error', { error: err.message });
    return res.status(401).json({ error: 'Authentication failed', code: 401 });
  }
}

/**
 * Require that the authenticated user has the 'admin' role.
 * Must be used after authenticate().
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', code: 401 });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin access required', code: 403 });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
