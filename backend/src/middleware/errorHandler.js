'use strict';

const logger = require('../utils/logger');

/**
 * Global Express error-handling middleware.
 * Must be registered AFTER all routes with four parameters (err, req, res, next).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Log the error
  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      error: err.message,
      stack: err.stack,
    });
  } else {
    logger.warn('Client error', {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      error: err.message,
    });
  }

  // Do not leak internal details in production
  const message =
    process.env.NODE_ENV === 'production' && statusCode >= 500
      ? 'Internal server error'
      : err.message || 'An unexpected error occurred';

  return res.status(statusCode).json({
    error: message,
    code: statusCode,
  });
}

/**
 * Convenience helper: create an HTTP error with a custom status code.
 * Usage: throw createError(404, 'Resource not found')
 *
 * @param {number} statusCode
 * @param {string} message
 * @returns {Error}
 */
function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = { errorHandler, createError };
