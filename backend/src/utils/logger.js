'use strict';

const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  let log = `${ts} [${level}] ${stack || message}`;
  const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return log + extras;
});

const transports = [
  new winston.transports.Console({
    handleExceptions: true,
    handleRejections: true,
  }),
];

// In production, write errors to a separate file as well (if writeable filesystem)
if (process.env.NODE_ENV === 'production') {
  try {
    transports.push(
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    );
  } catch {
    // Non-fatal: filesystem may not be writeable in containerised environments
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    process.env.NODE_ENV !== 'production' ? colorize({ all: true }) : winston.format.json(),
    logFormat
  ),
  transports,
  exitOnError: false,
});

module.exports = logger;
