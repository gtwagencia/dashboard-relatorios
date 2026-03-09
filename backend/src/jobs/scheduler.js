'use strict';

const cron = require('node-cron');
const { query } = require('../config/database');
const { syncAllAccounts } = require('../modules/meta/meta.sync');
const { generateReport } = require('../modules/reports/reports.service');
const logger = require('../utils/logger');

/**
 * Compute YYYY-MM-DD string for a date offset in days from today.
 * @param {number} offsetDays - Negative = past days
 * @returns {string}
 */
function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the start of the ISO week (Monday) for a given date string.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
function startOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the first day of the previous calendar month.
 * @returns {{ start: string, end: string }}
 */
function previousMonth() {
  const now = new Date();
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth(); // 1-indexed

  const start = `${year}-${String(month).padStart(2, '0')}-01`;

  // Last day of that month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { start, end };
}

/**
 * Load all active client IDs.
 * @returns {Promise<string[]>}
 */
async function getActiveClientIds() {
  const { rows } = await query(
    `SELECT id FROM clients WHERE is_active = true AND role = 'client'`
  );
  return rows.map((r) => r.id);
}

/**
 * Generate a report for every active client.
 * @param {string} type         - 'daily' | 'weekly' | 'monthly'
 * @param {string} periodStart  - YYYY-MM-DD
 * @param {string} periodEnd    - YYYY-MM-DD
 */
async function runReportsForAllClients(type, periodStart, periodEnd) {
  const start = Date.now();
  logger.info(`[Scheduler] Starting ${type} reports`, { periodStart, periodEnd });

  let clientIds;
  try {
    clientIds = await getActiveClientIds();
  } catch (err) {
    logger.error(`[Scheduler] Failed to load clients for ${type} reports`, { error: err.message });
    return;
  }

  logger.info(`[Scheduler] Generating ${type} reports for ${clientIds.length} clients`);

  const results = await Promise.allSettled(
    clientIds.map((clientId) =>
      generateReport(clientId, type, 'all', periodStart, periodEnd)
    )
  );

  let succeeded = 0;
  let failed = 0;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      succeeded++;
    } else {
      failed++;
      logger.error(`[Scheduler] Report failed for client`, {
        clientId: clientIds[i],
        error: result.reason?.message,
      });
    }
  });

  logger.info(`[Scheduler] ${type} reports done`, {
    succeeded,
    failed,
    durationMs: Date.now() - start,
  });
}

/**
 * Register all cron jobs and start the scheduler.
 */
function initScheduler() {
  logger.info('[Scheduler] Initialising cron jobs');

  // ── Meta sync: every 30 minutes ───────────────────────────────────────────
  cron.schedule('*/30 * * * *', async () => {
    logger.info('[Scheduler] Running Meta accounts sync');
    try {
      await syncAllAccounts();
    } catch (err) {
      logger.error('[Scheduler] Meta sync error', { error: err.message });
    }
  }, { timezone: 'UTC' });

  // ── Daily reports: 07:00 BRT = 10:00 UTC ─────────────────────────────────
  cron.schedule('0 10 * * *', async () => {
    const yesterday = isoDate(-1);
    await runReportsForAllClients('daily', yesterday, yesterday);
  }, { timezone: 'UTC' });

  // ── Weekly reports: Monday 08:00 BRT = 11:00 UTC ─────────────────────────
  cron.schedule('0 11 * * 1', async () => {
    // Report for the previous Mon-Sun week
    const today = isoDate(0);
    const lastSunday = isoDate(-1); // yesterday was Sunday
    const lastMonday = startOfWeek(lastSunday);
    await runReportsForAllClients('weekly', lastMonday, lastSunday);
  }, { timezone: 'UTC' });

  // ── Monthly reports: 1st of month 09:00 BRT = 12:00 UTC ──────────────────
  cron.schedule('0 12 1 * *', async () => {
    const { start, end } = previousMonth();
    await runReportsForAllClients('monthly', start, end);
  }, { timezone: 'UTC' });

  logger.info('[Scheduler] All cron jobs registered', {
    jobs: [
      'Meta sync: every 30 minutes',
      'Daily reports: 10:00 UTC (07:00 BRT)',
      'Weekly reports: Monday 11:00 UTC (08:00 BRT)',
      'Monthly reports: 1st of month 12:00 UTC (09:00 BRT)',
    ],
  });
}

module.exports = { initScheduler };
