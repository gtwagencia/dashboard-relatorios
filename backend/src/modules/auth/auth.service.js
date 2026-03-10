'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const logger = require('../../utils/logger');

const ACCESS_TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

/**
 * Sign a short-lived access token.
 * @param {object} client - Client row from DB
 * @returns {string}
 */
function signAccessToken(client) {
  return jwt.sign(
    {
      id: client.id,
      name: client.name,
      email: client.email,
      role: client.role,
      clientId: client.id,
    },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Hash a refresh token for safe storage.
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate credentials and return access + refresh tokens.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ accessToken: string, refreshToken: string, client: object }>}
 */
async function login(email, password) {
  const { rows } = await query(
    'SELECT id, name, email, password_hash, role, is_active FROM clients WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const client = rows[0];

  if (!client.is_active) {
    const err = new Error('Account is deactivated');
    err.statusCode = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, client.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  // Generate tokens
  const accessToken = signAccessToken(client);
  const refreshToken = uuidv4() + '-' + uuidv4(); // 72-char random token

  // Persist hashed refresh token
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  await query(
    `INSERT INTO refresh_tokens (id, client_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uuidv4(), client.id, hashToken(refreshToken), expiresAt]
  );

  logger.info('User logged in', { clientId: client.id, email: client.email });

  return {
    accessToken,
    refreshToken,
    client: { id: client.id, name: client.name, email: client.email, role: client.role },
  };
}

/**
 * Issue a new access token from a valid, non-expired, non-revoked refresh token.
 * @param {string} token - Raw refresh token
 * @returns {Promise<{ accessToken: string }>}
 */
async function refresh(token) {
  if (!token) {
    const err = new Error('Refresh token is required');
    err.statusCode = 400;
    throw err;
  }

  const tokenHash = hashToken(token);

  const { rows } = await query(
    `SELECT rt.id, rt.client_id, rt.expires_at, rt.revoked_at,
            c.id AS cid, c.email, c.role, c.is_active
     FROM refresh_tokens rt
     JOIN clients c ON c.id = rt.client_id
     WHERE rt.token_hash = $1`,
    [tokenHash]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }

  const row = rows[0];

  if (row.revoked_at) {
    const err = new Error('Refresh token has been revoked');
    err.statusCode = 401;
    throw err;
  }

  if (new Date(row.expires_at) < new Date()) {
    const err = new Error('Refresh token has expired');
    err.statusCode = 401;
    throw err;
  }

  if (!row.is_active) {
    const err = new Error('Account is deactivated');
    err.statusCode = 403;
    throw err;
  }

  const accessToken = signAccessToken({
    id: row.cid,
    email: row.email,
    role: row.role,
  });

  return { accessToken };
}

/**
 * Revoke a refresh token.
 * @param {string} token - Raw refresh token
 * @returns {Promise<void>}
 */
async function logout(token) {
  if (!token) return;

  const tokenHash = hashToken(token);
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );

  logger.info('Refresh token revoked', { tokenHash: tokenHash.slice(0, 8) + '...' });
}

/**
 * Change password for the authenticated client.
 * @param {string} clientId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
async function changePassword(clientId, currentPassword, newPassword) {
  const { rows } = await query(
    'SELECT id, password_hash FROM clients WHERE id = $1',
    [clientId]
  );
  if (rows.length === 0) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) {
    const err = new Error('Senha atual incorreta');
    err.statusCode = 401;
    throw err;
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await query(
    `UPDATE clients SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, clientId]
  );
  logger.info('Password changed', { clientId });
}

/**
 * Update profile (name and/or email) for the authenticated client.
 * Returns a new access token with updated claims.
 * @param {string} clientId
 * @param {{ name?: string, email?: string }} data
 * @returns {Promise<{ accessToken: string, client: object }>}
 */
async function updateProfile(clientId, data) {
  const { name, email } = data;

  const setClauses = [];
  const params = [];
  let idx = 1;

  if (name !== undefined && name.trim()) {
    setClauses.push(`name = $${idx++}`);
    params.push(name.trim());
  }
  if (email !== undefined && email.trim()) {
    setClauses.push(`email = $${idx++}`);
    params.push(email.toLowerCase().trim());
  }

  if (setClauses.length === 0) {
    const err = new Error('Nenhum campo para atualizar');
    err.statusCode = 400;
    throw err;
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(clientId);

  const { rows } = await query(
    `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${idx}
     RETURNING id, name, email, role`,
    params
  );

  if (rows.length === 0) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  const client = rows[0];
  const accessToken = signAccessToken(client);
  logger.info('Profile updated', { clientId });
  return { accessToken, client: { id: client.id, name: client.name, email: client.email, role: client.role } };
}

module.exports = { login, refresh, logout, changePassword, updateProfile };
