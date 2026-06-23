import { calculateSMA } from '../utils/indicators/sma';
import { calculateEMA } from '../utils/indicators/ema';
import { calculateMACD } from '../utils/indicators/macd';
import { calculateRSI } from '../utils/indicators/rsi';
import { calculateMOM } from '../utils/indicators/mom';
import { calculateATR } from '../utils/indicators/atr';
import { calculateADX } from '../utils/indicators/adx';
import { calculateVWAP } from '../utils/indicators/vwap';
import { calculateOBV } from '../utils/indicators/obv';
import { calculateCMF } from '../utils/indicators/cmf';

export type QuantDecision = 'GUCLU_AL' | 'KADEMELI_AL' | 'IZLE' | 'AZALT';
export type MarketRegime = 'BULL_TREND' | 'RANGE' | 'RISK_OFF' | 'VOLATILE';

export interface QuoteLike {
  date?: Date | string | number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

export interface QuantIndicators {
  sma20: number | null;
  ema50: number | null;
  rsi: number | null;
  macd: { macdLine: number; signalLine: number; histogram: number } | null;
  mom: number | null;
  atr: number | null;
  adx: number | null;
  vwap: number | null;
  obv: number | null;
  cmf: number | null;
}

export interface QuantSignal {
  modelVersion: string;
  symbol: string;
  decision: QuantDecision;
  probability: number;
  confidence: number;
  opportunityScore: number;
  riskScore: number;
  expectedAlpha20d: number;
  regime: MarketRegime;
  stopLoss: number;
  takeProfit: number;
  factorScores: {
    trend: number;
    momentum: number;
    volume: number;
    meanReversion: number;
    relativeStrength: number;
    riskAdjusted: number;
  };
  diagnostics: {
    return5d: number;
    return20d: number;
    return60d: number;
    indexReturn20d: number;
    relativeReturn20d: number;
    atrPercent: number;
    maxDrawdown20d: number;
    volumeRatio20d: number;
  };
  indicators: QuantIndicators;
  reasons: string[];
}

const MODEL_VERSION = 'REGIME_FACTOR_V1';

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function numbers(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => Number.isFinite(value as number));
}

function closeSeries(quotes: QuoteLike[]): number[] {
  return numbers(quotes.map(q => q.close));
}

function highSeries(quotes: QuoteLike[]): number[] {
  return numbers(quotes.map(q => q.high));
}

function lowSeries(quotes: QuoteLike[]): number[] {
  return numbers(quotes.map(q => q.low));
}

function volumeSeries(quotes: QuoteLike[]): number[] {
  return numbers(quotes.map(q => q.volume));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map(value => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function returnPercent(closes: number[], lookback: number): number {
  if (closes.length <= lookback) return 0;
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 1 - lookback];
  if (!past) return 0;
  return ((last / past) - 1) * 100;
}

function scoreFromReturn(value: number, scale: number): number {
  return clamp(50 + (value / scale) * 50);
}

function maxDrawdownPercent(closes: number[], lookback = 20): number {
  const slice = closes.slice(-lookback);
  if (slice.length < 2) return 0;
  let peak = slice[0];
  let maxDrawdown = 0;
  for (const price of slice) {
    peak = Math.max(peak, price);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - price) / peak) * 100);
    }
  }
  return maxDrawdown;
}

function inferMarketRegime(indexCloses: number[]): MarketRegime {
  if (indexCloses.length < 50) return 'RANGE';
  const last = indexCloses[indexCloses.length - 1];
  const sma20 = calculateSMA(indexCloses, 20) || last;
  const sma50 = calculateSMA(indexCloses, 50) || sma20;
  const ret20 = returnPercent(indexCloses, 20);
  const dailyReturns = indexCloses.slice(-20).map((value, index, arr) => {
    if (index === 0 || !arr[index - 1]) return 0;
    return ((value / arr[index - 1]) - 1) * 100;
  }).slice(1);
  const realizedVol = stddev(dailyReturns);

  if (last < sma50 && ret20 < -4) return 'RISK_OFF';
  if (realizedVol > 2.6 || Math.abs(ret20) > 12) return 'VOLATILE';
  if (last > sma20 && sma20 > sma50 && ret20 > 1) return 'BULL_TREND';
  return 'RANGE';
}

function regimeBias(regime: MarketRegime): number {
  if (regime === 'BULL_TREND') return 5;
  if (regime === 'RISK_OFF') return -8;
  if (regime === 'VOLATILE') return -4;
  return 0;
}

function buildReasons(input: {
  decision: QuantDecision;
  regime: MarketRegime;
  factorScores: QuantSignal['factorScores'];
  probability: number;
  riskScore: number;
  diagnostics: QuantSignal['diagnostics'];
}): string[] {
  const reasons: string[] = [];
  const { factorScores, diagnostics } = input;

  if (factorScores.relativeStrength >= 60) {
    reasons.push(`Endekse gore 20 gunluk relatif guc +${round(diagnostics.relativeReturn20d, 1)} puan.`);
  } else if (factorScores.relativeStrength <= 42) {
    reasons.push(`Endekse gore 20 gunluk relatif performans zayif: ${round(diagnostics.relativeReturn20d, 1)} puan.`);
  }

  if (factorScores.trend >= 62) reasons.push('Trend yapisi fiyat ortalamalarinin uzerinde ve teknik momentum destekli.');
  if (factorScores.volume >= 62) reasons.push(`Hacim 20 gunluk ortalamanin ${round(diagnostics.volumeRatio20d, 2)} kati.`);
  if (factorScores.meanReversion >= 65) reasons.push('RSI/VWAP bolgesi kademeli tepki potansiyeli uretiyor.');
  if (input.riskScore >= 68) reasons.push(`Risk yuksek: ATR ve son dusus derinligi skoru ${round(input.riskScore, 0)}.`);
  if (input.regime === 'RISK_OFF') reasons.push('Piyasa rejimi risk-off; pozisyon boyutu dusuk tutulmali.');
  if (reasons.length === 0) reasons.push('Sinyaller dengeli; net avantaj icin ek teyit beklenmeli.');

  return reasons.slice(0, 4);
}

export function buildQuantSignal(params: {
  symbol: string;
  quotes: QuoteLike[];
  indexQuotes?: QuoteLike[];
}): QuantSignal {
  const quotes = params.quotes.filter(q => q.close != null);
  const closes = closeSeries(quotes);
  const highs = highSeries(quotes);
  const lows = lowSeries(quotes);
  const volumes = volumeSeries(quotes);
  const indexCloses = closeSeries(params.indexQuotes || []);
  const currentPrice = closes[closes.length - 1] || 0;
  const lastVolume = volumes[volumes.length - 1] || 0;
  const avgVolume20 = average(volumes.slice(-20)) || lastVolume || 1;
  const volumeRatio20d = lastVolume / avgVolume20;

  const indicators: QuantIndicators = {
    sma20: calculateSMA(closes, 20),
    ema50: calculateEMA(closes, 50),
    rsi: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    mom: calculateMOM(closes, 10),
    atr: calculateATR(highs, lows, closes, 14),
    adx: calculateADX(highs, lows, closes, 14),
    vwap: calculateVWAP(highs, lows, closes, volumes),
    obv: calculateOBV(closes, volumes),
    cmf: calculateCMF(highs, lows, closes, volumes, 20)
  };

  const return5d = returnPercent(closes, 5);
  const return20d = returnPercent(closes, 20);
  const return60d = returnPercent(closes, 60);
  const indexReturn20d = returnPercent(indexCloses, 20);
  const relativeReturn20d = return20d - indexReturn20d;
  const atrPercent = currentPrice > 0 ? ((indicators.atr || 0) / currentPrice) * 100 : 0;
  const maxDrawdown20d = maxDrawdownPercent(closes, 20);
  const regime = inferMarketRegime(indexCloses);

  const priceVsSma = indicators.sma20 && currentPrice > indicators.sma20 ? 62 : 38;
  const priceVsEma = indicators.ema50 && currentPrice > indicators.ema50 ? 62 : 38;
  const macdScore = indicators.macd ? (indicators.macd.histogram > 0 ? 62 : 38) : 50;
  const adxScore = clamp(((indicators.adx || 0) - 12) * 3.2);
  const trend = average([priceVsSma, priceVsEma, macdScore, adxScore]);

  const momentum = average([
    scoreFromReturn(return5d, 6),
    scoreFromReturn(return20d, 14),
    scoreFromReturn(return60d, 28),
    scoreFromReturn(relativeReturn20d, 10),
    scoreFromReturn(currentPrice > 0 ? ((indicators.mom || 0) / currentPrice) * 100 : 0, 5)
  ]);

  const volume = average([
    clamp(50 + (volumeRatio20d - 1) * 35),
    indicators.cmf != null ? clamp(50 + indicators.cmf * 90) : 50,
    indicators.obv != null && indicators.obv > 0 ? 58 : 45
  ]);

  const rsi = indicators.rsi || 50;
  const vwapDeviation = indicators.vwap && indicators.vwap > 0
    ? ((currentPrice - indicators.vwap) / indicators.vwap) * 100
    : 0;
  const meanReversion = average([
    rsi <= 35 ? clamp(72 + (35 - rsi) * 1.2) : rsi >= 72 ? clamp(32 - (rsi - 72) * 1.4) : 54,
    Math.abs(vwapDeviation) <= 2 ? 58 : vwapDeviation < -4 ? 66 : 42
  ]);

  const relativeStrength = average([
    scoreFromReturn(relativeReturn20d, 10),
    scoreFromReturn(return60d - returnPercent(indexCloses, 60), 18)
  ]);

  const riskScore = clamp(
    (atrPercent * 14) +
    (maxDrawdown20d * 2.2) +
    (volumeRatio20d < 0.55 ? 18 : 0) +
    (regime === 'RISK_OFF' ? 15 : regime === 'VOLATILE' ? 10 : 0)
  );

  const riskAdjusted = clamp((trend * 0.28) + (momentum * 0.32) + (volume * 0.18) + (relativeStrength * 0.22) - (riskScore * 0.22));
  const expectedAlpha20d = clamp(
    ((momentum - 50) * 0.045) +
    ((trend - 50) * 0.035) +
    ((volume - 50) * 0.02) +
    ((relativeStrength - 50) * 0.055) -
    ((riskScore - 45) * 0.025),
    -18,
    18
  );
  const probability = clamp(
    50 +
    expectedAlpha20d * 2.3 +
    (riskAdjusted - 50) * 0.28 +
    regimeBias(regime),
    5,
    95
  );

  const confidence = clamp(
    42 +
    Math.min(closes.length, 130) * 0.18 +
    Math.abs(probability - 50) * 0.45 +
    (Math.abs(trend - momentum) < 18 ? 8 : -4) -
    (riskScore > 75 ? 10 : 0),
    20,
    92
  );

  const opportunityScore = clamp(
    (probability * 0.48) +
    (riskAdjusted * 0.32) +
    (confidence * 0.12) -
    (riskScore * 0.18) +
    12
  );

  let decision: QuantDecision = 'IZLE';
  if (riskScore >= 82 && probability < 62) decision = 'AZALT';
  else if (probability >= 68 && opportunityScore >= 70 && riskScore < 68) decision = 'GUCLU_AL';
  else if (probability >= 58 && opportunityScore >= 56 && riskScore < 78) decision = 'KADEMELI_AL';
  else if (probability <= 43 || opportunityScore < 36) decision = 'AZALT';

  const atrValue = indicators.atr || currentPrice * 0.03;
  const stopDistance = Math.max(atrValue * 1.8, currentPrice * (riskScore > 65 ? 0.045 : 0.035));
  const rewardMultiplier = decision === 'GUCLU_AL' ? 2.25 : decision === 'KADEMELI_AL' ? 1.85 : 1.35;
  const stopLoss = currentPrice > 0 ? round(currentPrice - stopDistance, 2) : 0;
  const takeProfit = currentPrice > 0 ? round(currentPrice + stopDistance * rewardMultiplier, 2) : 0;

  const diagnostics = {
    return5d: round(return5d, 2),
    return20d: round(return20d, 2),
    return60d: round(return60d, 2),
    indexReturn20d: round(indexReturn20d, 2),
    relativeReturn20d: round(relativeReturn20d, 2),
    atrPercent: round(atrPercent, 2),
    maxDrawdown20d: round(maxDrawdown20d, 2),
    volumeRatio20d: round(volumeRatio20d, 2)
  };

  const factorScores = {
    trend: round(trend, 1),
    momentum: round(momentum, 1),
    volume: round(volume, 1),
    meanReversion: round(meanReversion, 1),
    relativeStrength: round(relativeStrength, 1),
    riskAdjusted: round(riskAdjusted, 1)
  };

  const reasons = buildReasons({
    decision,
    regime,
    factorScores,
    probability,
    riskScore,
    diagnostics
  });

  return {
    modelVersion: MODEL_VERSION,
    symbol: params.symbol,
    decision,
    probability: round(probability, 0),
    confidence: round(confidence, 0),
    opportunityScore: round(opportunityScore, 0),
    riskScore: round(riskScore, 0),
    expectedAlpha20d: round(expectedAlpha20d, 2),
    regime,
    stopLoss,
    takeProfit,
    factorScores,
    diagnostics,
    indicators,
    reasons
  };
}
