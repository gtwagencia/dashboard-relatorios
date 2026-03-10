'use strict';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
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
 * Read and execute all migration SQL files in sorted order.
 * All migrations use IF NOT EXISTS so they are safe to re-run.
 */
async function initDatabase() {
  logger.info('Running database migrations...');
  const migrationsDir = path.join(__dirname, '../db/migrations');

  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory not found, skipping');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await pool.query(sql);
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      logger.error(`Migration error in ${file}`, { error: err.message });
      throw err;
    }
  }

  logger.info('Database migrations completed successfully');
}

module.exports = { pool, query, getClient, initDatabase };
