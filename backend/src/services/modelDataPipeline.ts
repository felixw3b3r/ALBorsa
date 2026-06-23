import axios from 'axios';
import mongoose from 'mongoose';
import { withYahooSlot, yf } from '../index';
import { INDEX_COMPONENTS } from '../utils/constants';
import { buildQuantSignal, QuoteLike } from './quantModel';

type PipelineOptions = {
  symbols?: string[];
  years?: number;
  limit?: number;
};

const DEFAULT_SYMBOLS = INDEX_COMPONENTS['XU100.IS'];
const DEFAULT_MACRO_SYMBOLS = ['USDTRY=X', 'EURTRY=X', 'XU100.IS'];

function model<T = any>(name: string) {
  return mongoose.model<T>(name);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startDate(years = 5): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setHours(0, 0, 0, 0);
  return date;
}

function selectedSymbols(options: PipelineOptions = {}): string[] {
  const symbols = options.symbols && options.symbols.length > 0 ? options.symbols : DEFAULT_SYMBOLS;
  const normalized = symbols
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean)
    .map(symbol => symbol.includes('.') || symbol.includes('-') || symbol.startsWith('^') ? symbol : `${symbol}.IS`);
  return Array.from(new Set(['XU100.IS', ...normalized])).slice(0, options.limit || normalized.length + 1);
}

function toQuoteLike(bar: any): QuoteLike {
  return {
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume
  };
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function futureReturn(bars: any[], index: number, horizon: number): number | null {
  const start = bars[index];
  const end = bars[index + horizon];
  if (!start?.close || !end?.close) return null;
  return round(((end.close / start.close) - 1) * 100);
}

function maxDrawdown(bars: any[], index: number, horizon: number): number | null {
  const start = bars[index];
  const slice = bars.slice(index, index + horizon + 1);
  if (!start?.close || slice.length < 2) return null;

  let peak = start.close;
  let maxDrop = 0;
  for (const bar of slice) {
    peak = Math.max(peak, bar.close);
    if (peak > 0) maxDrop = Math.max(maxDrop, ((peak - bar.close) / peak) * 100);
  }
  return round(maxDrop);
}

function classifyEvent(text: string): { eventType: string; impactScore: number; sentimentScore: number } {
  const lower = text.toLocaleLowerCase('tr-TR');
  const rules = [
    { type: 'financial_result_positive', words: ['kar artis', 'net kar', 'rekor kar', 'ciro art'], impact: 0.55, sentiment: 0.65 },
    { type: 'financial_result_negative', words: ['zarar', 'kar azalis', 'net zarar'], impact: -0.55, sentiment: -0.65 },
    { type: 'dividend', words: ['temettu', 'kar payi'], impact: 0.35, sentiment: 0.45 },
    { type: 'capital_increase_risk', words: ['bedelli', 'ruchan'], impact: -0.45, sentiment: -0.45 },
    { type: 'bonus_issue', words: ['bedelsiz'], impact: 0.25, sentiment: 0.35 },
    { type: 'contract', words: ['sozlesme', 'ihale', 'siparis', 'anlasma'], impact: 0.4, sentiment: 0.5 },
    { type: 'regulatory_risk', words: ['ceza', 'sorusturma', 'tedbir', 'dava'], impact: -0.5, sentiment: -0.55 }
  ];

  for (const rule of rules) {
    if (rule.words.some(word => lower.includes(word))) {
      return { eventType: rule.type, impactScore: rule.impact, sentimentScore: rule.sentiment };
    }
  }

  return { eventType: 'general_news', impactScore: 0, sentimentScore: 0 };
}

export async function backfillDailyBars(options: PipelineOptions = {}) {
  const DailyBar = model('DailyBar');
  const symbols = selectedSymbols(options);
  const period1 = startDate(options.years || 5);
  let saved = 0;
  const failed: string[] = [];

  for (const symbol of symbols) {
    try {
      const chart: any = await withYahooSlot(() => yf.chart(symbol, { period1, interval: '1d' }, { validateResult: false }));
      const quotes = (chart?.quotes || []).filter((quote: any) => quote?.close != null);

      for (const quote of quotes) {
        const date = new Date(quote.date);
        await DailyBar.findOneAndUpdate(
          { symbol, date: dateKey(date) },
          {
            symbol,
            date: dateKey(date),
            timestamp: date,
            open: Number(quote.open || quote.close),
            high: Number(quote.high || quote.close),
            low: Number(quote.low || quote.close),
            close: Number(quote.close),
            adjustedClose: Number(quote.adjclose || quote.close),
            volume: Number(quote.volume || 0),
            source: 'yahoo'
          },
          { upsert: true, returnDocument: 'after' }
        );
        saved++;
      }
    } catch (error: any) {
      failed.push(symbol);
      console.warn(`[MODEL-DATA] DailyBar backfill failed for ${symbol}:`, error?.message || error);
    }
  }

  return { symbols: symbols.length, saved, failed };
}

export async function syncMacroSeries(options: PipelineOptions = {}) {
  const MacroSeries = model('MacroSeries');
  const period1 = startDate(options.years || 5);
  let saved = 0;
  const failed: string[] = [];

  for (const symbol of DEFAULT_MACRO_SYMBOLS) {
    try {
      const chart: any = await withYahooSlot(() => yf.chart(symbol, { period1, interval: '1d' }, { validateResult: false }));
      const quotes = (chart?.quotes || []).filter((quote: any) => quote?.close != null);
      for (const quote of quotes) {
        const date = new Date(quote.date);
        await MacroSeries.findOneAndUpdate(
          { source: 'yahoo', code: symbol, date: dateKey(date) },
          { source: 'yahoo', code: symbol, date: dateKey(date), value: Number(quote.close), raw: quote },
          { upsert: true, returnDocument: 'after' }
        );
        saved++;
      }
    } catch (error: any) {
      failed.push(symbol);
      console.warn(`[MODEL-DATA] Macro yahoo sync failed for ${symbol}:`, error?.message || error);
    }
  }

  const evdsKey = process.env.TCMB_EVDS_API_KEY;
  const evdsSeries = (process.env.TCMB_EVDS_SERIES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (evdsKey && evdsSeries.length > 0) {
    const end = new Date();
    const formatEvdsDate = (date: Date) => `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    try {
      const response = await axios.get('https://evds2.tcmb.gov.tr/service/evds/', {
        params: {
          series: evdsSeries.join('-'),
          startDate: formatEvdsDate(period1),
          endDate: formatEvdsDate(end),
          type: 'json',
          key: evdsKey
        },
        timeout: 30000
      });

      for (const row of response.data?.items || []) {
        const rawDate = row.Tarih || row.DATE;
        if (!rawDate) continue;
        const [day, month, year] = rawDate.split('-');
        const date = `${year}-${month}-${day}`;
        for (const code of evdsSeries) {
          const value = Number(String(row[code] || '').replace(',', '.'));
          if (!Number.isFinite(value)) continue;
          await MacroSeries.findOneAndUpdate(
            { source: 'tcmb_evds', code, date },
            { source: 'tcmb_evds', code, date, value, raw: row },
            { upsert: true, returnDocument: 'after' }
          );
          saved++;
        }
      }
    } catch (error: any) {
      failed.push('TCMB_EVDS');
      console.warn('[MODEL-DATA] TCMB EVDS sync failed:', error?.message || error);
    }
  }

  return { saved, failed };
}

export async function buildFeatureSnapshots(options: PipelineOptions = {}) {
  const DailyBar = model('DailyBar');
  const FeatureSnapshot = model('FeatureSnapshot');
  const symbols = selectedSymbols(options).filter(symbol => symbol !== 'XU100.IS');
  const indexBars = await DailyBar.find({ symbol: 'XU100.IS' }).sort({ date: 1 }).lean();
  let saved = 0;

  for (const symbol of symbols) {
    const bars = await DailyBar.find({ symbol }).sort({ date: 1 }).lean();
    if (bars.length < 70 || indexBars.length < 70) continue;

    for (let i = 69; i < bars.length; i++) {
      const bar = bars[i];
      const indexSlice = indexBars.filter((indexBar: any) => indexBar.date <= bar.date).slice(-140);
      if (indexSlice.length < 50) continue;

      const quotes = bars.slice(Math.max(0, i - 139), i + 1).map(toQuoteLike);
      const quant = buildQuantSignal({
        symbol: symbol.replace('.IS', ''),
        quotes,
        indexQuotes: indexSlice.map(toQuoteLike)
      });

      await FeatureSnapshot.findOneAndUpdate(
        { symbol, date: bar.date, modelVersion: quant.modelVersion },
        {
          symbol,
          date: bar.date,
          modelVersion: quant.modelVersion,
          price: bar.close,
          volume: bar.volume,
          indicators: quant.indicators,
          factorScores: quant.factorScores,
          diagnostics: quant.diagnostics,
          quant,
          decision: quant.decision,
          probability: quant.probability,
          opportunityScore: quant.opportunityScore,
          riskScore: quant.riskScore,
          regime: quant.regime
        },
        { upsert: true, returnDocument: 'after' }
      );
      saved++;
    }
  }

  return { symbols: symbols.length, saved };
}

export async function generateTrainingLabels(options: PipelineOptions = {}) {
  const DailyBar = model('DailyBar');
  const FeatureSnapshot = model('FeatureSnapshot');
  const TrainingLabel = model('TrainingLabel');
  const symbols = selectedSymbols(options).filter(symbol => symbol !== 'XU100.IS');
  const indexBars = await DailyBar.find({ symbol: 'XU100.IS' }).sort({ date: 1 }).lean();
  const indexByDate = new Map(indexBars.map((bar: any, idx: number) => [bar.date, { bar, idx }]));
  let saved = 0;

  for (const symbol of symbols) {
    const bars = await DailyBar.find({ symbol }).sort({ date: 1 }).lean();
    const barIndex = new Map(bars.map((bar: any, idx: number) => [bar.date, idx]));
    const snapshots = await FeatureSnapshot.find({ symbol }).sort({ date: 1 }).lean();

    for (const snapshot of snapshots) {
      const idx = barIndex.get(snapshot.date);
      const indexMeta = indexByDate.get(snapshot.date);
      if (idx == null || !indexMeta) continue;

      const return5d = futureReturn(bars, idx, 5);
      const return20d = futureReturn(bars, idx, 20);
      const return60d = futureReturn(bars, idx, 60);
      const indexReturn20d = futureReturn(indexBars, indexMeta.idx, 20);
      const drawdown20d = maxDrawdown(bars, idx, 20);
      if (return20d == null || indexReturn20d == null || drawdown20d == null) continue;

      const relativeReturn20d = round(return20d - indexReturn20d);
      await TrainingLabel.findOneAndUpdate(
        { symbol, date: snapshot.date, horizon: 20 },
        {
          symbol,
          date: snapshot.date,
          horizon: 20,
          forwardReturn5d: return5d,
          forwardReturn20d: return20d,
          forwardReturn60d: return60d,
          indexReturn20d,
          relativeReturn20d,
          maxDrawdown20d: drawdown20d,
          outperformLabel: relativeReturn20d > 0,
          positiveReturnLabel: return20d > 0
        },
        { upsert: true, returnDocument: 'after' }
      );
      saved++;
    }
  }

  return { symbols: symbols.length, saved };
}

export async function runQuantBacktest(options: PipelineOptions = {}) {
  const FeatureSnapshot = model('FeatureSnapshot');
  const TrainingLabel = model('TrainingLabel');
  const BacktestResult = model('BacktestResult');
  const symbols = selectedSymbols(options).filter(symbol => symbol !== 'XU100.IS');
  let saved = 0;
  let hits = 0;

  for (const symbol of symbols) {
    const labels = await TrainingLabel.find({ symbol, horizon: 20 }).lean();
    const labelMap = new Map(labels.map((label: any) => [label.date, label]));
    const snapshots = await FeatureSnapshot.find({ symbol }).lean();

    for (const snapshot of snapshots) {
      const label = labelMap.get(snapshot.date);
      if (!label) continue;

      const activeSignal = ['GUCLU_AL', 'KADEMELI_AL'].includes(snapshot.decision);
      const hit = activeSignal ? label.relativeReturn20d > 0 : label.relativeReturn20d <= 0;
      if (hit) hits++;

      await BacktestResult.findOneAndUpdate(
        { symbol, date: snapshot.date, modelVersion: snapshot.modelVersion, horizon: 20 },
        {
          symbol,
          date: snapshot.date,
          modelVersion: snapshot.modelVersion,
          horizon: 20,
          decision: snapshot.decision,
          probability: snapshot.probability,
          opportunityScore: snapshot.opportunityScore,
          riskScore: snapshot.riskScore,
          forwardReturn20d: label.forwardReturn20d,
          relativeReturn20d: label.relativeReturn20d,
          maxDrawdown20d: label.maxDrawdown20d,
          hit
        },
        { upsert: true, returnDocument: 'after' }
      );
      saved++;
    }
  }

  return { symbols: symbols.length, saved, hitRate: saved > 0 ? round((hits / saved) * 100, 2) : 0 };
}

export async function getModelDataReadiness(options: PipelineOptions = {}) {
  const symbols = selectedSymbols(options).filter(symbol => symbol !== 'XU100.IS');
  const DailyBar = model('DailyBar');
  const FeatureSnapshot = model('FeatureSnapshot');
  const TrainingLabel = model('TrainingLabel');
  const BacktestResult = model('BacktestResult');
  const MacroSeries = model('MacroSeries');
  const NewsArticle = model('NewsArticle');

  const required = {
    dailyBars: 140,
    featureSnapshots: 120,
    trainingLabels: 100,
    backtestRows: 100
  };

  const symbolReadiness = [];
  for (const symbol of symbols) {
    const [bars, latestBar, features, labels, backtests, recentNews] = await Promise.all([
      DailyBar.countDocuments({ symbol }),
      DailyBar.findOne({ symbol }).sort({ date: -1 }),
      FeatureSnapshot.countDocuments({ symbol }),
      TrainingLabel.countDocuments({ symbol, horizon: 20 }),
      BacktestResult.countDocuments({ symbol }),
      NewsArticle.countDocuments({ symbol })
    ]);

    const latestFeature = await FeatureSnapshot.findOne({ symbol }).sort({ date: -1 });
    const latestLabel = await TrainingLabel.findOne({ symbol, horizon: 20 }).sort({ date: -1 });
    const latestBacktest = await BacktestResult.findOne({ symbol }).sort({ date: -1 });

    const hasBars = bars >= required.dailyBars;
    const hasFeatures = features >= required.featureSnapshots;
    const hasLabels = labels >= required.trainingLabels;
    const hasBacktests = backtests >= required.backtestRows;

    symbolReadiness.push({
      symbol,
      bars: { actual: bars, required: required.dailyBars, ready: hasBars, latestDate: latestBar?.date || null },
      features: { actual: features, required: required.featureSnapshots, ready: hasFeatures, latestDate: latestFeature?.date || null },
      labels20d: { actual: labels, required: required.trainingLabels, ready: hasLabels, latestDate: latestLabel?.date || null },
      backtest20d: { actual: backtests, required: required.backtestRows, ready: hasBacktests, latestDate: latestBacktest?.date || null },
      newsEvents: { counted: recentNews },
      ready: hasBars && hasFeatures && hasLabels && hasBacktests
    });
  }

  const latestMacroSources = await Promise.all(DEFAULT_MACRO_SYMBOLS.map(symbol =>
    MacroSeries.findOne({ source: 'yahoo', code: symbol }).sort({ date: -1 }).lean()
  ));

  const evdsSeries = (process.env.TCMB_EVDS_SERIES || '').split(',').map(s => s.trim()).filter(Boolean);
  const macroSeriesStatus = [];
  if (evdsSeries.length > 0) {
    for (const code of evdsSeries) {
      const latest = await MacroSeries.findOne({ source: 'tcmb_evds', code }).sort({ date: -1 }).lean();
      macroSeriesStatus.push({ source: 'tcmb_evds', code, hasData: Boolean(latest), latestDate: latest?.date || null });
    }
  }

  const allYahooMacroCodes = latestMacroSources.map(item => {
    const code = item?.code || 'unknown';
    return {
      source: 'yahoo',
      code,
      hasData: Boolean(item),
      latestDate: item?.date || null
    };
  });

  const readySymbols = symbolReadiness.filter(item => item.ready).map(item => item.symbol);

  return {
    summary: {
      totalSymbols: symbols.length,
      readySymbols: readySymbols.length,
      readinessPercent: symbols.length > 0 ? round((readySymbols.length / symbols.length) * 100, 2) : 0,
      readySymbolList: readySymbols,
      hasYahooMacro: latestMacroSources.some(item => item),
      hasTcmbMacroSeries: macroSeriesStatus.some(item => item.hasData),
      required
    },
    symbols: symbolReadiness,
    macro: {
      yahoo: allYahooMacroCodes,
      tcmbEvds: {
        apiKeyConfigured: Boolean(process.env.TCMB_EVDS_API_KEY),
        requestedSeriesCount: evdsSeries.length,
        series: macroSeriesStatus
      }
    }
  };
}

export async function scoreNewsEvents(options: PipelineOptions = {}) {
  const NewsArticle = model('NewsArticle');
  const NewsEventScore = model('NewsEventScore');
  const limit = options.limit || 250;
  const articles = await NewsArticle.find({}).sort({ providerPublishTime: -1 }).limit(limit).lean();
  let saved = 0;

  for (const article of articles) {
    const text = `${article.title || ''} ${article.content || ''}`;
    const classification = classifyEvent(text);
    await NewsEventScore.findOneAndUpdate(
      { articleUuid: article.uuid },
      {
        articleUuid: article.uuid,
        symbol: article.symbol,
        symbols: article.symbols || [],
        publishedAt: article.providerPublishTime,
        title: article.title,
        source: article.publisher || 'unknown',
        ...classification
      },
      { upsert: true, returnDocument: 'after' }
    );
    saved++;
  }

  return { scanned: articles.length, saved };
}

export async function runModelDataPipeline(options: PipelineOptions = {}) {
  const years = options.years || 5;
  const limit = options.limit;
  const symbols = options.symbols;
  const startedAt = new Date();

  const dailyBars = await backfillDailyBars({ years, limit, symbols });
  const macro = await syncMacroSeries({ years });
  const features = await buildFeatureSnapshots({ limit, symbols });
  const labels = await generateTrainingLabels({ limit, symbols });
  const backtest = await runQuantBacktest({ limit, symbols });
  const newsEvents = await scoreNewsEvents({ limit: 250 });

  return {
    startedAt,
    finishedAt: new Date(),
    dailyBars,
    macro,
    features,
    labels,
    backtest,
    newsEvents
  };
}

export async function getModelDataStatus() {
  const names = ['DailyBar', 'FeatureSnapshot', 'TrainingLabel', 'BacktestResult', 'MacroSeries', 'NewsEventScore'];
  const collections: Record<string, any> = {};
  for (const name of names) {
    const Model = model(name);
    const [count, latest] = await Promise.all([
      Model.countDocuments({}),
      Model.findOne({}).sort({ date: -1, createdAt: -1 }).lean()
    ]);
    collections[name] = {
      count,
      latestDate: latest?.date || latest?.publishedAt || latest?.createdAt || null
    };
  }
  return collections;
}
