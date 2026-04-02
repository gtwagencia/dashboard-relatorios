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
 * Load all meta accounts that have WhatsApp notifications enabled.
 * @returns {Promise<Array<{ id: string, businessName: string }>>}
 */
async function getActiveMetaAccounts() {
  const { rows } = await query(
    `SELECT ma.id, ma.business_name
     FROM meta_accounts ma
     JOIN clients c ON c.id = ma.client_id
     WHERE ma.whatsapp_enabled = true
       AND ma.whatsapp_number IS NOT NULL
       AND c.is_active = true`
  );
  return rows;
}

/**
 * Generate a report for every meta account with WhatsApp enabled.
 * @param {string} type         - 'daily' | 'weekly' | 'monthly'
 * @param {string} periodStart  - YYYY-MM-DD
 * @param {string} periodEnd    - YYYY-MM-DD
 */
async function runReportsForAllClients(type, periodStart, periodEnd) {
  const start = Date.now();
  logger.info(`[Scheduler] Starting ${type} reports`, { periodStart, periodEnd });

  let accounts;
  try {
    accounts = await getActiveMetaAccounts();
  } catch (err) {
    logger.error(`[Scheduler] Failed to load meta accounts for ${type} reports`, { error: err.message });
    return;
  }

  logger.info(`[Scheduler] Generating ${type} reports for ${accounts.length} meta accounts`);

  const results = await Promise.allSettled(
    accounts.map((account) =>
      generateReport(account.id, type, periodStart, periodEnd)
    )
  );

  let succeeded = 0;
  let failed = 0;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      succeeded++;
    } else {
      failed++;
      logger.error(`[Scheduler] Report failed for meta account`, {
        metaAccountId: accounts[i].id,
        businessName: accounts[i].businessName,
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

  // ── Meta sync: daily at 03:00 BRT = 06:00 UTC ────────────────────────────
  cron.schedule('0 6 * * *', async () => {
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
    // Report for previous Sun-Sat week (today=Monday: Sat=-2, Sun=-8)
    const lastSaturday = isoDate(-2);
    const lastSunday   = isoDate(-8);
    await runReportsForAllClients('weekly', lastSunday, lastSaturday);
  }, { timezone: 'UTC' });

  // ── Monthly reports: 1st of month 09:00 BRT = 12:00 UTC ──────────────────
  cron.schedule('0 12 1 * *', async () => {
    const { start, end } = previousMonth();
    await runReportsForAllClients('monthly', start, end);
  }, { timezone: 'UTC' });

  logger.info('[Scheduler] All cron jobs registered', {
    jobs: [
      'Meta sync: 06:00 UTC (03:00 BRT)',
      'Daily reports: 10:00 UTC (07:00 BRT)',
      'Weekly reports: Monday 11:00 UTC (08:00 BRT)',
      'Monthly reports: 1st of month 12:00 UTC (09:00 BRT)',
    ],
  });
}

module.exports = { initScheduler, runReportsForAllClients };
