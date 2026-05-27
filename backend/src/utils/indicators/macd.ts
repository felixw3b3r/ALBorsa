import { calculateEMA } from './ema';

/**
 * MACD Çizgisi, Sinyal Çizgisi ve Histogram
 */
export function calculateMACD(prices: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  if (prices.length < longPeriod) return null;

  // Tüm seri için EMA hesaplamaları (Sinyal çizgisi için tüm MACD serisine ihtiyaç var)
  const emaShortArr: number[] = [];
  const emaLongArr: number[] = [];
  
  let kShort = 2 / (shortPeriod + 1);
  let kLong = 2 / (longPeriod + 1);
  
  let currentEmaShort = prices[0];
  let currentEmaLong = prices[0];

  const macdLineArr: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    currentEmaShort = prices[i] * kShort + currentEmaShort * (1 - kShort);
    currentEmaLong = prices[i] * kLong + currentEmaLong * (1 - kLong);
    
    if (i >= longPeriod - 1) {
      macdLineArr.push(currentEmaShort - currentEmaLong);
    }
  }

  if (macdLineArr.length < signalPeriod) return null;

  // Sinyal çizgisi (MACD serisinin EMA'sı)
  let kSignal = 2 / (signalPeriod + 1);
  let signalLine = macdLineArr[0];
  
  for (let i = 1; i < macdLineArr.length; i++) {
    signalLine = macdLineArr[i] * kSignal + signalLine * (1 - kSignal);
  }

  const currentMacd = macdLineArr[macdLineArr.length - 1];
  
  return {
    macdLine: currentMacd,
    signalLine: signalLine,
    histogram: currentMacd - signalLine
  };
}
