'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

const META_API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Maps Meta campaign objective strings to our normalised categories.
 */
const OBJECTIVE_MAP = {
  // Leads
  LEAD_GENERATION: 'leads',
  OUTCOME_LEADS: 'leads',
  // Sales / Conversions
  CONVERSIONS: 'sales',
  OUTCOME_SALES: 'sales',
  PRODUCT_CATALOG_SALES: 'sales',
  // Engagement
  ENGAGEMENT: 'engagement',
  OUTCOME_ENGAGEMENT: 'engagement',
  POST_ENGAGEMENT: 'engagement',
  VIDEO_VIEWS: 'engagement',
  MESSAGES: 'engagement',
  // Awareness
  BRAND_AWARENESS: 'awareness',
  REACH: 'awareness',
  OUTCOME_AWARENESS: 'awareness',
  // Traffic
  LINK_CLICKS: 'traffic',
  TRAFFIC: 'traffic',
  OUTCOME_TRAFFIC: 'traffic',
};

/**
 * Fields to request from the Meta Insights API.
 */
const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'impressions',
  'reach',
  'clicks',
  'spend',
  'ctr',
  'cpc',
  'cpm',
  'frequency',
  'actions',
  'cost_per_action_type',
  'video_p100_watched_actions',
  'date_start',
  'date_stop',
].join(',');

// ── Axios instance ─────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

// ── Rate-limit helpers ────────────────────────────────────────────────────────

/**
 * Parse Meta's rate-limit headers.
 * @param {object} headers - Axios response headers
 * @returns {{ score: number, remaining: number } | null}
 */
function parseRateLimit(headers) {
  const raw =
    headers['x-business-use-case-usage'] ||
    headers['x-app-usage'] ||
    headers['x-ad-account-usage'];

  if (!raw) return null;

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // x-app-usage format: { call_count, total_cputime, total_time }
    if (parsed.call_count !== undefined) {
      return {
        score: parsed.call_count,
        remaining: 100 - parsed.call_count,
      };
    }
    // x-business-use-case-usage format: { <id>: [{ call_count, ... }] }
    const keys = Object.keys(parsed);
    if (keys.length > 0) {
      const entry = parsed[keys[0]];
      const item = Array.isArray(entry) ? entry[0] : entry;
      return {
        score: item.call_count || 0,
        remaining: 100 - (item.call_count || 0),
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

// ── Sleep helper for rate-limit back-off ─────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * Get all ad accounts accessible by the provided user token.
 * @param {string} accessToken
 * @returns {Promise<object[]>}
 */
async function getAdAccounts(accessToken) {
  const response = await api.get('/me/adaccounts', {
    params: {
      access_token: accessToken,
      fields: 'id,name,account_id,currency,timezone_name,business',
      limit: 100,
    },
  });

  const rl = parseRateLimit(response.headers);
  if (rl && rl.remaining < 10) {
    logger.warn('Meta API rate limit low', { remaining: rl.remaining });
  }

  return response.data.data || [];
}

/**
 * Fetch all campaigns for an ad account (follows pagination).
 * @param {string} accessToken
 * @param {string} adAccountId  - e.g. 'act_123456789'
 * @returns {Promise<object[]>}
 */
async function getCampaigns(accessToken, adAccountId) {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const campaigns = [];
  let url = `/${accountId}/campaigns`;
  let hasMore = true;

  while (hasMore) {
    const response = await api.get(url, {
      params: {
        access_token: accessToken,
        fields:
          'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,configured_status',
        limit: 200,
      },
    });

    const data = response.data;
    if (data.data && Array.isArray(data.data)) {
      campaigns.push(...data.data);
    }

    if (data.paging && data.paging.next) {
      // Use the cursor-based next URL but keep access_token
      const nextUrl = new URL(data.paging.next);
      url = nextUrl.pathname + nextUrl.search;
      hasMore = true;
    } else {
      hasMore = false;
    }

    // Respect rate limits
    const rl = parseRateLimit(response.headers);
    if (rl && rl.remaining < 5) {
      logger.warn('Meta API rate limit critical, sleeping 5s');
      await sleep(5000);
    }
  }

  return campaigns;
}

/**
 * Get insights for a specific campaign.
 * @param {string} accessToken
 * @param {string} campaignId
 * @param {string} [datePreset='last_30d'] - Meta date preset
 * @returns {Promise<object[]>}
 */
async function getCampaignInsights(accessToken, campaignId, datePreset = 'last_30d') {
  const response = await api.get(`/${campaignId}/insights`, {
    params: {
      access_token: accessToken,
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      time_increment: 1, // daily breakdown
      limit: 100,
    },
  });

  const rl = parseRateLimit(response.headers);
  if (rl && rl.remaining < 5) {
    logger.warn('Meta API rate limit critical, sleeping 5s');
    await sleep(5000);
  }

  return response.data.data || [];
}

/**
 * Get aggregate insights for an ad account over a custom date range.
 * @param {string} accessToken
 * @param {string} adAccountId
 * @param {string} dateFrom  - YYYY-MM-DD
 * @param {string} dateTo    - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function getAccountInsights(accessToken, adAccountId, dateFrom, dateTo) {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const response = await api.get(`/${accountId}/insights`, {
    params: {
      access_token: accessToken,
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      time_increment: 1,
      level: 'campaign',
      limit: 500,
    },
  });

  return response.data.data || [];
}

/**
 * Extract numeric action value from Meta actions array.
 * @param {Array<{action_type: string, value: string}>} actions
 * @param {string} actionType
 * @returns {number}
 */
function extractActionValue(actions, actionType) {
  if (!Array.isArray(actions)) return 0;
  const action = actions.find((a) => a.action_type === actionType);
  return action ? parseFloat(action.value) || 0 : 0;
}

/**
 * Normalise a Meta insight row to our internal metrics format.
 * @param {object} insight - Raw Meta API insight object
 * @returns {object}
 */
function normaliseInsight(insight) {
  const actions = insight.actions || [];
  const costPerAction = insight.cost_per_action_type || [];

  const leads = extractActionValue(actions, 'lead') || extractActionValue(actions, 'onsite_conversion.lead_grouped');
  const conversions = extractActionValue(actions, 'offsite_conversion.fb_pixel_purchase') +
    extractActionValue(actions, 'offsite_conversion.fb_pixel_lead');

  const costPerLead =
    leads > 0
      ? parseFloat(insight.spend || 0) / leads
      : extractActionValue(costPerAction, 'lead') || 0;

  const costPerResult =
    costPerAction.length > 0
      ? parseFloat(costPerAction[0].value || 0)
      : 0;

  return {
    date_start: insight.date_start,
    date_stop: insight.date_stop,
    impressions: parseInt(insight.impressions || 0, 10),
    reach: parseInt(insight.reach || 0, 10),
    clicks: parseInt(insight.clicks || 0, 10),
    spend: parseFloat(insight.spend || 0),
    ctr: parseFloat(insight.ctr || 0),
    cpc: parseFloat(insight.cpc || 0),
    cpm: parseFloat(insight.cpm || 0),
    frequency: parseFloat(insight.frequency || 0),
    conversions: Math.round(conversions),
    leads: Math.round(leads),
    cost_per_lead: Math.round(costPerLead * 10000) / 10000,
    cost_per_result: Math.round(costPerResult * 10000) / 10000,
    video_views: extractActionValue(insight.video_p100_watched_actions, 'video_view'),
    raw_json: insight,
  };
}

module.exports = {
  META_API_VERSION,
  BASE_URL,
  OBJECTIVE_MAP,
  INSIGHT_FIELDS,
  getAdAccounts,
  getCampaigns,
  getCampaignInsights,
  getAccountInsights,
  normaliseInsight,
  parseRateLimit,
};
