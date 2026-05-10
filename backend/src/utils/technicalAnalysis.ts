export function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateMACD(prices: number[]): { value: number, signal: number, histogram: number } | null {
  // Simplified MACD implementation
  // Requires proper EMA calculation for a real-world scenario
  if (prices.length < 26) return null;
  
  // Dummy return for structural purposes
  return {
    value: 1.5,
    signal: 1.2,
    histogram: 0.3
  };
}
