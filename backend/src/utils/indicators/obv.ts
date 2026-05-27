/**
 * On-Balance Volume (OBV)
 */
export function calculateOBV(closes: number[], volumes: number[]): number | null {
  if (closes.length < 2) return null;

  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv += volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      obv -= volumes[i];
    }
  }

  return obv;
}
