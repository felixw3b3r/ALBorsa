/**
 * Chaikin Money Flow (CMF)
 */
export function calculateCMF(highs: number[], lows: number[], closes: number[], volumes: number[], period = 20): number | null {
  if (closes.length < period) return null;

  let moneyFlowSum = 0;
  let volumeSum = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i];

    const moneyFlowMultiplier = high === low ? 0 : ((close - low) - (high - close)) / (high - low);
    moneyFlowSum += moneyFlowMultiplier * volume;
    volumeSum += volume;
  }

  return volumeSum === 0 ? 0 : moneyFlowSum / volumeSum;
}
