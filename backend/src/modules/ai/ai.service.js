'use strict';

const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/database');
const { setJson, getJson } = require('../../config/redis');
const logger = require('../../utils/logger');

const AI_MODEL = 'gpt-4o-mini';
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

/**
 * Build the AI prompt with campaign metrics.
 * @param {object[]} metrics - Recent metric rows
 * @returns {string}
 */
function buildPrompt(metrics) {
  const metricsJson = JSON.stringify(metrics, null, 2);

  return `Você é um especialista em Meta Ads com anos de experiência em gestão de campanhas de performance.

Analise as seguintes métricas de campanha dos últimos 30 dias e forneça 3-5 sugestões práticas e específicas de otimização em português brasileiro.

Métricas da campanha:
${metricsJson}

Retorne APENAS um objeto JSON válido com a seguinte estrutura, sem texto adicional:
{
  "insights": ["sugestão 1", "sugestão 2", "sugestão 3"],
  "score": 75,
  "priority": "medium",
  "analysis": "Um parágrafo resumindo o estado geral da campanha"
}

Onde:
- "insights": array de 3-5 sugestões práticas e acionáveis
- "score": número de 0 a 100 representando a saúde da campanha (0=crítico, 100=excelente)
- "priority": nível de urgência das otimizações ("low", "medium" ou "high")
- "analysis": resumo executivo em 2-3 frases`;
}

/**
 * Load last 30 days of metrics for a campaign from DB.
 * @param {string} internalCampaignId - Internal UUID
 * @returns {Promise<object[]>}
 */
async function loadCampaignMetrics(internalCampaignId) {
  const { rows } = await query(
    `SELECT date_start, date_stop, impressions, reach, clicks, spend,
            ctr, cpc, cpm, conversions, leads, cost_per_lead,
            cost_per_result, frequency, video_views
     FROM campaign_metrics
     WHERE campaign_id = $1
     ORDER BY date_start DESC
     LIMIT 30`,
    [internalCampaignId]
  );
  return rows;
}

/**
 * Generate an AI insight for a campaign (or account scope).
 *
 * @param {string} clientId
 * @param {string} campaignId  - Internal campaign UUID
 * @param {string} [scope]     - 'campaign' | 'account'
 * @returns {Promise<object>}  - Parsed insight object from OpenAI
 */
async function generateInsight(clientId, campaignId, scope = 'campaign') {
  // 1. Load metrics
  const metrics = await loadCampaignMetrics(campaignId);

  if (metrics.length === 0) {
    const err = new Error('No metrics available for this campaign');
    err.statusCode = 422;
    throw err;
  }

  // 2. Check Redis cache
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `ai:insight:${campaignId}:${today}`;
  const cached = await getJson(cacheKey);
  if (cached) {
    logger.info('AI insight served from cache', { campaignId, cacheKey });
    return cached;
  }

  // 3. Build prompt and call OpenAI
  const prompt = buildPrompt(metrics);
  const openai = getOpenAIClient();

  let rawResponse;
  let tokensUsed = 0;

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });

    rawResponse = completion.choices[0].message.content;
    tokensUsed = completion.usage?.total_tokens || 0;
  } catch (err) {
    logger.error('OpenAI API error', { error: err.message });
    throw new Error('Failed to generate AI insight: ' + err.message);
  }

  // 4. Parse response
  let insight;
  try {
    insight = JSON.parse(rawResponse);
  } catch {
    logger.error('Failed to parse OpenAI JSON response', { rawResponse });
    throw new Error('AI returned invalid JSON response');
  }

  // 5. Persist in DB
  const insightId = uuidv4();
  await query(
    `INSERT INTO ai_insights (id, client_id, campaign_id, scope, content, model_used, tokens_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [insightId, clientId, campaignId, scope, JSON.stringify(insight), AI_MODEL, tokensUsed]
  );

  // 6. Cache in Redis (6h TTL)
  await setJson(cacheKey, insight, CACHE_TTL_SECONDS);

  logger.info('AI insight generated', { insightId, clientId, campaignId, tokensUsed });

  return insight;
}

/**
 * Fetch stored AI insights for a client (optionally filtered by campaign).
 * @param {string} clientId
 * @param {string|undefined} campaignId
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function getInsights(clientId, campaignId, limit = 10) {
  const conditions = ['ai.client_id = $1'];
  const params = [clientId];
  let idx = 2;

  if (campaignId) {
    conditions.push(`ai.campaign_id = $${idx++}`);
    params.push(campaignId);
  }

  params.push(Math.min(100, parseInt(limit, 10) || 10));

  const { rows } = await query(
    `SELECT ai.id, ai.campaign_id, ai.scope, ai.content, ai.model_used, ai.tokens_used, ai.created_at,
            c.name AS campaign_name
     FROM ai_insights ai
     LEFT JOIN campaigns c ON c.id = ai.campaign_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ai.created_at DESC
     LIMIT $${idx}`,
    params
  );

  return rows.map((row) => ({
    ...row,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
  }));
}

module.exports = { generateInsight, getInsights };
