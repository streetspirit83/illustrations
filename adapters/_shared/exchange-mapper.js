/**
 * Exchange mapper: converts Yahoo Finance suffixes and MIC codes to TradingView exchange codes.
 */

const YAHOO_SUFFIX_MAP = {
  '.DE': 'XETR',
  '.F':  'FWB',
  '.MU': 'MUN',
  '.BE': 'BER',
  '.HM': 'HAM',
  '.DU': 'DUS',
  '.SG': 'STU',
  '.HA': 'HAN',
  '.PA': 'EURONEXT',
  '.AS': 'EURONEXT',
  '.BR': 'EURONEXT',
  '.MI': 'MIL',
  '.MC': 'BME',
  '.L':  'LSE',
  '.VI': 'VIE',
  '.SW': 'SIX',
  '.ST': 'OMXSTO',
  '.CO': 'OMXCOP',
  '.HE': 'OMXHEX',
  '.OL': 'OSE',
};

const MIC_MAP = {
  XNAS: 'NASDAQ',
  XNYS: 'NYSE',
  XETR: 'XETR',
  XLON: 'LSE',
  XPAR: 'EURONEXT',
  XAMS: 'EURONEXT',
  XMIL: 'MIL',
  XMAD: 'BME',
  XSWX: 'SIX',
  XSTO: 'OMXSTO',
  XCSE: 'OMXCOP',
  XHEL: 'OMXHEX',
  XOSL: 'OSE',
  XFRA: 'FWB',
};

/**
 * Strips the Yahoo Finance suffix from a symbol and maps it to a TradingView exchange code.
 *
 * @param {string} yahooSymbol - e.g. "SAP.DE", "AAPL"
 * @returns {{ symbol: string, exchange: string }}
 */
export function yahooSuffixToTvExchange(yahooSymbol) {
  // Sort by suffix length descending so longer suffixes match first (e.g. .MU before .M)
  const suffixes = Object.keys(YAHOO_SUFFIX_MAP).sort((a, b) => b.length - a.length);

  for (const suffix of suffixes) {
    if (yahooSymbol.endsWith(suffix)) {
      const symbol = yahooSymbol.slice(0, -suffix.length);
      return { symbol, exchange: YAHOO_SUFFIX_MAP[suffix] };
    }
  }

  // No suffix → US symbol; exchange is a placeholder pending resolveUsExchange
  return { symbol: yahooSymbol, exchange: 'NASDAQ' };
}

/**
 * Maps an ISO MIC code to a TradingView exchange code.
 *
 * @param {string} mic - e.g. "XNAS"
 * @returns {string} TradingView exchange code, or the original MIC if unknown
 */
export function micToTvExchange(mic) {
  return MIC_MAP[mic] ?? mic;
}
