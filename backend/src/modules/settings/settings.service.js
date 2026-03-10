'use strict';

const { query } = require('../../config/database');

// Keys that are safe to expose (non-sensitive)
const PUBLIC_KEYS = [];

// Keys managed via this service (admin panel)
const MANAGED_KEYS = ['META_ACCESS_TOKEN', 'OPENAI_API_KEY'];

/**
 * Get a single setting value by key.
 * Falls back to environment variable if not set in DB.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getSetting(key) {
  try {
    const { rows } = await query(
      'SELECT value FROM system_settings WHERE key = $1',
      [key]
    );
    if (rows.length > 0 && rows[0].value) return rows[0].value;
  } catch {
    // Table may not exist yet during first boot — fall through to env
  }
  return process.env[key] || null;
}

/**
 * Get all managed settings (masked for display).
 * @returns {Promise<Record<string, string>>}
 */
async function getAllSettings() {
  const result = {};

  try {
    const { rows } = await query(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)',
      [MANAGED_KEYS]
    );
    const dbMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    for (const key of MANAGED_KEYS) {
      const dbVal = dbMap[key];
      const envVal = process.env[key];
      // Show DB value if set, otherwise env value
      const val = dbVal || envVal || '';
      result[key] = val;
    }
  } catch {
    // Fall back to env vars
    for (const key of MANAGED_KEYS) {
      result[key] = process.env[key] || '';
    }
  }

  return result;
}

/**
 * Set a setting value (upsert).
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
async function setSetting(key, value) {
  if (!MANAGED_KEYS.includes(key)) {
    const err = new Error(`Key '${key}' is not allowed`);
    err.statusCode = 400;
    throw err;
  }

  await query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

/**
 * Update multiple settings at once.
 * @param {Record<string, string>} data
 * @returns {Promise<void>}
 */
async function updateSettings(data) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      await setSetting(key, value);
    }
  }
}

module.exports = { getSetting, getAllSettings, setSetting, updateSettings, MANAGED_KEYS };
