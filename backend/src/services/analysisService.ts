import mongoose from 'mongoose';
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
    macd: {
      MACD?: number | null;
      signal?: number | null;
      histogram?: number | null;
    } | null;
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

// Safe Mongoose Model Getter
function getModel<T = any>(modelName: string): mongoose.Model<T> {
  return mongoose.model<T>(modelName);
}

// DeepSeek Analiz Kuyruğu ve Cache'i
let deepseekResults: Record<string, DeepSeekAnalysis> = {};
let isDeepSeekRunning = false;
const ENABLE_LEGACY_DEEPSEEK_SIGNAL = process.env.ENABLE_LEGACY_DEEPSEEK_SIGNAL === 'true';

// Veritabanından her sembolün en son DeepSeek sonucunu yükle
async function loadDeepSeekResultsFromDB() {
  try {
    const DeepSeekResult = getModel('DeepSeekResult');
    
    // Her sembol için en son kaydı getir (Aggregation)
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
        
        // MONGODB'YE YENİ KAYIT OLARAK EKLE
        try {
          const DeepSeekResult = getModel('DeepSeekResult');
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

interface MarketBatchConfig {
  indexKey: 'XU100.IS' | 'NASDAQ100';
  regimeSymbol: string;
  marketTag: 'bist' | 'nasdaq';
  dateSuffix: string;
  getIsUpdating: () => boolean;
  setIsUpdating: (val: boolean) => void;
  setCacheAndTimestamp: (results: AnalysisResult[], timestamp: number) => void;
}

async function runMarketBatchAnalysis(config: MarketBatchConfig) {
  if (config.getIsUpdating()) {
    console.log(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] Already in progress, skipping...`);
    return;
  }

  const symbols = INDEX_COMPONENTS[config.indexKey];
  if (!symbols || symbols.length === 0) return;

  config.setIsUpdating(true);
  console.log(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] Starting incremental update...`);

  const results: AnalysisResult[] = [];
  const failedSymbols: string[] = [];
  const startTime = Date.now();

  try {
    let indexQuotes: any[] = [];
    try {
      const indexPeriod = new Date();
      indexPeriod.setFullYear(indexPeriod.getFullYear() - 1);
      const indexData: any = await withYahooSlot(() => yf.chart(config.regimeSymbol, { period1: indexPeriod, interval: '1d' }, { validateResult: false }));
      indexQuotes = (indexData?.quotes || []).filter((q: any) => q.close != null);
    } catch (indexErr: any) {
      console.warn(`[QUANT] ${config.regimeSymbol} regime data unavailable:`, indexErr?.message || indexErr);
    }

    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);

      const chunkResults = (await Promise.all(chunk.map(async (symbol): Promise<AnalysisResult | null> => {
        try {
          const period1 = new Date();
          period1.setMonth(period1.getMonth() - 6);
          const data: any = await withYahooSlot(() => yf.chart(symbol, { period1: period1, interval: '1d' }, { validateResult: false }));

          if (!data || !data.quotes || data.quotes.length < 1) return null;
          const quotes = data.quotes.filter((q: any) => q.close != null);
          if (quotes.length < 1) return null;

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
          console.warn(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] ${symbol} skipped:`, err?.message || err);
          return null;
        }
      }))).filter((result): result is AnalysisResult => result !== null);

      if (chunkResults.length > 0) {
        results.push(...chunkResults);
        const sorted = [...results].sort((a, b) => b.scores.total - a.scores.total);
        config.setCacheAndTimestamp(sorted, Date.now());
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (results.length > 0) {
      const sortedByQuant = [...results].sort((a, b) => b.quant.opportunityScore - a.quant.opportunityScore);
      await enrichTopQuantNarratives(sortedByQuant);
      config.setCacheAndTimestamp(sortedByQuant, Date.now());

      const today = new Date().toISOString().split('T')[0];
      try {
        const DailyAnalysis = getModel('DailyAnalysis');
        await DailyAnalysis.findOneAndUpdate(
          { date: today + config.dateSuffix },
          { results: sortedByQuant, timestamp: new Date() },
          { upsert: true }
        );
      } catch (dbErr: any) {
        console.error(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] DailyAnalysis save failed:`, dbErr?.message || dbErr);
      }
      
      // AI Portfolio integration
      for (const item of results) {
        await processStockSignal(config.marketTag, item.symbol, item.price, item.quant);
      }
      await updateAiPortfolioSignals(config.marketTag, results);

      console.log(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] Complete. ${results.length} stocks processed in ${Date.now() - startTime}ms.`);
    }

    if (failedSymbols.length > 0) {
      console.warn(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] ${failedSymbols.length} symbols failed: ${failedSymbols.join(', ')}`);
    }
  } catch (globalErr: any) {
    console.error(`[BATCH ANALYSIS ${config.marketTag.toUpperCase()}] Critical Failure:`, globalErr.message);
  } finally {
    config.setIsUpdating(false);
  }
}

export async function updateBist100Analysis() {
  await runMarketBatchAnalysis({
    indexKey: 'XU100.IS',
    regimeSymbol: 'XU100.IS',
    marketTag: 'bist',
    dateSuffix: '-bist100',
    getIsUpdating: () => isUpdating,
    setIsUpdating: (val) => { isUpdating = val; },
    setCacheAndTimestamp: (results, time) => {
      bist100Cache = results;
      lastBatchUpdateTime = time;
    }
  });
}

export async function updateNasdaq100Analysis() {
  await runMarketBatchAnalysis({
    indexKey: 'NASDAQ100',
    regimeSymbol: '^NDX',
    marketTag: 'nasdaq',
    dateSuffix: '-nasdaq100',
    getIsUpdating: () => isNasdaqUpdating,
    setIsUpdating: (val) => { isNasdaqUpdating = val; },
    setCacheAndTimestamp: (results, time) => {
      nasdaq100Cache = results;
      lastNasdaqBatchUpdateTime = time;
    }
  });
}

async function processStockSignal(market: 'nasdaq' | 'bist', symbol: string, currentPrice: number, quant: any) {
  try {
    if (quant && quant.opportunityScore >= 65) {
      const AiSignalModel = getModel('AiSignal');
      
      const activeSignal = await AiSignalModel.findOne({ symbol, market, status: 'ACTIVE' });
      if (!activeSignal) {
        const newSignal = new AiSignalModel({
          symbol,
          market,
          entryPrice: currentPrice,
          entryDate: new Date(),
          takeProfit: quant.takeProfit,
          stopLoss: quant.stopLoss,
          opportunityScore: quant.opportunityScore,
          status: 'ACTIVE'
        });
        await newSignal.save();
        console.log(`[AI PORTFOLIO] Created new ${market.toUpperCase()} signal for ${symbol} at ${currentPrice} (TP: ${quant.takeProfit}, SL: ${quant.stopLoss})`);
      }
    }
  } catch (err: any) {
    console.error(`❌ [AI PORTFOLIO] Error creating signal for ${symbol}:`, err.message);
  }
}

async function updateAiPortfolioSignals(market: 'nasdaq' | 'bist', currentResults: AnalysisResult[]) {
  try {
    const AiSignalModel = getModel('AiSignal');
    
    // Get active signals
    const activeSignals = await AiSignalModel.find({ market, status: 'ACTIVE' });
    if (activeSignals.length === 0) return;
    
    console.log(`[AI PORTFOLIO] Checking ${activeSignals.length} active ${market.toUpperCase()} signals...`);
    
    for (const signal of activeSignals) {
      const result = currentResults.find(r => r.symbol === signal.symbol);
      if (!result) continue;
      
      const currentPrice = result.price;
      let shouldClose = false;
      let closeStatus: 'TAKE_PROFIT' | 'STOP_LOSS' = 'TAKE_PROFIT';
      
      if (currentPrice >= signal.takeProfit) {
        shouldClose = true;
        closeStatus = 'TAKE_PROFIT';
      } else if (currentPrice <= signal.stopLoss) {
        shouldClose = true;
        closeStatus = 'STOP_LOSS';
      }
      
      if (shouldClose) {
        signal.status = closeStatus;
        signal.closePrice = currentPrice;
        signal.closeDate = new Date();
        await signal.save();
        console.log(`[AI PORTFOLIO] Signal CLOSED (${closeStatus}) for ${signal.symbol} at ${currentPrice} (Entry: ${signal.entryPrice})`);
      }
    }
  } catch (err: any) {
    console.error(`❌ [AI PORTFOLIO] Error updating active signals:`, err.message);
  }
}

async function initializeSignalsFromCache(market: 'nasdaq' | 'bist', results: AnalysisResult[]) {
  try {
    console.log(`🚀 [AI PORTFOLIO] Initializing signals from cached data for ${market.toUpperCase()}...`);
    for (const item of results) {
      if (item.quant && item.quant.opportunityScore >= 65) {
        await processStockSignal(market, item.symbol, item.price, item.quant);
      }
    }
    await updateAiPortfolioSignals(market, results);
  } catch (err: any) {
    console.error(`❌ [AI PORTFOLIO] Init signals error for ${market}:`, err.message);
  }
}

async function loadDailyAnalysisFromDB(index: 'bist100' | 'nasdaq100') {
  try {
    const DailyAnalysis = getModel('DailyAnalysis');
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
      initializeSignalsFromCache(index === 'bist100' ? 'bist' : 'nasdaq', latest.results);
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
