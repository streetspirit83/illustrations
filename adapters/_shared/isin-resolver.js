/**
 * Resolves an ISIN to a { symbol, exchange, name } triple via the OpenFIGI API.
 */

import { micToTvExchange } from './exchange-mapper.js';

const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

// OpenFIGI exchCode → TradingView exchange (covers codes not already handled by micToTvExchange)
const EXCH_CODE_MAP = {
  US:  'NASDAQ', // fallback for generic US listings
  UN:  'NYSE',
  UW:  'NASDAQ',
  UA:  'AMEX',
  GY:  'XETR',
  GF:  'FWB',
  SM:  'BME',
  FP:  'EURONEXT',
  NA:  'EURONEXT',
  BB:  'EURONEXT',
  IM:  'MIL',
  LN:  'LSE',
  AV:  'VIE',
  SW:  'SIX',
  SS:  'OMXSTO',
  DC:  'OMXCOP',
  FH:  'OMXHEX',
  NO:  'OSE',
};

/**
 * @param {string} isin
 * @returns {Promise<{ symbol: string, exchange: string, name: string } | null>}
 */
export async function resolveByIsin(isin) {
  try {
    const response = await fetch(OPENFIGI_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();

    // Response shape: [ { data: [ { ticker, exchCode, name, ... } ] } ]
    const firstGroup = Array.isArray(payload) ? payload[0] : null;
    if (!firstGroup || !Array.isArray(firstGroup.data) || firstGroup.data.length === 0) {
      return null;
    }

    const item = firstGroup.data[0];
    const symbol = item.ticker ?? null;
    const exchCode = item.exchCode ?? null;
    const name = item.name ?? item.securityDescription ?? '';

    if (!symbol) {
      return null;
    }

    // Resolve exchange: try MIC map first, then exch-code map
    let exchange = exchCode ? micToTvExchange(exchCode) : null;
    if (!exchange || exchange === exchCode) {
      // micToTvExchange returns the input unchanged when unknown – fall back to our map
      exchange = EXCH_CODE_MAP[exchCode] ?? exchCode ?? 'NASDAQ';
    }

    return { symbol, exchange, name };
  } catch {
    return null;
  }
}
