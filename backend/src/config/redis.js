'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');

let client;

function createClient() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const instance = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 10) {
        logger.error('Redis: maximum reconnection attempts reached');
        return null; // stop retrying
      }
      const delay = Math.min(times * 200, 3000);
      logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
  });

  instance.on('connect', () => logger.info('Redis connected'));
  instance.on('ready', () => logger.info('Redis ready'));
  instance.on('error', (err) => logger.error('Redis error', { error: err.message }));
  instance.on('close', () => logger.warn('Redis connection closed'));
  instance.on('reconnecting', () => logger.info('Redis reconnecting...'));

  return instance;
}

function getClient() {
  if (!client) {
    client = createClient();
  }
  return client;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get a value by key. Returns null if key does not exist or on error.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function get(key) {
  try {
    return await getClient().get(key);
  } catch (err) {
    logger.error('Redis GET error', { key, error: err.message });
    return null;
  }
}

/**
 * Set a string value, with an optional TTL in seconds.
 * @param {string} key
 * @param {string} value
 * @param {number} [ttlSeconds]
 * @returns {Promise<'OK'|null>}
 */
async function set(key, value, ttlSeconds) {
  try {
    if (ttlSeconds) {
      return await getClient().set(key, value, 'EX', ttlSeconds);
    }
    return await getClient().set(key, value);
  } catch (err) {
    logger.error('Redis SET error', { key, error: err.message });
    return null;
  }
}

/**
 * Delete one or more keys.
 * @param {...string} keys
 * @returns {Promise<number>}
 */
async function del(...keys) {
  try {
    return await getClient().del(...keys);
  } catch (err) {
    logger.error('Redis DEL error', { keys, error: err.message });
    return 0;
  }
}

/**
 * Set a TTL (seconds) on an existing key.
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<number>}
 */
async function expire(key, ttlSeconds) {
  try {
    return await getClient().expire(key, ttlSeconds);
  } catch (err) {
    logger.error('Redis EXPIRE error', { key, error: err.message });
    return 0;
  }
}

/**
 * Set a JSON-serialisable value with optional TTL.
 * @param {string} key
 * @param {*}      value
 * @param {number} [ttlSeconds]
 */
async function setJson(key, value, ttlSeconds) {
  return set(key, JSON.stringify(value), ttlSeconds);
}

/**
 * Get and JSON-parse a value. Returns null on miss or error.
 * @param {string} key
 * @returns {Promise<*|null>}
 */
async function getJson(key) {
  const raw = await get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { getClient, get, set, del, expire, setJson, getJson };
