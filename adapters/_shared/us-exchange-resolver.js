/**
 * Resolves the primary US exchange for a ticker symbol via the FMP /profile endpoint.
 * Results are cached in-process for the lifetime of the Node.js process.
 */

const cache = new Map();

/**
 * @param {string} symbol - US ticker, e.g. "AAPL"
 * @returns {Promise<"NASDAQ" | "NYSE" | "AMEX">}
 */
export async function resolveUsExchange(symbol) {
  const key = symbol.toUpperCase();

  if (cache.has(key)) {
    return cache.get(key);
  }

  const exchange = await _fetchFromFmp(key);
  cache.set(key, exchange);
  return exchange;
}

/**
 * @param {string} symbol
 * @returns {Promise<"NASDAQ" | "NYSE" | "AMEX">}
 */
async function _fetchFromFmp(symbol) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    return 'NASDAQ';
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}?apikey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      return 'NASDAQ';
    }

    const data = await response.json();
    const profile = Array.isArray(data) ? data[0] : data;

    if (!profile || !profile.exchangeShortName) {
      return 'NASDAQ';
    }

    const name = profile.exchangeShortName.toUpperCase();

    if (name === 'NYSE' || name === 'AMEX' || name === 'NASDAQ') {
      return name;
    }

    // FMP sometimes returns "NASDAQ NMS" or similar – normalise
    if (name.includes('NASDAQ')) return 'NASDAQ';
    if (name.includes('NYSE'))   return 'NYSE';
    if (name.includes('AMEX') || name.includes('AMERICAN')) return 'AMEX';

    return 'NASDAQ';
  } catch {
    return 'NASDAQ';
  }
}
