/**
 * Teknik Göstergelere Dayalı Alım Puanlaması (Buy Score)
 */

export function scoreADX(adx: number): number {
  if (adx < 20) return 0;
  if (adx >= 40) return 100;
  return (adx - 20) * 5;
}

export function scoreVWAP(price: number, vwap: number): number {
  const deviation = ((price - vwap) / vwap) * 100;
  
  if (deviation < 0) {
    return 50 + (deviation * 25);
  } else {
    if (deviation <= 2.0) {
      return 50 + (deviation * 25);
    } else {
      return 100 - ((deviation - 2.0) * 20);
    }
  }
}

export function scoreVolume(currentVolume: number, avgVolume: number): number {
  const ratio = currentVolume / (avgVolume || 1);
  if (ratio < 0.5) return 0;
  if (ratio >= 2.0) return 100;
  return (ratio - 0.5) * (100 / 1.5);
}

export function scoreRSI(rsi: number): number {
  // RSI 30 ve altı -> 100 puan (Aşırı satım, alım fırsatı)
  // RSI 70 ve üstü -> 0 puan (Aşırı alım, riskli)
  if (rsi <= 30) return 100;
  if (rsi >= 70) return 0;
  return 100 - ((rsi - 30) * (100 / 40));
}

export function calculateTotalScore(scores: { adx: number, vwap: number, volume: number, rsi: number }): number {
  // Ağırlıklı ortalama (İsteğe göre değiştirilebilir)
  return (scores.adx * 0.2) + (scores.vwap * 0.3) + (scores.volume * 0.2) + (scores.rsi * 0.3);
}
