/**
 * Üssel Hareketli Ortalama (EMA)
 * Python adjust=False mantığıyla (Alpha = 2 / (period + 1))
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;

  const k = 2 / (period + 1);
  let ema = prices[0]; // Başlangıç değeri olarak ilk fiyatı alıyoruz

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}
