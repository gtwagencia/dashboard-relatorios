'use strict';

const { query } = require('../../config/database');
const { getCampaigns, getCampaignInsights, normaliseInsight, OBJECTIVE_MAP } = require('./meta.service');
const logger = require('../../utils/logger');

// Tracks which account UUIDs are currently being synced.
// Prevents the same account from being synced twice simultaneously
// (e.g. manual sync triggered while cron is already syncing it).
const syncingAccountIds = new Set();

// Guards the cron cycle — prevents a new syncAllAccounts from starting
// while the previous run hasn't finished (cron fires every 30 min but
// a full sync of 15 accounts can take longer under rate limiting).
let cronSyncInProgress = false;

/**
 * Upsert a campaign row and return internal UUID.
 * @param {string} metaAccountId - Internal UUID of the meta_account
 * @param {object} campaign       - Raw campaign from Meta API
 * @returns {Promise<string>}     - Internal campaign UUID
 */
async function upsertCampaign(metaAccountId, campaign) {
  const normalObjective = OBJECTIVE_MAP[campaign.objective] || campaign.objective || 'unknown';

  const { rows } = await query(
    `INSERT INTO campaigns
       (meta_account_id, campaign_id, name, objective, status,
        daily_budget, lifetime_budget, start_time, end_time, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (campaign_id) DO UPDATE SET
       name            = EXCLUDED.name,
       objective       = EXCLUDED.objective,
       status          = EXCLUDED.status,
       daily_budget    = EXCLUDED.daily_budget,
       lifetime_budget = EXCLUDED.lifetime_budget,
       start_time      = EXCLUDED.start_time,
       end_time        = EXCLUDED.end_time,
       synced_at       = NOW()
     RETURNING id`,
    [
      metaAccountId,
      campaign.id,
      campaign.name,
      normalObjective,
      campaign.status || campaign.configured_status,
      campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
      campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
      campaign.start_time || null,
      campaign.stop_time || null,
    ]
  );

  return rows[0].id;
}

/**
 * Upsert a single insight row into campaign_metrics.
 * @param {string} internalCampaignId - Internal UUID
 * @param {object} metrics            - Normalised insight object from normaliseInsight()
 */
async function upsertMetrics(internalCampaignId, metrics) {
  await batchUpsertMetrics(internalCampaignId, [metrics]);
}

/**
 * Upsert multiple insight rows for a campaign in a single query.
 * This dramatically reduces the number of DB round-trips compared to one INSERT per row.
 * @param {string}   internalCampaignId - Internal UUID
 * @param {object[]} metricsList        - Array of normalised insight objects
 */
async function batchUpsertMetrics(internalCampaignId, metricsList) {
  if (metricsList.length === 0) return;

  const params = [];
  const valueClauses = metricsList.map((metrics) => {
    const base = params.length + 1;
    params.push(
      internalCampaignId,
      metrics.date_start,
      metrics.date_stop,
      metrics.impressions,
      metrics.reach,
      metrics.clicks,
      metrics.spend,
      metrics.ctr,
      metrics.cpc,
      metrics.cpm,
      metrics.conversions,
      metrics.leads,
      metrics.cost_per_lead,
      metrics.cost_per_result,
      metrics.frequency,
      metrics.video_views,
      metrics.conversions_value || 0,
      JSON.stringify(metrics.raw_json)
    );
    return `($${base},$${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16},$${base+17})`;
  });

  await query(
    `INSERT INTO campaign_metrics
       (campaign_id, date_start, date_stop, impressions, reach, clicks, spend,
        ctr, cpc, cpm, conversions, leads, cost_per_lead, cost_per_result,
        frequency, video_views, conversions_value, raw_json)
     VALUES ${valueClauses.join(', ')}
     ON CONFLICT (campaign_id, date_start) DO UPDATE SET
       date_stop          = EXCLUDED.date_stop,
       impressions        = EXCLUDED.impressions,
       reach              = EXCLUDED.reach,
       clicks             = EXCLUDED.clicks,
       spend              = EXCLUDED.spend,
       ctr                = EXCLUDED.ctr,
       cpc                = EXCLUDED.cpc,
       cpm                = EXCLUDED.cpm,
       conversions        = EXCLUDED.conversions,
       leads              = EXCLUDED.leads,
       cost_per_lead      = EXCLUDED.cost_per_lead,
       cost_per_result    = EXCLUDED.cost_per_result,
       frequency          = EXCLUDED.frequency,
       video_views        = EXCLUDED.video_views,
       conversions_value  = EXCLUDED.conversions_value,
       raw_json           = EXCLUDED.raw_json`,
    params
  );
}

/**
 * Synchronise a single Meta account: fetch campaigns + insights and persist.
 * @param {string} metaAccountId - Internal UUID of meta_accounts row
 * @returns {Promise<{ synced: number, errors: number }>}
 */
async function syncAccount(metaAccountId) {
  // Prevent concurrent syncs of the same account
  if (syncingAccountIds.has(metaAccountId)) {
    const err = new Error('Esta conta já está sendo sincronizada. Aguarde a conclusão.');
    err.statusCode = 409;
    throw err;
  }

  syncingAccountIds.add(metaAccountId);
  logger.info('Starting sync for meta account', { metaAccountId });

  try {
    // 1. Load account record
    const { rows: accountRows } = await query(
      `SELECT id, ad_account_id, client_id FROM meta_accounts WHERE id = $1`,
      [metaAccountId]
    );

    if (accountRows.length === 0) {
      throw new Error(`Meta account not found: ${metaAccountId}`);
    }

    const account = accountRows[0];

    // 2. Fetch campaigns from Meta API using global token
    let campaigns;
    try {
      campaigns = await getCampaigns(account.ad_account_id);
    } catch (err) {
      logger.error('Failed to fetch campaigns from Meta API', {
        metaAccountId,
        error: err.response?.data || err.message,
      });
      throw err;
    }

    logger.info(`Fetched ${campaigns.length} campaigns from Meta`, { metaAccountId });

    let synced = 0;
    let errors = 0;

    // 3. Upsert each campaign and fetch its insights
    for (const campaign of campaigns) {
      try {
        const internalId = await upsertCampaign(metaAccountId, campaign);

        // Only fetch insights for active / paused campaigns (not deleted/archived)
        const syncableStatuses = ['ACTIVE', 'PAUSED', 'INACTIVE'];
        const campaignStatus = campaign.status || campaign.configured_status || '';

        if (syncableStatuses.includes(campaignStatus.toUpperCase())) {
          const insights = await getCampaignInsights(campaign.id, 'last_30d');

          if (insights.length > 0) {
            const metricsList = insights.map(normaliseInsight);
            await batchUpsertMetrics(internalId, metricsList);
          }
        }

        synced++;
      } catch (err) {
        logger.error('Error syncing campaign', {
          campaignId: campaign.id,
          error: err.message,
        });
        errors++;
      }
    }

    // 4. Update synced_at on the account
    await query(
      `UPDATE meta_accounts SET synced_at = NOW() WHERE id = $1`,
      [metaAccountId]
    );

    logger.info('Sync completed for meta account', { metaAccountId, synced, errors });
    return { synced, errors };
  } finally {
    // Always release the per-account lock regardless of success or failure
    syncingAccountIds.delete(metaAccountId);
  }
}

/**
 * Synchronise all meta accounts.
 * Errors per account are logged but do not stop the process.
 * @returns {Promise<void>}
 */
async function syncAllAccounts() {
  // Prevent overlapping cron runs (a full sync of 15 accounts can take
  // longer than the 30-min cron interval under rate limiting).
  if (cronSyncInProgress) {
    logger.warn('[syncAllAccounts] Previous run still in progress — skipping this tick');
    return;
  }

  cronSyncInProgress = true;
  logger.info('Starting sync for all meta accounts');

  try {
    const { rows: accounts } = await query(
      `SELECT ma.id
       FROM meta_accounts ma
       JOIN clients c ON c.id = ma.client_id
       WHERE c.is_active = true`
    );

    logger.info(`Found ${accounts.length} meta accounts to sync`);

    let totalSynced = 0;
    let totalErrors = 0;

    // Process accounts in batches of 3 to avoid exhausting the DB connection pool
    // and hitting Meta API rate limits when there are many accounts.
    const BATCH_SIZE = 3;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((a) => syncAccount(a.id)));

      results.forEach((result, j) => {
        if (result.status === 'fulfilled') {
          totalSynced += result.value.synced;
          totalErrors += result.value.errors;
        } else {
          logger.error('Account sync failed', {
            accountId: batch[j].id,
            error: result.reason?.message,
          });
          totalErrors++;
        }
      });
    }

    logger.info('All accounts sync complete', { totalSynced, totalErrors });
  } finally {
    // Always release the cron lock so the next scheduled tick can run
    cronSyncInProgress = false;
  }
}

module.exports = { syncAccount, syncAllAccounts, upsertCampaign, upsertMetrics, batchUpsertMetrics };
