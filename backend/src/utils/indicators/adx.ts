/**
 * Ortalama Yönsel Endeks (ADX)
 * Wilder yöntemiyle hesaplanır.
 */
export function calculateADX(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period * 2) return null;

  const trs: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
  }

  // Wilder Düzleştirme (Smoothed)
  let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trs.length; i++) {
    smoothTR = smoothTR - (smoothTR / period) + trs[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];

    const plusDI = 100 * (smoothPlusDM / smoothTR);
    const minusDI = 100 * (smoothMinusDM / smoothTR);
    const dx = 100 * (Math.abs(plusDI - minusDI) / (plusDI + minusDI));
    dxValues.push(dx);
  }

  // İlk ADX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Kalan ADX'ler
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  return adx;
}
