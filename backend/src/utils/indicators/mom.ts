/**
 * Momentum (MOM)
 * MOM = Current Price - Price n periods ago
 */
export function calculateMOM(prices: number[], period = 10): number | null {
  if (prices.length < period) return null;
  return prices[prices.length - 1] - prices[prices.length - 1 - period];
}
