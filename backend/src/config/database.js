'use strict';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

/**
 * Run a parameterised SQL query.
 * @param {string} text   - SQL statement
 * @param {Array}  params - Bound parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Query error', { text, error: err.message });
    throw err;
  }
}

/**
 * Get a dedicated client from the pool (for transactions).
 * Remember to call client.release() when done.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return pool.connect();
}

/**
 * Read and execute the migration SQL file to ensure all tables exist.
 */
async function initDatabase() {
  logger.info('Running database migrations...');
  const migrationFile = path.join(__dirname, '../db/migrations/001_init.sql');

  if (!fs.existsSync(migrationFile)) {
    logger.warn('Migration file not found, skipping: ' + migrationFile);
    return;
  }

  const sql = fs.readFileSync(migrationFile, 'utf8');

  try {
    await pool.query(sql);
    logger.info('Database migrations completed successfully');
  } catch (err) {
    logger.error('Migration error', { error: err.message });
    throw err;
  }
}

module.exports = { pool, query, getClient, initDatabase };
