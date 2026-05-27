/**
 * Builds external deep-links for a given stock candidate.
 */

/**
 * @param {{ symbol: string, exchange: string, yahoo_symbol: string }} opts
 * @returns {{ tradingview: string, stocktwits: string, yahoo: string }}
 */
export function buildLinks({ symbol, exchange, yahoo_symbol }) {
  return {
    tradingview: `https://www.tradingview.com/symbols/${exchange}-${symbol}/`,
    stocktwits:  `https://stocktwits.com/symbol/${symbol}`,
    yahoo:       `https://finance.yahoo.com/quote/${yahoo_symbol}`,
  };
}
