import { RSI, MACD, BollingerBands, EMA } from 'technicalindicators';

/**
 * Calculates RSI using the professional 'technicalindicators' library.
 * This matches TA-Lib's implementation.
 */
export function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length <= period) return null;
  
  const input = {
    values: prices,
    period: period
  };
  
  const results = RSI.calculate(input);
  return results.length > 0 ? results[results.length - 1] : null;
}

/**
 * Calculates MACD using the professional 'technicalindicators' library.
 */
export function calculateMACD(prices: number[]): { value: number, signal: number, histogram: number } | null {
  if (prices.length < 26) return null;
  
  const input = {
    values: prices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  };
  
  const results = MACD.calculate(input);
  if (results.length === 0) return null;
  
  const last = results[results.length - 1];
  return {
    value: last.MACD || 0,
    signal: last.signal || 0,
    histogram: last.histogram || 0
  };
}

/**
 * Calculates Bollinger Bands.
 */
export function calculateBollingerBands(prices: number[], period = 20, stdDev = 2) {
  if (prices.length < period) return null;
  
  const input = {
    values: prices,
    period: period,
    stdDev: stdDev
  };
  
  const results = BollingerBands.calculate(input);
  return results.length > 0 ? results[results.length - 1] : null;
}

/**
 * Calculates Exponential Moving Average (EMA).
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const results = EMA.calculate({ values: prices, period: period });
  return results.length > 0 ? results[results.length - 1] : null;
}

/**
 * Comprehensive Technical Analysis Summary
 */
export function getTechnicalSummary(prices: number[]) {
  const lastPrice = prices[prices.length - 1];
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  const bb = calculateBollingerBands(prices);
  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);

  return {
    price: lastPrice,
    rsi,
    macd,
    bollinger: bb,
    ema: {
      ema20,
      ema50
    },
    signals: {
      rsiStatus: rsi ? (rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL') : 'UNKNOWN',
      trend: (ema20 && ema50) ? (ema20 > ema50 ? 'BULLISH' : 'BEARISH') : 'UNKNOWN'
    }
  };
}
