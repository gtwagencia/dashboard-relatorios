'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const logger = require('../../utils/logger');

const BCRYPT_ROUNDS = 10;

/**
 * Fetch all clients (admin view).
 * @returns {Promise<object[]>}
 */
async function listClients() {
  const { rows } = await query(
    `SELECT id, name, email, is_active, role, created_at, updated_at
     FROM clients
     ORDER BY created_at DESC`
  );
  return rows;
}

/**
 * Create a new client.
 * @param {{ name: string, email: string, password: string, role?: string }} data
 * @returns {Promise<object>}
 */
async function createClient(data) {
  const { name, email, password, role = 'client' } = data;

  if (!name || !email || !password) {
    const err = new Error('name, email and password are required');
    err.statusCode = 400;
    throw err;
  }

  if (!['client', 'admin'].includes(role)) {
    const err = new Error('role must be "client" or "admin"');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = uuidv4();

  try {
    const { rows } = await query(
      `INSERT INTO clients (id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, is_active, created_at`,
      [id, name, email.toLowerCase().trim(), passwordHash, role]
    );
    logger.info('Client created', { clientId: id, email });
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation on email
      const conflict = new Error('A client with this email already exists');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw err;
  }
}

/**
 * Update a client's name, email, and/or password.
 * @param {string} id
 * @param {{ name?: string, email?: string, password?: string }} data
 * @returns {Promise<object>}
 */
async function updateClient(id, data) {
  const { name, email, password } = data;

  const setClauses = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    params.push(name);
  }
  if (email !== undefined) {
    setClauses.push(`email = $${idx++}`);
    params.push(email.toLowerCase().trim());
  }
  if (password !== undefined) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    setClauses.push(`password_hash = $${idx++}`);
    params.push(passwordHash);
  }

  if (setClauses.length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    throw err;
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(id);

  const { rows } = await query(
    `UPDATE clients
     SET ${setClauses.join(', ')}
     WHERE id = $${idx}
     RETURNING id, name, email, role, is_active, updated_at`,
    params
  );

  if (rows.length === 0) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  logger.info('Client updated', { clientId: id });
  return rows[0];
}

/**
 * Toggle the is_active flag for a client.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function toggleStatus(id) {
  const { rows } = await query(
    `UPDATE clients
     SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, is_active, updated_at`,
    [id]
  );

  if (rows.length === 0) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  logger.info('Client status toggled', { clientId: id, isActive: rows[0].is_active });
  return rows[0];
}

/**
 * Get a single client by id.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getClientById(id) {
  const { rows } = await query(
    `SELECT id, name, email, is_active, role, created_at, updated_at
     FROM clients WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

module.exports = { listClients, createClient, updateClient, toggleStatus, getClientById };
