'use strict';

const { query } = require('../../config/database');
const { getCampaigns, getCampaignInsights, normaliseInsight, OBJECTIVE_MAP } = require('./meta.service');
const logger = require('../../utils/logger');

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
  await query(
    `INSERT INTO campaign_metrics
       (campaign_id, date_start, date_stop, impressions, reach, clicks, spend,
        ctr, cpc, cpm, conversions, leads, cost_per_lead, cost_per_result,
        frequency, video_views, conversions_value, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
    [
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
      JSON.stringify(metrics.raw_json),
    ]
  );
}

/**
 * Synchronise a single Meta account: fetch campaigns + insights and persist.
 * @param {string} metaAccountId - Internal UUID of meta_accounts row
 * @returns {Promise<{ synced: number, errors: number }>}
 */
async function syncAccount(metaAccountId) {
  logger.info('Starting sync for meta account', { metaAccountId });

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

  // 4. Upsert each campaign and fetch its insights
  for (const campaign of campaigns) {
    try {
      const internalId = await upsertCampaign(metaAccountId, campaign);

      // Only fetch insights for active / paused campaigns (not deleted/archived)
      const syncableStatuses = ['ACTIVE', 'PAUSED', 'INACTIVE'];
      const campaignStatus = campaign.status || campaign.configured_status || '';

      if (syncableStatuses.includes(campaignStatus.toUpperCase())) {
        const insights = await getCampaignInsights(campaign.id, 'last_30d');

        for (const insight of insights) {
          const metrics = normaliseInsight(insight);
          await upsertMetrics(internalId, metrics);
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

  // 5. Update synced_at on the account
  await query(
    `UPDATE meta_accounts SET synced_at = NOW() WHERE id = $1`,
    [metaAccountId]
  );

  logger.info('Sync completed for meta account', { metaAccountId, synced, errors });
  return { synced, errors };
}

/**
 * Synchronise all meta accounts.
 * Errors per account are logged but do not stop the process.
 * @returns {Promise<void>}
 */
async function syncAllAccounts() {
  logger.info('Starting sync for all meta accounts');

  const { rows: accounts } = await query(
    `SELECT ma.id
     FROM meta_accounts ma
     JOIN clients c ON c.id = ma.client_id
     WHERE c.is_active = true`
  );

  logger.info(`Found ${accounts.length} meta accounts to sync`);

  const results = await Promise.allSettled(
    accounts.map((a) => syncAccount(a.id))
  );

  let totalSynced = 0;
  let totalErrors = 0;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      totalSynced += result.value.synced;
      totalErrors += result.value.errors;
    } else {
      logger.error('Account sync failed', {
        accountId: accounts[i].id,
        error: result.reason?.message,
      });
      totalErrors++;
    }
  });

  logger.info('All accounts sync complete', { totalSynced, totalErrors });
}

module.exports = { syncAccount, syncAllAccounts, upsertCampaign, upsertMetrics };
