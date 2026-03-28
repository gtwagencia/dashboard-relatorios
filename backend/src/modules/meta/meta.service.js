'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');
const { getSetting } = require('../settings/settings.service');

const META_API_VERSION = 'v25.0';
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
  'action_values',
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

/**
 * Returns the global Meta access token.
 * Checks the DB first (admin panel), then falls back to environment variable.
 * @returns {Promise<string>}
 */
async function getGlobalToken() {
  const token = await getSetting('META_ACCESS_TOKEN');
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado. Configure em Configurações → Sistema.');
  return token;
}

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
 * Get all ad accounts accessible by the global token.
 * @returns {Promise<object[]>}
 */
async function getAdAccounts() {
  const response = await api.get('/me/adaccounts', {
    params: {
      access_token: await getGlobalToken(),
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
 * @param {string} adAccountId  - e.g. 'act_123456789'
 * @returns {Promise<object[]>}
 */
async function getCampaigns(adAccountId) {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const campaigns = [];
  const token = await getGlobalToken();
  let nextPageUrl = null;

  do {
    let response;

    if (nextPageUrl) {
      // Use the absolute URL from Meta's pagination directly.
      // Do NOT pass it through api.get() because axios would prepend the baseURL
      // (which already contains the API version) and create a double-version path
      // like .../v25.0/v25.0/... resulting in a 404 error.
      response = await axios.get(nextPageUrl, { timeout: 30000 });
    } else {
      response = await api.get(`/${accountId}/campaigns`, {
        params: {
          access_token: token,
          fields:
            'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,configured_status',
          limit: 200,
        },
      });
    }

    const data = response.data;
    if (data.data && Array.isArray(data.data)) {
      campaigns.push(...data.data);
    }

    nextPageUrl = data.paging?.next || null;

    // Respect rate limits
    const rl = parseRateLimit(response.headers);
    if (rl && rl.remaining < 5) {
      logger.warn('Meta API rate limit critical, sleeping 5s');
      await sleep(5000);
    }
  } while (nextPageUrl);

  return campaigns;
}

/**
 * Get insights for a specific campaign.
 * Pass either a datePreset OR { since, until } for a custom date range.
 * @param {string} campaignId
 * @param {string} [datePreset='last_30d'] - Meta date preset (ignored when since/until provided)
 * @param {{ since: string, until: string } | null} [dateRange=null] - Custom range (YYYY-MM-DD)
 * @returns {Promise<object[]>}
 */
async function getCampaignInsights(campaignId, datePreset = 'last_30d', dateRange = null) {
  const params = {
    access_token: await getGlobalToken(),
    fields: INSIGHT_FIELDS,
    time_increment: 1, // daily breakdown
    limit: 100,
  };

  if (dateRange && dateRange.since && dateRange.until) {
    params.time_range = JSON.stringify({ since: dateRange.since, until: dateRange.until });
  } else {
    params.date_preset = datePreset;
  }

  const response = await api.get(`/${campaignId}/insights`, { params });

  const rl = parseRateLimit(response.headers);
  if (rl && rl.remaining < 5) {
    logger.warn('Meta API rate limit critical, sleeping 5s');
    await sleep(5000);
  }

  return response.data.data || [];
}

/**
 * Get financial balance info for an ad account (balance, spend_cap, amount_spent).
 * @param {string} adAccountId
 * @returns {Promise<object>}
 */
async function getAccountBalance(adAccountId) {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const response = await api.get(`/${accountId}`, {
    params: {
      access_token: await getGlobalToken(),
      fields: [
        'balance',
        'currency',
        'amount_spent',
        'spend_cap',
        'account_status',
        'funding_source_details',
      ].join(','),
    },
  });

  const d = response.data;

  // Meta returns monetary values in the minimum currency unit (cents for BRL/USD/EUR).
  // Use parseFloat to preserve any fractional cents, then divide by 100.
  const toAmount = (raw) => (raw != null && raw !== '' ? parseFloat(raw) / 100 : 0);

  // Log raw values for diagnostics
  logger.info('Meta account balance raw response', {
    adAccountId,
    balance: d.balance,
    amount_spent: d.amount_spent,
    spend_cap: d.spend_cap,
    currency: d.currency,
    account_status: d.account_status,
    funding_source: d.funding_source_details?.display_string,
  });

  const balance = toAmount(d.balance);

  return {
    balance,
    currency: d.currency || 'BRL',
    amountSpent: toAmount(d.amount_spent),
    spendCap: toAmount(d.spend_cap),
    accountStatus: d.account_status,
    displayString: d.funding_source_details?.display_string || null,
    // raw values for the diagnostic endpoint
    _raw: {
      balance: d.balance,
      amount_spent: d.amount_spent,
      spend_cap: d.spend_cap,
      funding_source_details: d.funding_source_details,
    },
  };
}

/**
 * Get aggregate insights for an ad account over a custom date range.
 * @param {string} adAccountId
 * @param {string} dateFrom  - YYYY-MM-DD
 * @param {string} dateTo    - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function getAccountInsights(adAccountId, dateFrom, dateTo) {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const response = await api.get(`/${accountId}/insights`, {
    params: {
      access_token: await getGlobalToken(),
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
  const actionValues = insight.action_values || [];
  const costPerAction = insight.cost_per_action_type || [];

  // Lead count — priority order confirmed against live Meta API response.
  // messaging_conversation_started_7d = Meta's "Results" for Leads+WhatsApp campaigns (matches
  // "Custo por resultado" in Meta Ads Manager). lead_grouped is preferred when present but is
  // absent for many WhatsApp campaigns.
  const leads =
    extractActionValue(actions, 'onsite_conversion.lead_grouped') ||             // deduplicated (when present)
    extractActionValue(actions, 'onsite_conversion.messaging_conversation_started_7d') || // WhatsApp leads (primary)
    extractActionValue(actions, 'lead') ||                                        // lead form objective
    extractActionValue(actions, 'onsite_conversion.messaging_first_reply') ||    // messaging fallback
    extractActionValue(actions, 'offsite_conversion.fb_pixel_lead');             // pixel lead event

  // Debug: log action types when leads = 0 but spend > 0 (helps diagnose missing lead tracking)
  if (leads === 0 && parseFloat(insight.spend || 0) > 0 && actions.length > 0) {
    logger.debug('No leads detected despite spend — action types received from Meta', {
      spend: insight.spend,
      date: insight.date_start,
      actionTypes: actions.map((a) => `${a.action_type}:${a.value}`),
    });
  }
  // Purchase count — use priority chain (||) to avoid double-counting overlapping action types.
  // omni_purchase is Meta's unified cross-channel purchase (preferred).
  // offsite_conversion.fb_pixel_purchase and purchase are aliases for the same pixel event —
  // summing them would double-count (e.g. 10 + 10 = 20 instead of 10).
  const conversions =
    extractActionValue(actions, 'omni_purchase') ||
    extractActionValue(actions, 'offsite_conversion.fb_pixel_purchase') ||
    extractActionValue(actions, 'purchase');

  // Revenue from purchases — same priority logic applied to action_values
  const conversionsValue =
    extractActionValue(actionValues, 'omni_purchase') ||
    extractActionValue(actionValues, 'offsite_conversion.fb_pixel_purchase') ||
    extractActionValue(actionValues, 'purchase');

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
    conversions_value: Math.round(conversionsValue * 100) / 100,
    video_views: extractActionValue(insight.video_p100_watched_actions, 'video_view'),
    raw_json: insight,
  };
}

/**
 * Fetch ad creative thumbnail URL.
 * Returns thumbnail_url and creative_id, or nulls when not available.
 * @param {string} adId - Meta ad ID
 * @returns {Promise<{ thumbnailUrl: string|null, creativeId: string|null }>}
 */
/**
 * Fetch ad creative thumbnail URL.
 * Tries multiple field combinations to maximise compatibility across ad types.
 * @param {string} adId - Meta ad ID
 * @returns {Promise<{ thumbnailUrl: string|null, creativeId: string|null }>}
 */
async function getAdCreative(adId) {
  const token = await getGlobalToken();
  try {
    // Primary: fetch via /adcreatives edge (more reliable across ad types)
    const creativeRes = await api.get(`/${adId}/adcreatives`, {
      params: {
        access_token: token,
        fields: 'id,thumbnail_url,image_url,picture',
        limit: 1,
      },
    });

    const creatives = creativeRes.data?.data || [];
    if (creatives.length > 0) {
      const c = creatives[0];
      const thumbnailUrl = c.image_url || c.picture || c.thumbnail_url || null;
      logger.debug('Ad creative fetched via adcreatives edge', { adId, thumbnailUrl: !!thumbnailUrl, fields: Object.keys(c) });
      if (thumbnailUrl) {
        return { thumbnailUrl, creativeId: c.id || null };
      }
    }

    // Fallback: fetch creative nested in the ad object
    const adRes = await api.get(`/${adId}`, {
      params: {
        access_token: token,
        fields: 'creative{id,thumbnail_url,image_url,picture}',
      },
    });
    const creative = adRes.data?.creative;
    if (!creative) return { thumbnailUrl: null, creativeId: null };

    const thumbnailUrl = creative.image_url || creative.picture || creative.thumbnail_url || null;
    logger.debug('Ad creative fetched via ad object', { adId, thumbnailUrl: !!thumbnailUrl });
    return { thumbnailUrl, creativeId: creative.id || null };
  } catch (err) {
    logger.warn('Failed to fetch ad creative', { adId, error: err.message });
    return { thumbnailUrl: null, creativeId: null };
  }
}

/**
 * Get all ads for a campaign (id, name, status only — no insights).
 * Used to check how many active ads a campaign has before deciding to sync ad-level data.
 * @param {string} campaignId - Meta campaign ID (numeric string)
 * @returns {Promise<object[]>}
 */
async function getAdsForCampaign(campaignId) {
  const response = await api.get(`/${campaignId}/ads`, {
    params: {
      access_token: await getGlobalToken(),
      fields: 'id,name,status,configured_status',
      limit: 200,
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
 * Get insights for a specific ad.
 * Identical signature to getCampaignInsights but targets the ad endpoint.
 * @param {string} adId
 * @param {string|null} [datePreset]
 * @param {{ since: string, until: string } | null} [dateRange]
 * @returns {Promise<object[]>}
 */
async function getAdInsights(adId, datePreset = 'last_30d', dateRange = null) {
  const params = {
    access_token: await getGlobalToken(),
    fields: INSIGHT_FIELDS,
    time_increment: 1,
    limit: 100,
  };

  if (dateRange && dateRange.since && dateRange.until) {
    params.time_range = JSON.stringify({ since: dateRange.since, until: dateRange.until });
  } else {
    params.date_preset = datePreset;
  }

  const response = await api.get(`/${adId}/insights`, { params });

  const rl = parseRateLimit(response.headers);
  if (rl && rl.remaining < 5) {
    logger.warn('Meta API rate limit critical, sleeping 5s');
    await sleep(5000);
  }

  return response.data.data || [];
}

module.exports = {
  META_API_VERSION,
  BASE_URL,
  OBJECTIVE_MAP,
  INSIGHT_FIELDS,
  getAdAccounts,
  getCampaigns,
  getCampaignInsights,
  getAdsForCampaign,
  getAdInsights,
  getAdCreative,
  getAccountInsights,
  getAccountBalance,
  normaliseInsight,
  parseRateLimit,
};
