/**
 * Basit Hareketli Ortalama (SMA)
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}
