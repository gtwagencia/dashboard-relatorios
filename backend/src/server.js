'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { initDatabase } = require('./config/database');
const { getClient: getRedisClient } = require('./config/redis');
const { initScheduler } = require('./jobs/scheduler');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// ── Routers ──────────────────────────────────────────────────────────────────
const authRouter      = require('./modules/auth/auth.router');
const clientsRouter   = require('./modules/clients/clients.router');
const metaRouter      = require('./modules/meta/meta.router');
const campaignsRouter = require('./modules/campaigns/campaigns.router');
const metricsRouter   = require('./modules/metrics/metrics.router');
const reportsRouter   = require('./modules/reports/reports.router');
const aiRouter        = require('./modules/ai/ai.router');
const webhooksRouter  = require('./modules/webhooks/webhooks.router');
const settingsRouter  = require('./modules/settings/settings.router');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet());

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (e.g., curl, Postman) in development
    if (!origin || process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.', code: 429 },
});
app.use(globalLimiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.', code: 429 },
});

// ── Routes ───────────────────────────────────────────────────────────────────

// Health check (no auth, no rate limit)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || 'development',
  });
});

// Public: auth (with stricter rate limit)
app.use('/api/auth', authLimiter, authRouter);

// Protected: meta accounts
app.use('/api/meta-accounts', metaRouter);

// Protected: campaigns
app.use('/api/campaigns', campaignsRouter);

// Protected: metrics
app.use('/api/metrics', metricsRouter);

// Protected: reports
app.use('/api/reports', reportsRouter);

// Protected: AI insights
app.use('/api/ai', aiRouter);

// Protected: webhooks
app.use('/api/webhooks', webhooksRouter);

// Admin only: client management
app.use('/api/admin/clients', clientsRouter);

// Admin only: system settings (Meta token, OpenAI key)
app.use('/api/settings', settingsRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found`, code: 404 });
});

// Global error handler (must be last)
app.use(errorHandler);

// ── Startup ──────────────────────────────────────────────────────────────────

async function start() {
  const PORT = parseInt(process.env.PORT, 10) || 3001;

  try {
    // 1. Initialise database (run migrations)
    await initDatabase();
    logger.info('Database initialised');

    // 2. Connect to Redis (lazy — connection is established on first use)
    getRedisClient();
    logger.info('Redis client created');

    // 3. Start background job scheduler
    if (process.env.DISABLE_SCHEDULER !== 'true') {
      initScheduler();
    } else {
      logger.warn('Scheduler disabled via DISABLE_SCHEDULER env var');
    }

    // 4. Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Meta Ads Dashboard API running on port ${PORT}`, {
        env: process.env.NODE_ENV || 'development',
        port: PORT,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

module.exports = app; // for testing
