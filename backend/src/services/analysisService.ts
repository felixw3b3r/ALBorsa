import { withYahooSlot, yf } from '../index';
import { INDEX_COMPONENTS } from '../utils/constants';
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
import { scoreADX, scoreVWAP, scoreVolume, scoreRSI, calculateTotalScore } from '../utils/indicators/score';
import { fetchDeepSeekAnalysis, fetchDeepSeekQuantExplanation, DeepSeekAnalysis } from './deepseekService';
import { buildQuantSignal, QuantSignal } from './quantModel';

export interface AnalysisResult {
  symbol: string;
  price: number;
  changePercent: number;
  indicators: {
    sma20: number | null;
    ema50: number | null;
    rsi: number | null;
    macd: any;
    mom: number | null;
    atr: number | null;
    adx: number | null;
    vwap: number | null;
    obv: number | null;
    cmf: number | null;
  };
  scores: {
    adx: number;
    vwap: number;
    volume: number;
    rsi: number;
    total: number;
  };
  quant: QuantSignal;
  deepseek?: DeepSeekAnalysis | null;
}

let bist100Cache: AnalysisResult[] = [];
let nasdaq100Cache: AnalysisResult[] = [];
let lastBatchUpdateTime = 0;
let lastNasdaqBatchUpdateTime = 0;
let isUpdating = false;
let isNasdaqUpdating = false;

// DeepSeek Analiz Kuyruğu ve Cache'i
let deepseekResults: Record<string, DeepSeekAnalysis> = {};
let isDeepSeekRunning = false;
const ENABLE_LEGACY_DEEPSEEK_SIGNAL = process.env.ENABLE_LEGACY_DEEPSEEK_SIGNAL === 'true';

// Veritabanından her sembolün en son DeepSeek sonucunu yükle
async function loadDeepSeekResultsFromDB() {
  try {
    const mongoose = require('mongoose');
    const DeepSeekResult = mongoose.model('DeepSeekResult');
    
    // Her sembol için en son kaydı getir (Aggreggation)
    const latestResults = await DeepSeekResult.aggregate([
      { $sort: { timestamp: -1 } },
      { $group: {
          _id: "$symbol",
          latest: { $first: "$$ROOT" }
      }}
    ]);

    latestResults.forEach((item: any) => {
      const r = item.latest;
      deepseekResults[r.symbol] = {
        karar: r.karar,
        olasilik_yuzdesi: r.olasilik_yuzdesi,
        neden: r.neden,
        stop_loss: r.stop_loss,
        take_profit: r.take_profit,
        timestamp: r.timestamp.getTime()
      };
    });
    console.log(`📥 [DEEPSEEK] Loaded ${latestResults.length} latest results from historical DB.`);
  } catch (err: any) {
    console.error('❌ [DEEPSEEK] DB Load Error:', err.message);
  }
}

export async function startDeepSeekSequentialAnalysis() {
  if (isDeepSeekRunning) return;
  
  // Döngü başında en güncel verileri yükle
  await loadDeepSeekResultsFromDB();

  isDeepSeekRunning = true;
  console.log(`🔵 [DEEPSEEK] Sequential historical analysis cycle started...`);
  const symbols = INDEX_COMPONENTS['XU100.IS'];
  
  for (const symbol of symbols) {
    const symClean = symbol.replace('.IS', '');
    const existing = deepseekResults[symClean];
    
    if (existing && (Date.now() - existing.timestamp < 60 * 60 * 1000)) {
      continue;
    }

    try {
      const period1 = new Date();
      period1.setMonth(period1.getMonth() - 1);

      const data: any = await withYahooSlot(() => yf.chart(symbol, { period1, interval: '15m' }, { validateResult: false }));
      if (!data || !data.quotes || data.quotes.length < 10) continue;

      const quotes = data.quotes.filter((q: any) => q.close != null);
      const highs = quotes.map((q: any) => q.high);
      const lows = quotes.map((q: any) => q.low);
      const closes = quotes.map((q: any) => q.close);
      const volumes = quotes.map((q: any) => q.volume);
      const lastQuote = quotes[quotes.length - 1];
      
      const rsi = calculateRSI(closes, 14);
      const rsi_onceki = calculateRSI(closes.slice(0, -1), 14);
      const adx = calculateADX(highs, lows, closes, 14);
      const vwap = calculateVWAP(highs, lows, closes, volumes);
      const atr = calculateATR(highs, lows, closes, 14);
      const avgVol = volumes.slice(-10).reduce((a: number, b: number) => a + b, 0) / 10;

      const indicators = {
        adx: Math.round(adx || 0),
        vwap_sapma: vwap ? Number((((lastQuote.close - vwap) / vwap) * 100).toFixed(2)) : 0,
        hacim_orani: Number((lastQuote.volume / (avgVol || 1)).toFixed(2)),
        rsi_anlik: Math.round(rsi || 0),
        rsi_onceki: Math.round(rsi_onceki || 0),
        atr: Number((atr || 0).toFixed(2))
      };

      const result = await fetchDeepSeekAnalysis({
        hisse_adi: symClean,
        anlik_fiyat: lastQuote.close,
        indikatorler: indicators
      });

      if (result) {
        // BELLEKTEKİ CACHE'İ GÜNCELLE
        deepseekResults[symClean] = result;
        
        // MONGODB'YE YENİ KAYIT OLARAK EKLE (Silme yok, tarihsel takip var)
        try {
          const mongoose = require('mongoose');
          const DeepSeekResult = mongoose.model('DeepSeekResult');
          const newHistoryRecord = new DeepSeekResult({
            symbol: symClean,
            price: lastQuote.close,
            karar: result.karar,
            olasilik_yuzdesi: result.olasilik_yuzdesi,
            neden: result.neden,
            stop_loss: result.stop_loss,
            take_profit: result.take_profit,
            indicators: indicators,
            timestamp: new Date()
          });
          await newHistoryRecord.save();
          console.log(`💾 [DEEPSEEK] New historical record saved for ${symClean}`);
        } catch (dbErr: any) {
          console.error(`❌ [DEEPSEEK] DB Save Error:`, dbErr.message);
        }
        
        const cacheIndex = bist100Cache.findIndex(i => i.symbol === symClean);
        if (cacheIndex > -1) {
          bist100Cache[cacheIndex].deepseek = result;
        }
      }
      
      await new Promise(res => setTimeout(res, 2000));
    } catch (err: any) {
      console.error(`❌ [DEEPSEEK] Error analyzing ${symbol}:`, err.message);
    }
  }
  
  isDeepSeekRunning = false;
  console.log(`🔵 [DEEPSEEK] Cycle complete.`);
}

if (ENABLE_LEGACY_DEEPSEEK_SIGNAL) {
  setInterval(startDeepSeekSequentialAnalysis, 60 * 60 * 1000);
  setTimeout(startDeepSeekSequentialAnalysis, 15000);
} else {
  console.log('[QUANT] Legacy DeepSeek decision loop suspended. Active model: REGIME_FACTOR_V1.');
}

function quantToDeepSeekResult(quant: QuantSignal): DeepSeekAnalysis {
  return {
    karar: quant.decision,
    olasilik_yuzdesi: quant.probability,
    neden: quant.reasons.join(' '),
    stop_loss: quant.stopLoss,
    take_profit: quant.takeProfit,
    timestamp: Date.now()
  };
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function enrichTopQuantNarratives(results: AnalysisResult[]) {
  if (!process.env.DEEPSEEK_API_KEY) return;

  const limit = parsePositiveInt(process.env.DEEPSEEK_QUANT_EXPLAIN_LIMIT, 8, 0, 20);
  if (limit === 0) return;

  const candidates = [...results]
    .sort((a, b) => b.quant.opportunityScore - a.quant.opportunityScore)
    .slice(0, limit);

  for (const item of candidates) {
    const explanation = await fetchDeepSeekQuantExplanation({
      hisse_adi: item.symbol,
      anlik_fiyat: item.price,
      quant: item.quant
    });

    if (explanation && item.deepseek) {
      item.deepseek.neden = explanation;
      item.deepseek.timestamp = Date.now();
    }

    await new Promise(resolve => setTimeout(resolve, 350));
  }
}

export async function updateBist100Analysis() {
  if (isUpdating) {
    console.log(`[BATCH ANALYSIS BIST] Already in progress, skipping...`);
    return;
  }

  const symbols = INDEX_COMPONENTS['XU100.IS'];
  if (!symbols || symbols.length === 0) return;

  isUpdating = true;
  console.log(`[BATCH ANALYSIS BIST] Starting incremental update...`);

  const results: AnalysisResult[] = [];
  const failedSymbols: string[] = [];
  const startTime = Date.now();

  try {
    let indexQuotes: any[] = [];
    try {
      const indexPeriod = new Date();
      indexPeriod.setFullYear(indexPeriod.getFullYear() - 1);
      const indexData: any = await withYahooSlot(() => yf.chart('XU100.IS', { period1: indexPeriod, interval: '1d' }, { validateResult: false }));
      indexQuotes = (indexData?.quotes || []).filter((q: any) => q.close != null);
    } catch (indexErr: any) {
      console.warn('[QUANT] XU100 regime data unavailable:', indexErr?.message || indexErr);
    }

    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);

      const chunkResults = (await Promise.all(chunk.map(async (symbol): Promise<AnalysisResult | null> => {
        try {
          const period1 = new Date();
          period1.setMonth(period1.getMonth() - 6);
          const data: any = await withYahooSlot(() => yf.chart(symbol, { period1: period1, interval: '1d' }, { validateResult: false }));

          if (!data || !data.quotes || data.quotes.length < 20) return null;
          const quotes = data.quotes.filter((q: any) => q.close != null);
          if (quotes.length < 20) return null;

          const highs = quotes.map((q: any) => q.high);
          const lows = quotes.map((q: any) => q.low);
          const closes = quotes.map((q: any) => q.close);
          const volumes = quotes.map((q: any) => q.volume);
          const lastQuote = quotes[quotes.length - 1];
          const prevQuote = quotes[quotes.length - 2];
          const currentPrice = lastQuote.close;
          const changePercent = prevQuote ? ((currentPrice - prevQuote.close) / prevQuote.close) * 100 : 0;

          const sma20 = calculateSMA(closes, 20);
          const ema50 = calculateEMA(closes, 50);
          const rsi = calculateRSI(closes, 14);
          const macd = calculateMACD(closes);
          const mom = calculateMOM(closes, 10);
          const atr = calculateATR(highs, lows, closes, 14);
          const adx = calculateADX(highs, lows, closes, 14);
          const vwap = calculateVWAP(highs, lows, closes, volumes);
          const obv = calculateOBV(closes, volumes);
          const cmf = calculateCMF(highs, lows, closes, volumes, 20);
          const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;

          const sADX = scoreADX(adx || 0);
          const sVWAP = scoreVWAP(currentPrice, vwap || currentPrice);
          const sVol = scoreVolume(lastQuote.volume, avgVolume);
          const sRSI = scoreRSI(rsi || 50);
          const totalScore = calculateTotalScore({ adx: sADX, vwap: sVWAP, volume: sVol, rsi: sRSI });

          const symClean = symbol.replace('.IS', '');
          const quant = buildQuantSignal({ symbol: symClean, quotes, indexQuotes });
          return {
            symbol: symClean,
            price: currentPrice,
            changePercent,
            indicators: { sma20, ema50, rsi, macd, mom, atr, adx, vwap, obv, cmf },
            scores: { adx: sADX, vwap: sVWAP, volume: sVol, rsi: sRSI, total: quant.opportunityScore || totalScore },
            quant,
            deepseek: quantToDeepSeekResult(quant)
          };
        } catch (err: any) {
          failedSymbols.push(symbol);
          console.warn(`[BATCH ANALYSIS BIST] ${symbol} skipped:`, err?.message || err);
          return null;
        }
      }))).filter((result): result is AnalysisResult => result !== null);

      if (chunkResults.length > 0) {
        results.push(...chunkResults);
        bist100Cache = [...results].sort((a, b) => b.scores.total - a.scores.total);
        lastBatchUpdateTime = Date.now();
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (results.length > 0) {
      bist100Cache = [...results].sort((a, b) => b.quant.opportunityScore - a.quant.opportunityScore);
      await enrichTopQuantNarratives(bist100Cache);
      lastBatchUpdateTime = Date.now();

      const today = new Date().toISOString().split('T')[0];
      try {
        const mongoose = require('mongoose');
        const DailyAnalysis = mongoose.model('DailyAnalysis');
        await DailyAnalysis.findOneAndUpdate({ date: today + '-bist100' }, { results: bist100Cache, timestamp: new Date() }, { upsert: true });
      } catch (dbErr: any) {
        console.error(`[BATCH ANALYSIS BIST] DailyAnalysis save failed:`, dbErr?.message || dbErr);
      }
      console.log(`[BATCH ANALYSIS BIST] Complete. ${results.length} stocks processed in ${Date.now() - startTime}ms.`);
    }

    if (failedSymbols.length > 0) {
      console.warn(`[BATCH ANALYSIS BIST] ${failedSymbols.length} symbols failed: ${failedSymbols.join(', ')}`);
    }
  } catch (globalErr: any) {
    console.error(`[BATCH ANALYSIS BIST] Critical Failure:`, globalErr.message);
  } finally {
    isUpdating = false;
  }
}

export async function updateNasdaq100Analysis() {
  if (isNasdaqUpdating) {
    console.log(`[BATCH ANALYSIS NASDAQ] Already in progress, skipping...`);
    return;
  }

  const symbols = INDEX_COMPONENTS['NASDAQ100'];
  if (!symbols || symbols.length === 0) return;

  isNasdaqUpdating = true;
  console.log(`[BATCH ANALYSIS NASDAQ] Starting incremental update...`);

  const results: AnalysisResult[] = [];
  const failedSymbols: string[] = [];
  const startTime = Date.now();

  try {
    let indexQuotes: any[] = [];
    try {
      const indexPeriod = new Date();
      indexPeriod.setFullYear(indexPeriod.getFullYear() - 1);
      const indexData: any = await withYahooSlot(() => yf.chart('^NDX', { period1: indexPeriod, interval: '1d' }, { validateResult: false }));
      indexQuotes = (indexData?.quotes || []).filter((q: any) => q.close != null);
    } catch (indexErr: any) {
      console.warn('[QUANT] ^NDX regime data unavailable:', indexErr?.message || indexErr);
    }

    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);

      const chunkResults = (await Promise.all(chunk.map(async (symbol): Promise<AnalysisResult | null> => {
        try {
          const period1 = new Date();
          period1.setMonth(period1.getMonth() - 6);
          const data: any = await withYahooSlot(() => yf.chart(symbol, { period1: period1, interval: '1d' }, { validateResult: false }));

          if (!data || !data.quotes || data.quotes.length < 20) return null;
          const quotes = data.quotes.filter((q: any) => q.close != null);
          if (quotes.length < 20) return null;

          const highs = quotes.map((q: any) => q.high);
          const lows = quotes.map((q: any) => q.low);
          const closes = quotes.map((q: any) => q.close);
          const volumes = quotes.map((q: any) => q.volume);
          const lastQuote = quotes[quotes.length - 1];
          const prevQuote = quotes[quotes.length - 2];
          const currentPrice = lastQuote.close;
          const changePercent = prevQuote ? ((currentPrice - prevQuote.close) / prevQuote.close) * 100 : 0;

          const sma20 = calculateSMA(closes, 20);
          const ema50 = calculateEMA(closes, 50);
          const rsi = calculateRSI(closes, 14);
          const macd = calculateMACD(closes);
          const mom = calculateMOM(closes, 10);
          const atr = calculateATR(highs, lows, closes, 14);
          const adx = calculateADX(highs, lows, closes, 14);
          const vwap = calculateVWAP(highs, lows, closes, volumes);
          const obv = calculateOBV(closes, volumes);
          const cmf = calculateCMF(highs, lows, closes, volumes, 20);
          const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;

          const sADX = scoreADX(adx || 0);
          const sVWAP = scoreVWAP(currentPrice, vwap || currentPrice);
          const sVol = scoreVolume(lastQuote.volume, avgVolume);
          const sRSI = scoreRSI(rsi || 50);
          const totalScore = calculateTotalScore({ adx: sADX, vwap: sVWAP, volume: sVol, rsi: sRSI });

          const symClean = symbol.replace('.IS', '');
          const quant = buildQuantSignal({ symbol: symClean, quotes, indexQuotes });
          return {
            symbol: symClean,
            price: currentPrice,
            changePercent,
            indicators: { sma20, ema50, rsi, macd, mom, atr, adx, vwap, obv, cmf },
            scores: { adx: sADX, vwap: sVWAP, volume: sVol, rsi: sRSI, total: quant.opportunityScore || totalScore },
            quant,
            deepseek: quantToDeepSeekResult(quant)
          };
        } catch (err: any) {
          failedSymbols.push(symbol);
          console.warn(`[BATCH ANALYSIS NASDAQ] ${symbol} skipped:`, err?.message || err);
          return null;
        }
      }))).filter((result): result is AnalysisResult => result !== null);

      if (chunkResults.length > 0) {
        results.push(...chunkResults);
        nasdaq100Cache = [...results].sort((a, b) => b.scores.total - a.scores.total);
        lastNasdaqBatchUpdateTime = Date.now();
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (results.length > 0) {
      nasdaq100Cache = [...results].sort((a, b) => b.quant.opportunityScore - a.quant.opportunityScore);
      await enrichTopQuantNarratives(nasdaq100Cache);
      lastNasdaqBatchUpdateTime = Date.now();

      const today = new Date().toISOString().split('T')[0];
      try {
        const mongoose = require('mongoose');
        const DailyAnalysis = mongoose.model('DailyAnalysis');
        await DailyAnalysis.findOneAndUpdate({ date: today + '-nasdaq100' }, { results: nasdaq100Cache, timestamp: new Date() }, { upsert: true });
      } catch (dbErr: any) {
        console.error(`[BATCH ANALYSIS NASDAQ] DailyAnalysis save failed:`, dbErr?.message || dbErr);
      }
      console.log(`[BATCH ANALYSIS NASDAQ] Complete. ${results.length} stocks processed in ${Date.now() - startTime}ms.`);
    }

    if (failedSymbols.length > 0) {
      console.warn(`[BATCH ANALYSIS NASDAQ] ${failedSymbols.length} symbols failed: ${failedSymbols.join(', ')}`);
    }
  } catch (globalErr: any) {
    console.error(`[BATCH ANALYSIS NASDAQ] Critical Failure:`, globalErr.message);
  } finally {
    isNasdaqUpdating = false;
  }
}

async function loadDailyAnalysisFromDB(index: 'bist100' | 'nasdaq100') {
  try {
    const mongoose = require('mongoose');
    const DailyAnalysis = mongoose.model('DailyAnalysis');
    const latest = await DailyAnalysis.findOne({ date: { $regex: new RegExp(`-${index}$`) } }).sort({ timestamp: -1 });
    if (latest && latest.results) {
      const first = latest.results[0];
      if (!first?.quant?.modelVersion) {
        console.log(`[DATABASE] Legacy analysis cache for ${index} ignored; quant model refresh required.`);
        if (index === 'bist100') updateBist100Analysis();
        else updateNasdaq100Analysis();
        return;
      }
      if (index === 'bist100') {
        bist100Cache = latest.results;
        lastBatchUpdateTime = latest.timestamp.getTime();
      } else {
        nasdaq100Cache = latest.results;
        lastNasdaqBatchUpdateTime = latest.timestamp.getTime();
      }
      console.log(`📥 [DATABASE] Loaded ${latest.results.length} stocks from last daily analysis for ${index} (${latest.date}).`);
    }
  } catch (err: any) {
    console.error(`❌ [DATABASE] Load Error for ${index}:`, err.message);
  }
}

export function getBist100Analysis() {
  if (bist100Cache.length === 0 && !isUpdating) {
    loadDailyAnalysisFromDB('bist100').then(() => {
      if (bist100Cache.length === 0) updateBist100Analysis();
    });
  }
  return {
    data: bist100Cache,
    lastUpdate: lastBatchUpdateTime,
    isUpdating
  };
}

export function getNasdaq100Analysis() {
  if (nasdaq100Cache.length === 0 && !isNasdaqUpdating) {
    loadDailyAnalysisFromDB('nasdaq100').then(() => {
      if (nasdaq100Cache.length === 0) updateNasdaq100Analysis();
    });
  }
  return {
    data: nasdaq100Cache,
    lastUpdate: lastNasdaqBatchUpdateTime,
    isUpdating: isNasdaqUpdating
  };
}
