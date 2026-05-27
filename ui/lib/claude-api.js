/**
 * claude-api.js
 * Direct browser access to Anthropic Messages API for AI enrichment.
 * Uses model claude-sonnet-4-6 with the dangerous-direct-browser-access header.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are a financial research assistant. Given a stock candidate with trading signals, return ONLY valid JSON (no markdown fences, no explanatory text) matching this exact schema:

{
  "enriched_at": "<ISO 8601 timestamp>",
  "model": "claude-sonnet-4-6",
  "sector": "<sector name>",
  "industry": "<industry name>",
  "market_cap_bucket": "<large|mid|small|micro>",
  "region": "<US|DE|EU|other>",
  "thesis_short": "<1-2 sentence summary>",
  "thesis_long": "<detailed markdown analysis>",
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "catalysts": ["<catalyst 1>", "<catalyst 2>", "<catalyst 3>"],
  "confidence": "<high|medium|low>"
}

Rules:
- enriched_at must be a current ISO timestamp
- model must be exactly "claude-sonnet-4-6"
- market_cap_bucket: large (>$10B), mid ($2B-$10B), small ($300M-$2B), micro (<$300M)
- region: US (NYSE/NASDAQ), DE (XETR), EU (EURONEXT/LSE/other European), other
- thesis_short: concise 1-2 sentences, signal-aware
- thesis_long: 2-4 paragraphs, markdown formatting allowed (## headers, **bold**, lists)
- risks: exactly 3 bullet points
- catalysts: exactly 3 bullet points
- confidence: based on signal strength and convergence
- Return ONLY the JSON object, nothing else.`;

/**
 * Build the user message content for enrichment.
 * @param {object} candidate
 * @returns {string}
 */
function buildUserMessage(candidate) {
  const sourcesSummary = (candidate.sources || []).map(s =>
    `- Adapter: ${s.adapter}, Signal: ${s.signal_type}, Info: ${s.info_snippet}`
  ).join('\n');

  return `Please analyze this stock candidate and return enrichment JSON:

Symbol: ${candidate.symbol}
Exchange: ${candidate.exchange}
Name: ${candidate.name}
ISIN: ${candidate.isin || 'N/A'}

Trading Signals (${candidate.sources?.length || 0} source${candidate.sources?.length !== 1 ? 's' : ''}):
${sourcesSummary || 'No sources available'}

Discovered: ${candidate.discovered_at}`;
}

/**
 * Enrich a candidate using the Claude API.
 * @param {object} candidate  Full candidate object
 * @param {string} apiKey     Anthropic API key
 * @returns {Promise<object>} Enrichment object matching the enrichment schema
 */
export async function enrichCandidate(candidate, apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Kein Claude API Key konfiguriert. Bitte in den Einstellungen hinterlegen.');
  }

  const requestBody = {
    model: MODEL,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildUserMessage(candidate)
      }
    ]
  };

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });
  } catch (networkErr) {
    throw new Error(`Netzwerkfehler bei Claude API: ${networkErr.message}`);
  }

  if (!response.ok) {
    let errText = response.statusText;
    try { errText = (await response.json()).error?.message || errText; } catch (_) {}
    throw new Error(`Claude API Fehler ${response.status}: ${errText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error('Ungültige JSON-Antwort von Claude API');
  }

  const rawText = data?.content?.[0]?.text;
  if (!rawText) {
    throw new Error('Leere Antwort von Claude API erhalten');
  }

  // Strip markdown code fences if model included them anyway
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let enrichment;
  try {
    enrichment = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(`Konnte Enrichment-JSON nicht parsen: ${parseErr.message}\nRaw: ${cleaned.slice(0, 200)}`);
  }

  // Ensure required fields exist, fill fallbacks if model misbehaved
  enrichment.enriched_at = enrichment.enriched_at || new Date().toISOString();
  enrichment.model = MODEL;

  return enrichment;
}
