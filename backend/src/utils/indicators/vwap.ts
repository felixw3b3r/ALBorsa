/**
 * Hacim Ağırlıklı Ortalama Fiyat (VWAP)
 * Günlük sıfırlanan versiyon (Intraday verisi gerektirir)
 */
export function calculateVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number | null {
  if (closes.length === 0) return null;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    cumulativeTPV += typicalPrice * volumes[i];
    cumulativeVolume += volumes[i];
  }

  return cumulativeVolume === 0 ? null : cumulativeTPV / cumulativeVolume;
}
