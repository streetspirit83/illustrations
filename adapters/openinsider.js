/**
 * OpenInsider adapter – scrapes US insider-buy filings from openinsider.com.
 *
 * signal_type : insider_buy
 * region      : US
 * schedule    : daily
 */

import * as crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { resolveUsExchange } from './_shared/us-exchange-resolver.js';
import { buildLinks }        from './_shared/link-builder.js';

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const meta = {
  name:            'openinsider',
  description:     'US Insider Buys from openinsider.com',
  region:          'US',
  signal_types:    ['insider_buy'],
  schedule:        'daily',
  default_filters: { min_value_usd: 1_000_000, min_insiders: 1 },
};

// ---------------------------------------------------------------------------
// Screener URL – purchases ≥ $1 M, last 7 days, up to 100 rows
// ---------------------------------------------------------------------------

const SCREENER_URL =
  'https://openinsider.com/screener' +
  '?s=&o=&pl=&ph=&ll=&lh=&fd=7&fdr=&td=0&tdr=&fdlyl=&fdlyh=&daysago=' +
  '&xp=1&vl=1000&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0' +
  '&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=' +
  '&sortcol=0&cnt=100&Action=1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a currency / number string like "$1,234,567" or "1234567" → number.
 * Returns 0 on failure.
 * @param {string} raw
 * @returns {number}
 */
function parseMoney(raw) {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,\s+%]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a dollar amount to a compact human string, e.g. 4_200_000 → "$4.2M".
 * @param {number} usd
 * @returns {string}
 */
function formatUsd(usd) {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// HTML scraping
// ---------------------------------------------------------------------------

/**
 * Fetches and parses the OpenInsider screener page.
 * @returns {Promise<Array<object>>} Raw row objects
 */
async function scrapeRows() {
  const response = await fetch(SCREENER_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DiscoveryWorkspaceBot/1.0)',
      'Accept':     'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenInsider fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $    = cheerio.load(html);
  const rows = [];

  $('#tablewrap table tbody tr').each((_i, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 13) return;          // header guard

    const cell = (n) => $(cells[n]).text().trim();

    rows.push({
      filing_date:    cell(1),
      trade_date:     cell(2),
      ticker:         cell(3).toUpperCase(),
      company_name:   cell(4),
      insider_name:   cell(5),
      insider_title:  cell(6),
      trade_type:     cell(7),
      price:          parseMoney(cell(8)),
      qty:            parseMoney(cell(9)),
      owned:          parseMoney(cell(10)),
      delta_owned:    cell(11),
      value:          parseMoney(cell(12)),
    });
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @param {{ min_value_usd?: number, min_insiders?: number }} config
 * @returns {Promise<Array<object>>} Candidate objects ready for storage
 */
export async function fetchCandidates(config = {}) {
  const minValue    = config.min_value_usd ?? meta.default_filters.min_value_usd;
  const minInsiders = config.min_insiders  ?? meta.default_filters.min_insiders;

  const allRows = await scrapeRows();

  // Keep only confirmed purchases above the value threshold
  const filtered = allRows.filter(
    (r) => r.trade_type === 'P - Purchase' && r.value >= minValue
  );

  // Group by ticker
  const grouped = new Map();
  for (const row of filtered) {
    if (!grouped.has(row.ticker)) {
      grouped.set(row.ticker, { company_name: row.company_name, rows: [] });
    }
    grouped.get(row.ticker).rows.push(row);
  }

  const now = new Date().toISOString();
  const candidates = [];

  for (const [ticker, { company_name, rows }] of grouped) {
    // Apply min_insiders filter on the grouped set
    if (rows.length < minInsiders) continue;

    const exchange = await resolveUsExchange(ticker);

    // Aggregate metrics
    const totalValue  = rows.reduce((s, r) => s + r.value, 0);
    const insiderCount = new Set(rows.map((r) => r.insider_name)).size;

    // Most recent trade date
    const latestTradeDate = rows
      .map((r) => r.trade_date)
      .sort()
      .at(-1) ?? now.slice(0, 10);

    const infoSnippet =
      insiderCount === 1
        ? `${rows[0].insider_name} bought ${formatUsd(totalValue)}`
        : `${insiderCount} insiders bought ${formatUsd(totalValue)} total`;

    const yahooSymbol = ticker;

    const candidate = {
      schema_version:     'discovery-1.0',
      id:                 crypto.randomUUID(),
      symbol:             ticker,
      exchange,
      yahoo_symbol:       yahooSymbol,
      isin:               '',
      name:               company_name,
      workspace_state:    'new',
      info_snippet:       infoSnippet,
      links:              buildLinks({ symbol: ticker, exchange, yahoo_symbol: yahooSymbol }),
      sources: [
        {
          adapter:        'openinsider',
          discovered_at:  now,
          signal_type:    'insider_buy',
          source_url:     SCREENER_URL,
          info_snippet:   infoSnippet,
          raw_signal: {
            insiders: rows.map((r) => ({
              filing_date:   r.filing_date,
              trade_date:    r.trade_date,
              insider_name:  r.insider_name,
              insider_title: r.insider_title,
              trade_type:    r.trade_type,
              price:         r.price,
              qty:           r.qty,
              owned:         r.owned,
              delta_owned:   r.delta_owned,
              value:         r.value,
            })),
          },
        },
      ],
      first_discovered_at: now,
      last_updated_at:     now,
    };

    candidates.push(candidate);
  }

  return candidates;
}
