/**
 * Ortalama Gerçek Aralık (ATR)
 * Wilder'ın düzleştirme yöntemiyle (Python alpha=1/periyot, adjust=False)
 */
export function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(tr1, tr2, tr3));
  }

  // İlk ATR = TR'lerin basit ortalaması
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder'ın düzleştirmesi
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return atr;
}
