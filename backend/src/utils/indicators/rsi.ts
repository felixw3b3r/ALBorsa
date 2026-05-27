/**
 * Göreceli Güç Endeksi (RSI) - Wilder'ın orijinal düzleştirilmiş formülü
 * Python: ewm(alpha=1/periyot, adjust=False)
 */
export function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length <= period) return null;

  let gains = 0;
  let losses = 0;

  // İlk ortalamayı hesapla
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder'ın düzleştirme yöntemiyle devam et
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
