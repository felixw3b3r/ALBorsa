// Triggering reload
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import {
  downloadFinancialReportAttachments,
  downloadFinancialReportAttachmentsBySymbol,
  ensureDisclosuresLoaded,
  fetchFinancialReportAttachments,
  fetchFinancialReportsBySymbol,
  getCachedDisclosures,
  getDisclosuresByStock,
  getLastFetchTime,
  syncFinancialReportAttachmentsBySymbol
} from './services/kapService';
import { updateBist100Analysis, getBist100Analysis, updateNasdaq100Analysis, getNasdaq100Analysis } from './services/analysisService';
import {
  backfillDailyBars,
  buildFeatureSnapshots,
  generateTrainingLabels,
  getModelDataReadiness,
  getModelDataStatus,
  runModelDataPipeline,
  runQuantBacktest,
  scoreNewsEvents,
  syncMacroSeries
} from './services/modelDataPipeline';

// ... rest of imports
import apiRouter from './routes/api';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  const message = '[AUTH] JWT_SECRET tanimli degil.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${message} Production ortaminda guvenli JWT_SECRET zorunludur.`);
  }
  console.warn(`${message} Gelistirme ortami icin gecici secret kullaniliyor.`);
}
const AUTH_SECRET = JWT_SECRET || 'dev_only_jwt_secret_change_me';

let genAI: any = null;

async function getGeminiClient() {
  if (!genAI) {
    const { GoogleGenAI } = await import('@google/genai');
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
  }
  return genAI;
}

async function translateToTurkish(text: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy') return text;
  if (!text || text.length < 5) return text;

  try {
    const prompt = `Sen profesyonel bir finans ve borsa editörüsün. Aşağıdaki İngilizce finans haberini borsa terminolojisine uygun, akıcı bir Türkçeye yerelleştir. Sadece çeviriyi döndür, yorum yapma:\n\n${text}`;

    // Projedeki mevcut SDK kullanımına sadık kalıyoruz
    const client = await getGeminiClient();
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const resultText = (result.text as any) || '';
    return resultText.trim();
  } catch (error: any) {
    console.warn(`   [!] Çeviri başarısız (${error.message?.slice(0, 100)}), orijinal metin döndürülüyor...`);
    return text;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🛡️  KAYNAK KORUMA KATMANI
// Proje başlatılınca Node.js'in sistem kaynaklarını tüketmesini
// önleyen güvenlik mekanizmaları.
// ═══════════════════════════════════════════════════════════════

// 1. Bellek Baskısı İzleyici — Heap %85'i aşınca uyar, %95'i aşınca çık
function startMemoryWatchdog() {
  const CHECK_INTERVAL = 15000; // 15 saniyede bir kontrol
  setInterval(() => {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssM = Math.round(used.rss / 1024 / 1024);
    const MAX_HEAP_MB = 1536; // NODE_OPTIONS'daki max-old-space-size
    const pct = (heapUsedMB / MAX_HEAP_MB) * 100;

    if (pct > 90) {
      console.error(`🚨 [MEM] Heap kritik seviyede: ${heapUsedMB}/${MAX_HEAP_MB} MB (${pct.toFixed(1)}%) — Güvenli çıkış yapılıyor...`);
      process.exit(1); // Node.js temiz kapanır, masaüstü çökmez
    } else if (pct > 80) {
      console.warn(`⚠️  [MEM] Heap yüksek: ${heapUsedMB}/${MAX_HEAP_MB} MB (${pct.toFixed(1)}%) | RSS: ${rssM} MB`);
    } else {
      console.log(`💾 [MEM] Heap: ${heapUsedMB}/${MAX_HEAP_MB} MB (${pct.toFixed(1)}%) | RSS: ${rssM} MB`);
    }
  }, CHECK_INTERVAL);
}
startMemoryWatchdog();

// 2. Yakalanmamış Hata / OOM Koruması
process.on('uncaughtException', (err) => {
  console.error('🔴 [UNCAUGHT]', err.message);
  if (err.message?.includes('out of memory') || (err as any).code === 'ERR_OUT_OF_MEMORY') {
    console.error('💥 OOM tespit edildi — güvenli çıkış');
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason: any) => {
  console.error('🔴 [UNHANDLED REJECTION]', reason?.message || reason);
});

// 3. Yahoo Finance Eşzamanlılık Sınırı — Maksimum 3 paralel ağır çağrı
// (Bu olmadan market-summary 14 eşzamanlı chart() çağrısı açabiliyordu)
let _yahooActiveRequests = 0;
const parsedYahooMaxConcurrent = Number(process.env.YAHOO_MAX_CONCURRENT || 3);
const YAHOO_MAX_CONCURRENT = Number.isFinite(parsedYahooMaxConcurrent)
  ? Math.max(1, Math.min(5, Math.floor(parsedYahooMaxConcurrent)))
  : 3;
const _yahooQueue: Array<() => void> = [];

function yahooSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (_yahooActiveRequests < YAHOO_MAX_CONCURRENT) {
        _yahooActiveRequests++;
        resolve(() => {
          _yahooActiveRequests--;
          if (_yahooQueue.length > 0) _yahooQueue.shift()!();
        });
      } else {
        _yahooQueue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

// Wrapper: Tüm ağır Yahoo Finance çağrıları bu üzerinden geçmeli
export async function withYahooSlot<T>(fn: () => Promise<T>): Promise<T> {
  const release = await yahooSlot();
  let finished = false;

  const timeoutId = setTimeout(() => {
    if (!finished) {
      finished = true;
      console.warn("⚠️ [withYahooSlot] İstek 15 saniyede tamamlanamadı, slot zorla serbest bırakılıyor.");
      release();
    }
  }, 15000);

  try {
    return await fn();
  } finally {
    if (!finished) {
      finished = true;
      clearTimeout(timeoutId);
      release();
    }
  }
}

// ═══════════════════════════════════════════════════════════════

const app = express();
const PORT = process.env.PORT || 5000;

// Redis Client Initialization
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  try {
    // await redisClient.connect(); // Bağlantıyı opsiyonel bırakalım, hata vermesin
    console.log('📡 Redis client initialized (connection optional)');
  } catch (err) {
    console.log('Redis connection skipped');
  }
})();

// Middleware (Her şeyden ÖNCE gelmeli!)
app.use(cors());
app.use(express.json({ limit: '512kb' })); // İstek boyutu sınırı

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api', apiRouter); // Yeni eklenen teknik analiz rotası

// Global İstek Timeout Middleware (25 saniye — hung request birikmesini önler)
app.use((req: any, res: any, next: any) => {
  res.setTimeout(25000, () => {
    console.warn(`⏱️ [TIMEOUT] ${req.method} ${req.path} — 25s aşıldı`);
    if (!res.headersSent) res.status(503).json({ error: 'İstek zaman aşımına uğradı' });
  });
  next();
});


// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bistai';
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected successfully');
    // Eski çakışan index'i temizle (E11000 hatasını çözmek için)
    if (process.env.CLEANUP_LEGACY_PORTFOLIO_INDEX === 'true') {
      try {
        const db = mongoose.connection.db;
        if (db) {
          await db.collection('portfolios').dropIndex('name_1');
          console.log('[MONGO] Legacy "name_1" portfolio index temizlendi.');
        }
      } catch (e: any) {
        console.warn('[MONGO] Legacy portfolio index temizleme atlandi:', e?.message || e);
      }
    }
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));

import yahooFinance from 'yahoo-finance2';
// yahoo-finance2 v3 requires initialization with `new YahooFinance()`
export const yf = new (yahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

const EXCHANGE_RATE_SYMBOLS = ['USDTRY=X', 'EURTRY=X', 'GBPTRY=X'];
const EXCHANGE_RATE_NAMES: Record<string, string> = {
  USD: 'Amerikan Dolari',
  EUR: 'Euro',
  GBP: 'Ingiliz Sterlini'
};
let BIST_SYMBOL_SET = new Set<string>();

function normalizeSymbol(value: string | undefined | null): string {
  return (value || '').toString().trim().toUpperCase();
}

function isBistPortfolioSymbol(symbol: string | undefined | null): boolean {
  const normalized = normalizeSymbol(symbol);
  return BIST_SYMBOL_SET.has(normalized) || normalized.endsWith('.IS');
}

function toYahooPortfolioSymbol(symbol: string | undefined | null): string {
  const normalized = normalizeSymbol(symbol);
  if (normalized.endsWith('.IS')) return normalized;
  return isBistPortfolioSymbol(normalized) ? `${normalized}.IS` : normalized;
}

function isForeignPortfolioSymbol(yahooSymbol: string): boolean {
  const normalized = normalizeSymbol(yahooSymbol);
  return normalized !== '' && !normalized.endsWith('.IS') && !normalized.endsWith('TRY=X');
}

function portfolioCostInTry(item: any, yahooSymbol: string, usdRate: number): number {
  const cost = Number(item?.cost || 0);
  return isForeignPortfolioSymbol(yahooSymbol) ? cost * usdRate : cost;
}

function currencyCodeFromYahooSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const match = normalized.match(/^([A-Z]{3})TRY=X$/);
  return match ? match[1] : normalized.slice(0, 3);
}

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

// User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Auth Middleware
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Yetkisiz erişim. Lütfen giriş yapın.' });

  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Geçersiz token.' });
  }
};

// Portföydeki tüm varlıkların fiyatlarını Yahoo Finance'den çek
app.get('/api/stocks', authMiddleware, async (req, res) => {
  const t0 = Date.now();
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      return res.json({ success: true, result: [] });
    }

    const rawSymbols = symbolsQuery.split(',');
    const yahooSymbols = rawSymbols.map(s => toYahooPortfolioSymbol(s)).filter(Boolean);
    if (yahooSymbols.length === 0) {
      return res.json({ success: true, result: [] });
    }

    const quotes: any = await withYahooSlot(() => (yf as any).quote(yahooSymbols));
    const result = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
      code: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice || q.price || q.bid || q.ask || 0,
      lastprice: q.regularMarketPrice || q.price || 0,
      rate: q.regularMarketChangePercent || 0,
      currency: q.currency,
      updatedAt: new Date()
    }));

    const elapsed = Date.now() - t0;
    console.log(`\n┌─────────────────────────────────────────────────┐`);
    console.log(`│  📈  YAHOO FİNANCE — Batch Hisse Fiyatları      │`);
    console.log(`│  ⏱️  ${elapsed}ms  |  ${result.length} sembol                       │`);
    console.log(`├──────────────┬──────────────┬──────────────────────┤`);
    console.log(`│ Sembol       │ Fiyat        │ Değişim              │`);
    console.log(`├──────────────┼──────────────┼──────────────────────┤`);
    result.forEach((r: any) => {
      const sym = r.code.padEnd(12);
      const price = (r.currency === 'USD' ? `$${r.price.toFixed(2)}` : `₺${r.price.toFixed(2)}`).padEnd(12);
      const change = r.rate >= 0 ? `▲ +${r.rate.toFixed(2)}%` : `▼ ${r.rate.toFixed(2)}%`;
      console.log(`│ ${sym} │ ${price} │ ${change.padEnd(20)} │`);
    });
    console.log(`└──────────────┴──────────────┴──────────────────────┘\n`);

    res.json({ success: true, result });
  } catch (error: any) {
    console.error(`\n❌ [YAHOO/stocks] HATA: ${error.message}\n`);
    res.status(500).json({ success: false, message: 'Fiyatlar alınamadı' });
  }
});

app.get('/api/yahoo', authMiddleware, async (req, res) => {
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      return res.status(400).json({ success: false, message: 'Lütfen sembolleri virgülle ayırarak belirtin (Örn: ?symbols=AAPL,TSLA,THYAO.IS)' });
    }

    const symbols = symbolsQuery.split(',').map(s => s.trim().toUpperCase());
    console.log(`📈 Fetching Yahoo Finance data for: ${symbols.join(', ')}`);

    // Yahoo Finance API'sinden çoklu fiyat sorgusu
    const quotes: any = await (yf as any).quote(symbols);
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    // Gelen veriyi frontend'in daha kolay okuyabileceği sade bir formata çevirelim
    const result = quotesArray.map((q: any) => ({
      code: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice || q.price || 0,
      changePercent: q.regularMarketChangePercent,
      currency: q.currency
    }));

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Yahoo Finance API Error:', error.message);
    res.status(500).json({ success: false, message: 'Yahoo Finance verisi alınamadı', error: error.message });
  }
});

// Geçmişe dönük fiyat çek (Maliyet hesaplama için)
app.get('/api/historical', authMiddleware, async (req, res) => {
  try {
    const { symbol, date, market } = req.query;
    if (!symbol || !date) {
      return res.status(400).json({ success: false, message: 'Sembol ve tarih gerekli' });
    }

    let yahooSymbol = (symbol as string).toUpperCase();

    // Market bazlı sembol formatlama
    if (market === "BIST 100" && !yahooSymbol.includes('.')) {
      yahooSymbol = `${yahooSymbol}.IS`;
    }
    // NASDAQ ise olduğu gibi bırak (AAPL, NVDA vb.)

    console.log(`\n┌────────────────────────────────────────────────┐`);
    console.log(`│  📜  GEÇMİŞ FİYAT SORGUSU                     │`);
    console.log(`│  Sembol : ${yahooSymbol.padEnd(36)}│`);
    console.log(`│  Tarih  : ${(date as string).padEnd(36)}│`);
    console.log(`│  Market : ${((market as string) || '-').padEnd(36)}│`);
    console.log(`└────────────────────────────────────────────────┘`);

    const queryDate = new Date(date as string);
    queryDate.setHours(23, 59, 59, 999);

    const today = new Date();
    const isUsdStock = !yahooSymbol.endsWith('.IS') && !yahooSymbol.endsWith('TRY=X');

    // Eğer sorgulanan tarih bugün veya gelecekteyse, doğrudan güncel fiyatı dön
    if (new Date(date as string) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      try {
        const quote: any = await (yf as any).quote(yahooSymbol);
        let price = quote.regularMarketPrice || quote.price;
        if (isUsdStock && price) {
          let usdRate = 32.5;
          try {
            const usdQuote: any = await (yf as any).quote('USDTRY=X');
            usdRate = usdQuote.regularMarketPrice || usdQuote.price || 32.5;
          } catch (e) { usdRate = 32.5; }
          price = price * usdRate;
        }
        return res.json({ success: true, price: price, date: new Date(), isLive: true });
      } catch (e) {
        // Quote başarısız olursa historical'a devam et
      }
    }

    const fromDate = new Date(queryDate);
    fromDate.setDate(fromDate.getDate() - 10); // 10 günlük pencere (Sizin tercihiniz, ideal süre)

    const toDate = new Date(queryDate);
    toDate.setDate(toDate.getDate() + 2);

    // Fetch USDTRY rate for historical date if it is USD stock
    let usdRateOnDate = 32.5;
    if (isUsdStock) {
      try {
        const usdChartRes: any = await (yf as any).chart('USDTRY=X', {
          period1: fromDate,
          period2: toDate,
          interval: '1d'
        }, { validateResult: false });
        const usdResults = usdChartRes.quotes || [];
        if (usdResults.length > 0) {
          const validUsdQuotes = usdResults.filter((r: any) => r.close != null || r.open != null);
          const validUsdResults = validUsdQuotes.filter((r: any) => {
            const rowDate = new Date(r.date);
            return rowDate.getTime() <= queryDate.getTime();
          }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const usdDayData = validUsdResults[0] || validUsdQuotes[validUsdQuotes.length - 1];
          if (usdDayData) {
            usdRateOnDate = usdDayData.close || usdDayData.open || usdDayData.high || usdDayData.low || 32.5;
          }
        }
      } catch (usdErr: any) {
        console.error('USDTRY historical fetch error inside historical endpoint:', usdErr.message);
        try {
          const usdQuote: any = await (yf as any).quote('USDTRY=X');
          usdRateOnDate = usdQuote.regularMarketPrice || usdQuote.price || 32.5;
        } catch (e) {
          usdRateOnDate = 32.5;
        }
      }
    }

    // KRİTİK: Historical yerine Chart + validateResult:false kullanmaya devam ediyoruz 
    // Bu sayede hafta sonu boşlukları olsa bile kütüphane hata fırlatmıyor.
    const chartRes: any = await (yf as any).chart(yahooSymbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d'
    }, { validateResult: false });

    const results = chartRes.quotes || [];

    if (results && results.length > 0) {
      // Boş olmayan verileri filtrele
      const validQuotes = results.filter((r: any) => r.close != null || r.open != null);

      // En yakın günü seç
      const validResults = validQuotes.filter((r: any) => {
        const rowDate = new Date(r.date);
        return rowDate.getTime() <= queryDate.getTime();
      }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const dayData = validResults[0] || validQuotes[validQuotes.length - 1];

      if (!dayData) {
        console.error(`❌ No valid day data found for ${yahooSymbol}`);
        return res.status(404).json({ success: false, message: 'Veri bulunamadı' });
      }

      // Fiyat Seçici
      const rawPrice = dayData.close || dayData.open || dayData.high || dayData.low;

      if (!rawPrice) {
        return res.status(404).json({ success: false, message: 'Fiyat seçilemedi' });
      }

      let finalPrice = rawPrice;
      if (isUsdStock) {
        finalPrice = finalPrice * usdRateOnDate;
      }

      console.log(`  ✅ Bulunan Fiyat (TL): ${finalPrice.toFixed(4)} (Orijinal: ${rawPrice.toFixed(4)} USD, ${new Date(dayData.date).toLocaleDateString('tr-TR')} - Kur: ${usdRateOnDate})\n`);
      res.json({
        success: true,
        price: finalPrice,
        rawPrice: rawPrice,
        usdRate: usdRateOnDate,
        date: dayData.date,
        currency: isUsdStock ? 'USD' : 'TRY'
      });
    } else {
      res.status(404).json({ success: false, message: 'O tarih için veri bulunamadı. (Borsa kapalı olabilir)' });
    }
  } catch (error: any) {
    console.error('Historical Data Error:', error.message);
    res.status(500).json({ success: false, message: 'Geçmiş veri alınamadı', error: error.message });
  }
});

// Yahoo Finance'den döviz kurlarını çek (Gelişmiş Fallback Sistemi ile)
app.get('/api/exchange-rate', authMiddleware, async (req, res) => {
  const t0 = Date.now();
  try {
    const symbols = EXCHANGE_RATE_SYMBOLS;

    // Anlık veri çek
    const quotes: any = await withYahooSlot(() => (yf as any).quote(symbols));
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    const result = quotesArray.map((q: any) => {
      const code = currencyCodeFromYahooSymbol(q.symbol);
      // Fiyat için birden fazla kaynağı dene (Yahoo bazen birini boş dönerse diğeri kurtarır)
      const price = q.regularMarketPrice || q.price || q.bid || q.ask || q.regularMarketPreviousClose || 0;

      return {
        name: EXCHANGE_RATE_NAMES[code] || code,
        code: code,
        buying: price,
        selling: price,
        updatedAt: new Date()
      };
    });

    // Eğer hepsi 0 ise bir de chart ile dene (Son Çare)
    const allZero = result.every(r => r.buying === 0);
    if (allZero) {
      console.log('⚠️ Quote prices were 0, trying fallback with chart API...');
      // Burada gerekirse chart API eklenebilir ama yukarıdaki fallbackler genelde yeterlidir.
    }

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Yahoo Exchange Rate Error:', error.message);
    res.status(500).json({ success: false, message: 'Kurlar alınamadı', error: error.message });
  }
});

// Binance API'den kripto fiyatlarını çek (Çok daha yüksek limitli ve ücretsiz)
app.get('/api/crypto', authMiddleware, async (req, res) => {
  try {
    console.log('🌐 Fetching BTC price from Binance API...');
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
      timeout: 5000
    });

    if (response.data && response.data.price) {
      // Frontend'in beklediği veri yapısını taklit ediyoruz (kod değişikliği gerekmesin diye)
      res.json({
        success: true,
        result: [
          {
            code: "BTC",
            name: "Bitcoin",
            price: response.data.price
          }
        ]
      });
    } else {
      res.status(400).json({ success: false, message: 'Binance verisi okunamadı' });
    }
  } catch (error: any) {
    console.error('Binance API Error:', error.message);
    res.status(500).json({ success: false, message: 'Kripto verisi alınamadı', error: error.message });
  }
});

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true, default: 0 },
  cost: { type: Number, required: true, default: 0 },
  purchaseDate: { type: Date, default: Date.now },
  color: { type: String, default: '#8b00e8' },
}, { timestamps: true });

// Market Data Schema (15dk'lık veriler için)
const marketDataSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  price: { type: Number, required: true },
  timestamp: { type: Date, required: true },
}, { timestamps: true });

// Günlük Teknik Analiz Şeması
const dailyAnalysisSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD formatında
  results: { type: Array, required: true },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// DeepSeek Analiz Şeması (Kalıcı ve Tarihsel)
const deepseekResultSchema = new mongoose.Schema({
  symbol: { type: String, required: true }, // Artık unique değil, her analiz kaydedilecek
  price: { type: Number, required: true },
  karar: { type: String, required: true },
  olasilik_yuzdesi: { type: Number, required: true },
  neden: { type: String, required: true },
  stop_loss: { type: Number, required: true },
  take_profit: { type: Number, required: true },
  indicators: {
    adx: Number,
    vwap_sapma: Number,
    hacim_orani: Number,
    rsi_anlik: Number,
    rsi_onceki: Number,
    atr: Number
  },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// Sorgu performansını artırmak için index'ler
deepseekResultSchema.index({ symbol: 1, timestamp: -1 });

const DailyAnalysis = mongoose.model('DailyAnalysis', dailyAnalysisSchema);
const DeepSeekResult = mongoose.model('DeepSeekResult', deepseekResultSchema);

// Aynı sembol için aynı dakikada mükerrer kayıt olmasın
marketDataSchema.index({ symbol: 1, timestamp: 1 }, { unique: true });

const MarketData = mongoose.model('MarketData', marketDataSchema);
const Portfolio = mongoose.model('Portfolio', portfolioSchema);

// News Article Schema (Haberlerin içeriğiyle kaydedilmesi için)
const newsSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  symbols: [{ type: String }],
  title: { type: String, required: true },
  publisher: { type: String },
  link: { type: String },
  providerPublishTime: { type: Date },
  thumbnail: { type: String },
  content: { type: String }, // Tam metin
}, { timestamps: true });
newsSchema.index({ symbol: 1, providerPublishTime: -1 });
newsSchema.index({ symbols: 1, providerPublishTime: -1 });
const NewsArticle = mongoose.model('NewsArticle', newsSchema);

const kapFinancialReportSchema = new mongoose.Schema({
  disclosureIndex: { type: Number, required: true, unique: true },
  symbol: { type: String, required: true },
  stockCodes: [{ type: String }],
  companyTitle: String,
  subject: String,
  summary: String,
  disclosureClass: String,
  disclosureType: String,
  publishDate: Date,
  periodYear: Number,
  periodQuarter: Number,
  attachmentCount: { type: Number, default: 0 },
  attachments: [{
    title: String,
    fileName: String,
    url: String,
    kind: String,
    extension: String
  }],
  attachmentFetchedAt: Date,
  detailUrl: String,
  parseStatus: { type: String, default: 'pending' },
  raw: { type: Object }
}, { timestamps: true });
kapFinancialReportSchema.index({ stockCodes: 1, publishDate: -1 });
kapFinancialReportSchema.index({ symbol: 1, periodYear: -1, periodQuarter: -1 });
const KapFinancialReport = mongoose.model('KapFinancialReport', kapFinancialReportSchema);

const kapAttachmentFileSchema = new mongoose.Schema({
  disclosureIndex: { type: Number, required: true },
  attachmentUrl: { type: String, required: true },
  url: String,
  title: String,
  fileName: String,
  kind: String,
  extension: String,
  contentType: String,
  sizeBytes: Number,
  sha256: String,
  storagePath: String,
  downloadedAt: Date,
  parseStatus: { type: String, default: 'downloaded' }
}, { timestamps: true });
kapAttachmentFileSchema.index({ disclosureIndex: 1, attachmentUrl: 1 }, { unique: true });
kapAttachmentFileSchema.index({ sha256: 1 });
const KapAttachmentFile = mongoose.model('KapAttachmentFile', kapAttachmentFileSchema);

const dailyBarSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  date: { type: String, required: true },
  timestamp: { type: Date, required: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  adjustedClose: { type: Number },
  volume: { type: Number, default: 0 },
  source: { type: String, default: 'yahoo' }
}, { timestamps: true });
dailyBarSchema.index({ symbol: 1, date: 1 }, { unique: true });
dailyBarSchema.index({ date: 1 });
const DailyBar = mongoose.model('DailyBar', dailyBarSchema);

const featureSnapshotSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  date: { type: String, required: true },
  modelVersion: { type: String, required: true },
  price: { type: Number, required: true },
  volume: { type: Number, default: 0 },
  indicators: { type: Object },
  factorScores: { type: Object },
  diagnostics: { type: Object },
  quant: { type: Object },
  decision: { type: String, required: true },
  probability: { type: Number, required: true },
  opportunityScore: { type: Number, required: true },
  riskScore: { type: Number, required: true },
  regime: { type: String, required: true }
}, { timestamps: true });
featureSnapshotSchema.index({ symbol: 1, date: 1, modelVersion: 1 }, { unique: true });
featureSnapshotSchema.index({ date: 1, opportunityScore: -1 });
const FeatureSnapshot = mongoose.model('FeatureSnapshot', featureSnapshotSchema);

const trainingLabelSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  date: { type: String, required: true },
  horizon: { type: Number, required: true },
  forwardReturn5d: Number,
  forwardReturn20d: Number,
  forwardReturn60d: Number,
  indexReturn20d: Number,
  relativeReturn20d: Number,
  maxDrawdown20d: Number,
  outperformLabel: Boolean,
  positiveReturnLabel: Boolean
}, { timestamps: true });
trainingLabelSchema.index({ symbol: 1, date: 1, horizon: 1 }, { unique: true });
trainingLabelSchema.index({ date: 1, horizon: 1 });
const TrainingLabel = mongoose.model('TrainingLabel', trainingLabelSchema);

const backtestResultSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  date: { type: String, required: true },
  modelVersion: { type: String, required: true },
  horizon: { type: Number, required: true },
  decision: String,
  probability: Number,
  opportunityScore: Number,
  riskScore: Number,
  forwardReturn20d: Number,
  relativeReturn20d: Number,
  maxDrawdown20d: Number,
  hit: Boolean
}, { timestamps: true });
backtestResultSchema.index({ symbol: 1, date: 1, modelVersion: 1, horizon: 1 }, { unique: true });
backtestResultSchema.index({ modelVersion: 1, date: 1 });
const BacktestResult = mongoose.model('BacktestResult', backtestResultSchema);

const macroSeriesSchema = new mongoose.Schema({
  source: { type: String, required: true },
  code: { type: String, required: true },
  date: { type: String, required: true },
  value: { type: Number, required: true },
  raw: { type: Object }
}, { timestamps: true });
macroSeriesSchema.index({ source: 1, code: 1, date: 1 }, { unique: true });
const MacroSeries = mongoose.model('MacroSeries', macroSeriesSchema);

const newsEventScoreSchema = new mongoose.Schema({
  articleUuid: { type: String, required: true, unique: true },
  symbol: { type: String },
  symbols: [{ type: String }],
  publishedAt: Date,
  title: String,
  source: String,
  eventType: String,
  impactScore: Number,
  sentimentScore: Number
}, { timestamps: true });
newsEventScoreSchema.index({ symbol: 1, publishedAt: -1 });
newsEventScoreSchema.index({ eventType: 1, impactScore: -1 });
const NewsEventScore = mongoose.model('NewsEventScore', newsEventScoreSchema);

const aiSignalSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  market: { type: String, required: true }, // 'bist' or 'nasdaq'
  entryPrice: { type: Number, required: true },
  entryDate: { type: Date, default: Date.now },
  takeProfit: { type: Number, required: true },
  stopLoss: { type: Number, required: true },
  status: { type: String, enum: ['ACTIVE', 'TAKE_PROFIT', 'STOP_LOSS'], default: 'ACTIVE' },
  closePrice: { type: Number },
  closeDate: { type: Date },
  opportunityScore: { type: Number }
}, { timestamps: true });

aiSignalSchema.index({ symbol: 1, market: 1, status: 1 });
const AiSignal = mongoose.model('AiSignal', aiSignalSchema);

app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    let { range = '1d', interval = '15m' } = req.query as any;

    // Sembolü hazırla: Eğer nokta, şapka veya tire yoksa ve 4+ karakterse .IS ekle (Altın sembolleri hariç)
    let formattedSymbol = symbol.toUpperCase();
    const isSpecialGold = ['GRAM_ALTIN', 'CEYREK_ALTIN'].includes(formattedSymbol);

    if (!isSpecialGold && !formattedSymbol.includes('.') && !formattedSymbol.startsWith('^') && !formattedSymbol.includes('-') && formattedSymbol.length >= 4) {
      formattedSymbol = `${formattedSymbol}.IS`;
    }

    const isGlobal = formattedSymbol.startsWith('^') || formattedSymbol.includes('-') || ['GC=F', 'USDTRY=X', 'CEYREK_ALTIN', 'GRAM_ALTIN'].includes(formattedSymbol);
    let intervalVal: any = '1d';

    // Zaman aralığını hesapla (Kütüphane range desteklemiyor, period1 zorunlu)
    const period1 = new Date();
    if (!isGlobal) {
      period1.setHours(0, 0, 0, 0); // BIST için gün başından başla
    }

    // Küçük harfe çevirip kontrol et
    const r = range.toLowerCase();

    // ===== KRİPTO ERKEN ÇIKIŞ: Binance Klines API (24/7, limitsiz, 15dk hassasiyet) =====
    const cryptoMap: Record<string, string> = {
      'BTC-USD': 'BTCUSDT', 'ETH-USD': 'ETHUSDT',
      'BNB-USD': 'BNBUSDT', 'SOL-USD': 'SOLUSDT',
      'XRP-USD': 'XRPUSDT', 'DOGE-USD': 'DOGEUSDT'
    };
    const binanceSymbol = cryptoMap[formattedSymbol];

    if (binanceSymbol) {
      try {
        const binanceConfig: Record<string, { interval: string; limit: number }> = {
          '1g': { interval: '15m', limit: 96 }, '1d': { interval: '15m', limit: 96 },
          '2g': { interval: '30m', limit: 96 }, '3g': { interval: '1h', limit: 72 },
          '1h': { interval: '1h', limit: 168 }, '1w': { interval: '1h', limit: 168 },
          '1a': { interval: '2h', limit: 360 }, '1m': { interval: '2h', limit: 360 },
          '3a': { interval: '1d', limit: 90 }, '3m': { interval: '1d', limit: 90 },
          '1y': { interval: '1d', limit: 365 }, '1s': { interval: '1d', limit: 365 },
        };
        const cfg = binanceConfig[r] || { interval: '15m', limit: 96 };

        const klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${cfg.interval}&limit=${cfg.limit}`;
        const klinesRes = await axios.get(klinesUrl, { timeout: 8000 });
        const klines = klinesRes.data;
        const history: number[] = klines.map((k: any[]) => parseFloat(k[4]));
        const timestamps: number[] = klines.map((k: any[]) => k[0]);

        const tickerRes = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, { timeout: 5000 });
        const ticker = tickerRes.data;
        const price = parseFloat(ticker.lastPrice);
        const change = parseFloat(ticker.priceChange);
        const changePercent = parseFloat(ticker.priceChangePercent);
        const displayName = { 'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum', 'BNB-USD': 'BNB', 'SOL-USD': 'Solana', 'XRP-USD': 'XRP', 'DOGE-USD': 'Dogecoin' }[formattedSymbol] || formattedSymbol;

        console.log(`✅ Binance Klines: ${binanceSymbol} ${cfg.interval} × ${history.length} bars`);
        return res.json({ symbol: formattedSymbol, name: displayName, price, change, changePercent, category: 'Kripto Paralar', history, timestamps });
      } catch (binanceErr: any) {
        console.warn(`⚠️ Binance fallback for ${binanceSymbol}:`, binanceErr.message?.slice(0, 60));
      }
    }
    if (r === '1d' || r === '1g' || r === '2g' || r === '3g') {
      intervalVal = '15m';
      // Tüm varlıklar için (BIST, Global, Altın): Son 10 gün içindeki işlem yapılan günleri bulmak için geniş bir pencere açalım.
      period1.setDate(period1.getDate() - 10);
      console.log(`⏱️ Chart Range Start: ${period1.toLocaleString()} for ${formattedSymbol} (${r})`);
    } else if (r === '1w' || r === '1h') {
      intervalVal = '30m';
      period1.setDate(period1.getDate() - 9); // 7 gün + 2 gün tampon (hafta sonu koruması)
    } else if (r === '1m' || r === '1a') {
      // 1 Ay: Hassasiyeti 1d'den 1h'ye çıkararak çok daha akıcı bir grafik sağlıyoruz
      intervalVal = '1h';
      period1.setMonth(period1.getMonth() - 1);
    } else if (r === '3m' || r === '3a') {
      // 3 Ay: Hassasiyeti 1d'den 1h'ye çıkararak 2 katından fazla detay sağlıyoruz
      intervalVal = isGlobal ? '1h' : '1h'; // BIST için de 1h deniyoruz
      period1.setMonth(period1.getMonth() - 3);
    } else if (r === '1y' || r === '1s') {
      // 1 Yıl: Hassasiyeti 1wk'dan 1d'ye çıkararak 7 kat detay sağlıyoruz
      intervalVal = '1d';
      period1.setFullYear(period1.getFullYear() - 1);
    }

    // ===== ALTIN HESAPLAMALARI (GRAM/ÇEYREK) - Range ayarından sonra çalışmalı =====
    if (formattedSymbol === 'GRAM_ALTIN' || formattedSymbol === 'CEYREK_ALTIN') {
      try {
        const usdData: any = await (yf as any).quote('USDTRY=X');
        const onsData: any = await (yf as any).chart('GC=F', { period1, interval: intervalVal }, { validateResult: false });

        const usdPrice = usdData.regularMarketPrice || 32.5;
        let onsQuotes = (onsData.quotes || []).filter((q: any) => q.close != null);

        // AKILLI İŞLEM GÜNÜ FİLTRESİ (Gram/Çeyrek için de son 24/48/72 saat kesimi veya kapalı piyasa fallback)
        if ((r === '1d' || r === '1g' || r === '2g' || r === '3g') && onsQuotes.length > 0) {
          const uniqueDays = [...new Set<number>(onsQuotes.map((q: any) => {
            const d = new Date(q.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
          }))].sort((a, b) => b - a);

          let daysToKeep = 1;
          if (r === '2g') daysToKeep = 2;
          else if (r === '3g') daysToKeep = 3;

          let dayOffset = 0;
          const minBarsThreshold = 5;

          while (dayOffset < uniqueDays.length) {
            const candidateDay = uniqueDays[dayOffset];
            const barsInDay = onsQuotes.filter((q: any) => {
              const d = new Date(q.date);
              d.setHours(0, 0, 0, 0);
              return d.getTime() === candidateDay;
            }).length;

            if (barsInDay >= minBarsThreshold) {
              break;
            }
            dayOffset++;
          }

          const targetDays = uniqueDays.slice(dayOffset, dayOffset + daysToKeep);
          if (targetDays.length > 0) {
            onsQuotes = onsQuotes.filter((q: any) => {
              const d = new Date(q.date);
              d.setHours(0, 0, 0, 0);
              return targetDays.includes(d.getTime());
            });
            console.log(`📊 Gold onsQuotes filtered to ${onsQuotes.length} bars across ${targetDays.length} trading day(s)`);
          }

          if (onsQuotes.length === 0) {
            console.log(`⚠️ Gold filtering removed all bars, using all available data.`);
            onsQuotes = (onsData.quotes || []).filter((q: any) => q.close != null);
          }
        }

        const multiplier = formattedSymbol === 'GRAM_ALTIN' ? (1 / 31.1035) : (1 / 31.1035 * 1.6065);
        const history = onsQuotes.map((q: any) => q.close * multiplier * usdPrice);
        const timestamps = onsQuotes.map((q: any) => q.date);
        const currentPrice = (usdData.regularMarketPrice * (onsQuotes[onsQuotes.length - 1]?.close || 0) * multiplier);

        return res.json({
          symbol: formattedSymbol,
          name: formattedSymbol === 'GRAM_ALTIN' ? 'Gram Altın (TL)' : 'Çeyrek Altın (TL)',
          price: currentPrice,
          change: (currentPrice * (usdData.regularMarketChangePercent || 0)) / 100,
          changePercent: usdData.regularMarketChangePercent || 0,
          category: 'Altın Piyasaları',
          history,
          timestamps
        });
      } catch (err: any) {
        console.error('Gold Calculation Error:', err.message);
      }
    }

    // Dinamik Sembol ve Hassasiyet Avcısı: Yahoo bazen nazlanır
    let chart: any = null;
    let quotes: any[] = [];

    // Denenecek semboller ve hassasiyetler
    const symbolVariants = [formattedSymbol];
    if (!formattedSymbol.startsWith('^')) symbolVariants.push(`^${formattedSymbol.replace('.IS', '')}`);
    if (formattedSymbol.endsWith('.IS')) symbolVariants.push(formattedSymbol.replace('.IS', ''));

    // ÖNCELİKLİ HASSASİYET: 1G, 2G veya 3G ise önce yüksek frekans dene
    const intervalsToTry = (r === '1d' || r === '1g' || r === '2g' || r === '3g')
      ? ['15m', '5m', '2m', '1h', '1d']
      : [intervalVal, '1h', '1d'];

    // Önce en iyi sembol ve en iyi hassasiyeti dene, olmazsa kademeli düşür
    outerLoop: for (const variant of symbolVariants) {
      for (const inv of intervalsToTry) {
        try {
          // KRİTİK: v3'te doğrulamayı kapatmak için 'validateResult: false' kullanılır.
          const attempt: any = await (yf as any).chart(variant, {
            period1: period1,
            interval: inv
          }, { validateResult: false });

          const attemptQuotes = (attempt.quotes || []).filter((q: any) => q.close != null);

          if (attemptQuotes.length > 0) {
            chart = attempt;
            quotes = attemptQuotes;
            console.log(`✅ Success: ${variant} with ${inv} (${attemptQuotes.length} bars)`);
            break outerLoop;
          }
        } catch (e) {
          continue;
        }
      }
    }

    // GENEL FALLBACK: Hala veri yoksa geniş aralığı dene
    if (quotes.length === 0) {
      console.log(`⚠️ No data found for ${formattedSymbol}, trying broad fallback...`);
      const fallbackDate = new Date();
      fallbackDate.setFullYear(fallbackDate.getFullYear() - 2);

      // KRİTİK: BIST (.IS) için 1d yerine 1h kullan (1d sadece 1 quote döndürüyor)
      const fallbackIntervals = formattedSymbol.endsWith('.IS') ? ['1h', '1d'] : ['1d'];

      outerFallback: for (const variant of symbolVariants) {
        for (const fallbackInterval of fallbackIntervals) {
          try {
            const attempt = await (yf as any).chart(variant, { period1: fallbackDate, interval: fallbackInterval }, { validateResult: false });
            const attemptQuotes = (attempt.quotes || []).filter((q: any) => q.close != null);
            if (attemptQuotes.length > 0) {
              chart = attempt;
              quotes = attemptQuotes;
              console.log(`✅ Fallback success: ${variant} with ${fallbackInterval}`);
              break outerFallback;
            }
          } catch (e) { continue; }
        }
      }
    }

    // AKILLI İŞLEM GÜNÜ FİLTRESİ (1G, 2G, 3G İçin) - Kapalı Piyasa Korumalı
    // Hem BIST hem Global varlıklar için en son aktif işlem günlerini bulur.
    if ((r === '1d' || r === '1g' || r === '2g' || r === '3g') && quotes.length > 0) {
      // 1. Tüm benzersiz işlem günlerini bul, en yeniden eskiye sırala
      const uniqueDays = [...new Set<number>(quotes.map((q: any) => {
        const d = new Date(q.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }))].sort((a, b) => b - a);

      // 2. İstenen gün sayısını belirle
      let daysToKeep = 1;
      if (r === '2g') daysToKeep = 2;
      else if (r === '3g') daysToKeep = 3;

      // 3. AKILLI İŞLEM GÜNÜ BULUCU:
      //    En az 5 bar olan en son günü bul (borsa o gün en az biraz açık kalmış olmalı)
      //    Bu sayede "bugün kapalı → dünün datasını göster" mantığı çalışır.
      let dayOffset = 0;
      const minBarsThreshold = 5; // En az 5 bar (yaklaşık 75dk işlem) olan günü "geçerli" say

      while (dayOffset < uniqueDays.length) {
        const candidateDay = uniqueDays[dayOffset];
        const barsInDay = quotes.filter((q: any) => {
          const d = new Date(q.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === candidateDay;
        }).length;

        if (barsInDay >= minBarsThreshold) {
          break; // Bu gün yeterince veri var, buradan başla
        }
        dayOffset++;
      }

      // 4. Sadece hedef günlerin barlarını tut
      const targetDays = uniqueDays.slice(dayOffset, dayOffset + daysToKeep);

      if (targetDays.length > 0) {
        quotes = quotes.filter((q: any) => {
          const d = new Date(q.date);
          d.setHours(0, 0, 0, 0);
          return targetDays.includes(d.getTime());
        });
        console.log(`📊 Filtered to ${quotes.length} bars across ${targetDays.length} trading day(s) for ${formattedSymbol}`);
      }

      // 5. SON ÇARE: Hala 0 bar kaldıysa tüm verileri kullan (hiçbirini atma)
      if (quotes.length === 0) {
        console.log(`⚠️ Filtering removed all bars for ${formattedSymbol}, using all available data.`);
        quotes = (chart?.quotes || []).filter((q: any) => q.close != null);
      }
    } // 1D bloğunun sonu

    // (Eski kısıtlayıcı Global Rolling Filter kaldırıldı, Akıllı İşlem Günü filtresi artık Global'i de kapsıyor)

    // 1H (1 Hafta) FİLTRESİ: 9 günlük pencereden sadece son 7 günü tut
    if ((r === '1w' || r === '1h') && quotes.length > 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const filtered = quotes.filter((q: any) => new Date(q.date) >= sevenDaysAgo);
      if (filtered.length > 0) {
        quotes = filtered;
        console.log(`📊 1H filter: ${quotes.length} bars kept (last 7 days) for ${formattedSymbol}`);
      }
    }

    // 3A/1Y Seyreltme Filtresi kaldırıldı (User Request: 2 kat hassasiyet)

    const history = quotes.map((q: any) => q.close);
    const timestamps = quotes.map((q: any) => q.date);

    // BAŞARILI SEMBOLÜ KULLAN: Grafik hangi sembolle geldiyse fiyatı da ondan iste (BIST 100 mantığı)
    const activeSymbol = (chart && chart.meta && chart.meta.symbol) || formattedSymbol;

    let liveQuote: any = {};
    try {
      liveQuote = await (yf as any).quote(activeSymbol);
    } catch (e) {
      console.warn(`Quote fetch failed for ${activeSymbol}, using empty fallback.`);
    }

    // Kullanıcı Dostu İsimlendirme (Süper Temiz Görünüm)
    const nameMap: Record<string, string> = {
      'GC=F': 'ONS Altın',
      'USDTRY=X': 'Amerikan Doları',
      'XU100.IS': 'BIST 100',
      'XU050.IS': 'BIST 50',
      'XU030.IS': 'BIST 30'
    };

    res.json({
      symbol: activeSymbol,
      name: nameMap[activeSymbol] || liveQuote?.shortName || liveQuote?.longName || activeSymbol,
      price: liveQuote?.regularMarketPrice || liveQuote?.price || liveQuote?.bid || liveQuote?.regularMarketPreviousClose || (history.length > 0 ? history[history.length - 1] : 0),
      change: liveQuote?.regularMarketChange || 0,
      changePercent: liveQuote?.regularMarketChangePercent || 0,
      category: activeSymbol.startsWith('^') ? 'Global Endeksler' : (['GC=F', 'USDTRY=X'].includes(activeSymbol) ? 'Altın & Döviz' : 'Borsa İstanbul'),
      history,
      timestamps
    });

  } catch (error: any) {
    console.error(`Error for ${req.params.symbol}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Hisseye Özel Haberler (Yahoo Finance & DB)
app.get('/api/stocks/:symbol/news', async (req, res) => {
  try {
    const legacyYahooNewsEnabled = process.env.ENABLE_LEGACY_YAHOO_NEWS === 'true';
    const { symbol } = req.params;
    const formattedSymbol = symbol.includes('.') || symbol.startsWith('^') || symbol.includes('-')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}.IS`;

    // 1. Önce veritabanına bak (Hem .IS'li hem .IS'siz ara)
    const searchSymbols = [formattedSymbol, formattedSymbol.replace('.IS', '')];
    const dbNews = await NewsArticle.find({
      $or: [
        { symbol: { $in: searchSymbols } },
        { symbols: { $in: searchSymbols } }
      ]
    })
      .sort({ providerPublishTime: -1 })
      .limit(10);

    if (dbNews.length > 0) {
      console.log(`📰 Serving ${dbNews.length} news from DB for ${formattedSymbol}`);
      const formattedNews = dbNews.map((n: any) => ({
        id: n.uuid,
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        providerPublishTime: n.providerPublishTime,
        thumbnail: n.thumbnail,
        content: n.content, // Önceden çekilmiş içerik
        type: 'ARTICLE'
      }));
      return res.json(formattedNews);
    }

    // 2. Eğer veritabanında yoksa fallback (canlı çekim, ama içeriksiz)
    if (!legacyYahooNewsEnabled) {
      return res.json([]);
    }

    const liveQuote: any = await (yf as any).quote(formattedSymbol);
    const searchQuery = liveQuote.shortName || liveQuote.longName || formattedSymbol;

    console.log(`📰 Fetching LIVE news fallback for ${searchQuery} (${formattedSymbol})`);

    const result: any = await (yf as any).search(searchQuery, { newsCount: 10 });

    const news = (result.news || []).map((item: any) => ({
      id: item.uuid,
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      providerPublishTime: item.providerPublishTime,
      thumbnail: item.thumbnail?.resolutions?.[0]?.url || 'https://images.unsplash.com/photo-1611974717482-58a2527e7446?auto=format&fit=crop&q=80&w=300&h=200',
      type: item.type
    }));

    res.json(news);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Haber İçeriğini Çek (Basit Scraper)
app.get('/api/news/content', async (req, res) => {
  try {
    const { url } = req.query as { url: string };
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await response.text();

    // Improved Article Extraction
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
    const targetHtml = articleMatch ? articleMatch[1] : html;

    const paragraphs = targetHtml.match(/<p[^>]*>(.*?)<\/p>/g) || [];
    const content = paragraphs
      .map(p => p.replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim())
      .filter(p => p.length > 50 && !p.includes('Oops, something went wrong'))
      .slice(0, 20)
      .join('\n\n');

    res.json({ content: content || 'Haber içeriği şu an çekilemiyor veya uygun formatta değil.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// KAP Bildirimlerini Çek

app.get('/api/stocks/:symbol/kap', async (req, res) => {
  const start = Date.now();
  try {
    const { symbol } = req.params;
    const upper = symbol.toUpperCase().replace('.IS', '');
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📡 [KAP] GET /api/stocks/${upper}/kap`);
    console.log(`   Parametre: symbol="${symbol}" → normalized="${upper}"`);

    const loadStart = Date.now();
    await ensureDisclosuresLoaded();
    console.log(`   ensureDisclosuresLoaded: ${Date.now() - loadStart}ms`);

    const allDisclosures = getCachedDisclosures();
    const disclosures = getDisclosuresByStock(upper);

    const elapsed = Date.now() - start;
    console.log(`   ✅ Yanit: ${disclosures.length} bildirim (toplam cache: ${allDisclosures.length})`);
    console.log(`   ⏱  Toplam: ${elapsed}ms`);
    console.log(`═══════════════════════════════════════════\n`);

    res.json({
      success: true,
      symbol: upper,
      totalCached: allDisclosures.length,
      data: disclosures.map(d => ({
        index: d.disclosureIndex,
        title: d.summary,
        subject: d.subject,
        company: d.kapTitle,
        date: d.publishDate,
        type: d.disclosureType,
        class: d.disclosureClass,
        stockCodes: d.stockCodes,
        hasAttachments: d.attachmentCount > 0,
        url: `https://www.kap.org.tr/tr/bildirim/${d.disclosureIndex}`
      })),
      debug: {
        elapsedMs: elapsed,
        cacheAge: getLastFetchTime() > 0 ? Math.round((Date.now() - getLastFetchTime()) / 1000) + 's' : 'yok',
        matchingCount: disclosures.length,
        allStockCodes: [...new Set(allDisclosures.map(d => d.stockCodes).filter(Boolean))],
        fetchedAt: new Date(getLastFetchTime()).toLocaleString('tr-TR')
      }
    });
  } catch (error: any) {
    const elapsed = Date.now() - start;
    console.error(`❌ [KAP] Hata (${elapsed}ms): ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: { elapsedMs: elapsed }
    });
  }
});

// Endeks Bileşenlerini Getir (Batch Fetching)
// Endeks Bileşenleri (BIST 100 - Tam Liste ve Sıralı)
app.get('/api/kap/financial-reports/:symbol', async (req, res) => {
  const start = Date.now();
  try {
    const { symbol } = req.params;
    const upper = symbol.toUpperCase().replace('.IS', '');
    const refresh = req.query.refresh === 'true';
    const pageSize = Number(req.query.pageSize || 100);
    const maxPages = Number(req.query.maxPages || 3);

    const reports = await fetchFinancialReportsBySymbol(upper, {
      refresh,
      pageSize: Number.isFinite(pageSize) ? pageSize : 100,
      maxPages: Number.isFinite(maxPages) ? maxPages : 3
    });

    res.json({
      success: true,
      symbol: upper,
      count: reports.length,
      elapsedMs: Date.now() - start,
      source: refresh ? 'kap-refresh' : 'mongo-cache-or-kap',
      data: reports.map((report: any) => ({
        disclosureIndex: report.disclosureIndex,
        companyTitle: report.companyTitle,
        subject: report.subject,
        summary: report.summary,
        publishDate: report.publishDate,
        periodYear: report.periodYear,
        periodQuarter: report.periodQuarter,
        attachmentCount: report.attachmentCount,
        parseStatus: report.parseStatus || 'pending',
        detailUrl: report.detailUrl,
        stockCodes: report.stockCodes
      }))
    });
  } catch (error: any) {
    console.error('[KAP] Financial report fetch error:', error.message);
    res.status(500).json({
      success: false,
      message: 'KAP finansal raporlari cekilemedi.',
      error: error.message,
      elapsedMs: Date.now() - start
    });
  }
});

app.get('/api/kap/financial-reports/:symbol/sync-attachments', async (req, res) => {
  const start = Date.now();
  try {
    const { symbol } = req.params;
    const limit = Number(req.query.limit || 10);
    const refresh = req.query.refresh === 'true';
    const result = await syncFinancialReportAttachmentsBySymbol(symbol, {
      limit: Number.isFinite(limit) ? limit : 10,
      refresh
    });

    res.json({
      success: true,
      elapsedMs: Date.now() - start,
      result
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'KAP finansal rapor ekleri senkronize edilemedi.',
      error: error.message,
      elapsedMs: Date.now() - start
    });
  }
});

app.get('/api/kap/financial-reports/:symbol/:disclosureIndex/attachments', async (req, res) => {
  const start = Date.now();
  try {
    const disclosureIndex = Number(req.params.disclosureIndex);
    if (!Number.isFinite(disclosureIndex)) {
      return res.status(400).json({ success: false, message: 'Gecerli disclosureIndex gerekli.' });
    }

    const attachments = await fetchFinancialReportAttachments(disclosureIndex, {
      refresh: req.query.refresh === 'true'
    });

    res.json({
      success: true,
      symbol: req.params.symbol.toUpperCase().replace('.IS', ''),
      disclosureIndex,
      count: attachments.length,
      elapsedMs: Date.now() - start,
      data: attachments
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'KAP finansal rapor ekleri cekilemedi.',
      error: error.message,
      elapsedMs: Date.now() - start
    });
  }
});

app.post('/api/kap/financial-reports/:symbol/download-attachments', async (req, res) => {
  const start = Date.now();
  try {
    const limit = Number(req.query.limit || req.body?.limit || 10);
    const refresh = req.query.refresh === 'true' || req.body?.refresh === true;
    const result = await downloadFinancialReportAttachmentsBySymbol(req.params.symbol, {
      limit: Number.isFinite(limit) ? limit : 10,
      refresh
    });

    res.json({
      success: true,
      elapsedMs: Date.now() - start,
      result
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'KAP finansal rapor ekleri indirilemedi.',
      error: error.message,
      elapsedMs: Date.now() - start
    });
  }
});

app.post('/api/kap/financial-reports/:symbol/:disclosureIndex/download-attachments', async (req, res) => {
  const start = Date.now();
  try {
    const disclosureIndex = Number(req.params.disclosureIndex);
    if (!Number.isFinite(disclosureIndex)) {
      return res.status(400).json({ success: false, message: 'Gecerli disclosureIndex gerekli.' });
    }

    const result = await downloadFinancialReportAttachments(disclosureIndex, {
      refresh: req.query.refresh === 'true' || req.body?.refresh === true
    });

    res.json({
      success: true,
      symbol: req.params.symbol.toUpperCase().replace('.IS', ''),
      elapsedMs: Date.now() - start,
      result
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'KAP finansal rapor eki indirilemedi.',
      error: error.message,
      elapsedMs: Date.now() - start
    });
  }
});

const INDEX_COMPONENTS: { [key: string]: string[] } = {
  'XU100.IS': [
    'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS', 'ISCTR.IS', 'GARAN.IS', 'BIMAS.IS', 'EREGL.IS', 'SAHOL.IS', 'YKBNK.IS',
    'ASELS.IS', 'SISE.IS', 'FROTO.IS', 'SASA.IS', 'HEKTS.IS', 'ARCLK.IS', 'TOASO.IS', 'ASTOR.IS', 'KONTR.IS', 'YEOTK.IS',
    'EFOR.IS', 'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TKFEN.IS', 'ODAS.IS', 'AKSEN.IS', 'AEFES.IS', 'MGROS.IS',
    'TTKOM.IS', 'TCELL.IS', 'HALKB.IS', 'VAKBN.IS', 'DOHOL.IS', 'SOKM.IS', 'OTKAR.IS',
    'ALARK.IS', 'MAVI.IS', 'CCOLA.IS', 'ULKER.IS', 'GUBRF.IS', 'AGHOL.IS', 'DOAS.IS', 'ZOREN.IS', 'BERA.IS', 'TURSG.IS',
    'SKBNK.IS', 'TSKB.IS', 'VESTL.IS', 'KARSN.IS', 'EGEEN.IS', 'OYAKC.IS', 'KORDS.IS', 'ALBRK.IS', 'BRISA.IS', 'LOGO.IS',
    'QUAGR.IS', 'ASUZU.IS', 'GENIL.IS', 'CWENE.IS', 'ALFAS.IS', 'SDTTR.IS', 'MIATK.IS', 'REEDR.IS', 'SAYAS.IS', 'EUPWR.IS',
    'GESAN.IS', 'SMRTG.IS', 'BRYAT.IS', 'CANTE.IS', 'AKFGY.IS', 'KAYSE.IS', 'ENERY.IS', 'TATEN.IS', 'EBEBK.IS', 'TABGD.IS',
    'VAKFN.IS', 'IZMDC.IS', 'BTCIM.IS', 'OYYAT.IS', 'KFEIN.IS', 'ARDYZ.IS', 'FORMT.IS', 'BVSAN.IS',
    'MHRGY.IS', 'BORLS.IS', 'AVPGY.IS', 'SURGY.IS', 'MEGMT.IS', 'LMKDC.IS', 'MOGAN.IS', 'ENTRA.IS', 'KOTON.IS',
    'AGROT.IS', 'BEGYO.IS', 'CATES.IS', 'SKYMD.IS', 'LKMNH.IS', 'PKENT.IS', 'TERA.IS'
  ],
  'XU050.IS': [
    'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS', 'ISCTR.IS', 'GARAN.IS', 'BIMAS.IS', 'EREGL.IS', 'SAHOL.IS', 'YKBNK.IS',
    'ASELS.IS', 'SISE.IS', 'FROTO.IS', 'SASA.IS', 'HEKTS.IS', 'ARCLK.IS', 'TOASO.IS', 'ASTOR.IS', 'KONTR.IS', 'YEOTK.IS',
    'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TKFEN.IS', 'ODAS.IS', 'AKSEN.IS', 'AEFES.IS', 'MGROS.IS', 'TTKOM.IS',
    'TCELL.IS', 'HALKB.IS', 'VAKBN.IS', 'DOHOL.IS', 'SOKM.IS', 'OTKAR.IS', 'ALARK.IS',
    'MAVI.IS', 'CCOLA.IS', 'ULKER.IS', 'GUBRF.IS', 'AGHOL.IS', 'DOAS.IS', 'ZOREN.IS', 'BERA.IS', 'TURSG.IS', 'SKBNK.IS'
  ],
  'XU030.IS': [
    'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS', 'ISCTR.IS', 'GARAN.IS', 'BIMAS.IS', 'EREGL.IS', 'SAHOL.IS', 'YKBNK.IS',
    'ASELS.IS', 'SISE.IS', 'FROTO.IS', 'SASA.IS', 'HEKTS.IS', 'ARCLK.IS', 'TOASO.IS', 'ASTOR.IS', 'KONTR.IS', 'YEOTK.IS',
    'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TCELL.IS', 'HALKB.IS', 'VAKBN.IS', 'ALARK.IS', 'GUBRF.IS'
  ],
  'XBANK.IS': [
    'AKBNK.IS', 'GARAN.IS', 'ISCTR.IS', 'YKBNK.IS', 'VAKBN.IS', 'HALKB.IS', 'ALBRK.IS', 'SKBNK.IS', 'TSKB.IS',
    'VAKFN.IS', 'HALKS.IS', 'KLNMA.IS'
  ],
  'XUTEK.IS': [
    'ASELS.IS', 'TCELL.IS', 'TTKOM.IS', 'SASA.IS', 'KONTR.IS', 'YEOTK.IS', 'MIATK.IS', 'SDTTR.IS', 'REEDR.IS', 'ARDYZ.IS',
    'KFEIN.IS', 'LOGO.IS', 'FORMT.IS', 'LINK.IS', 'ALCTL.IS', 'KAREL.IS', 'VBTYO.IS', 'PCILT.IS', 'ESCOM.IS', 'INDES.IS'
  ],
  '^GSPC': [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AMD', 'INTC',
    'BRK-B', 'LLY', 'AVGO', 'JPM', 'UNH', 'V', 'XOM', 'MA', 'HD', 'PG',
    'COST', 'JNJ', 'ABBV', 'CRM', 'WMT', 'BAC', 'NFLX', 'CVX', 'KO', 'ADBE',
    'PEP', 'MRK', 'ORCL', 'TMO', 'LIN', 'ACN', 'MCD', 'ABT', 'CSCO', 'DHR',
    'QCOM', 'GE', 'INTU', 'TXN', 'VZ', 'AMAT', 'PFE', 'PM', 'IBM', 'AMGN',
    'NOW', 'ISRG', 'AXP', 'CAT', 'LOW', 'UNP', 'HON', 'COP', 'GS', 'MS',
    'LMT', 'NEE', 'BKNG', 'T', 'DE', 'RTX', 'VRTX', 'TJX', 'PLD', 'ELV',
    'SYK', 'BLK', 'ETN', 'BSX', 'PGR', 'MDLZ', 'REGN', 'MMC', 'ADI', 'C',
    'ADP', 'AMT', 'CI', 'PANW', 'GILD', 'BA', 'CB', 'LRCX', 'SCHW', 'MU',
    'CVS', 'KLAC', 'EQIX', 'VLO', 'ZTS', 'EOG', 'FI', 'APH', 'WM',
    'HUM', 'CDNS', 'TGT', 'AON', 'SHW', 'MO', 'HCA', 'MCK', 'MCO', 'GD',
    'MPC', 'MAR', 'USB', 'EMR', 'CTAS', 'NXPI', 'ADSK', 'FDX', 'ORLY', 'AJG'
  ],
  '^NDX': [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'COST',
    'NFLX', 'ADBE', 'AMD', 'PEP', 'LIN', 'TMUS', 'INTU', 'CSCO', 'QCOM', 'AMAT',
    'TXN', 'AMGN', 'ISRG', 'HON', 'INTC', 'VRTX', 'BKNG', 'MU', 'SBUX', 'PANW',
    'MDLZ', 'REGN', 'LRCX', 'ADI', 'KLAC', 'EQIX', 'VLO', 'ZTS', 'EOG', 'FI',
    'APH', 'WM', 'HUM', 'CDNS', 'TGT', 'AON', 'SHW', 'MO', 'HCA', 'MCK',
    'MCO', 'GD', 'MPC', 'MAR', 'USB', 'EMR', 'CTAS', 'NXPI', 'ADSK', 'FDX',
    'ORLY', 'AJG', 'CHTR', 'PCAR', 'MNST', 'PAYX', 'ROST', 'IDXX', 'KDP', 'FAST',
    'CPRT', 'LULU', 'EXC', 'CTSH', 'GIGA', 'EA', 'KHC', 'ODFL', 'BKR', 'WBD',
    'ANSS', 'TEAM', 'ILMN', 'WDAY', 'DDOG', 'MCHP', 'AZN', 'BIIB', 'SIRI', 'EBAY',
    'VRSK', 'LCID', 'MELI', 'ZM', 'ADP', 'PDD', 'SNPS', 'CRWD', 'ATVI', 'DXCM', 'SKHYV', 'SPCX'
  ],
  '^IXIC': [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'COST',
    'NFLX', 'ADBE', 'AMD', 'PEP', 'TMUS', 'INTU', 'CSCO', 'QCOM', 'AMAT', 'TXN'
  ]
};

BIST_SYMBOL_SET = new Set((INDEX_COMPONENTS['XU100.IS'] || []).map((symbol: string) => symbol.replace('.IS', '')));

// Market Özeti için Global Cache
let marketSummaryCache: { data: any, timestamp: number } | null = null;

// Ana Piyasa Özeti (SÜPER HIZLI - NO INTERNAL FETCH)
app.get('/api/market-summary', async (req, res) => {
  try {
    // 1. Global Cache Kontrolü (10 dakika - RAM tasarrufu için artırıldı)
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && marketSummaryCache && (Date.now() - marketSummaryCache.timestamp < 600000)) {
      console.log("🚀 Serving Global Market Summary from Cache");
      return res.json(marketSummaryCache.data);
    }

    const mainSymbols = [
      'XU100.IS', 'XU050.IS', 'XU030.IS', 'XBANK.IS', 'XUTEK.IS',
      '^GSPC', '^NDX', '^IXIC', '^SOX', '^NYFANG', '^NBI',
      'BTC-USD', 'ETH-USD', 'GC=F', 'USDTRY=X'
    ];

    console.log(`📊 Batch processing market summary for ${mainSymbols.length} tickers`);

    // 2. Yahoo'dan toplu fiyatları çek (slot ile sınırlandırılmış)
    const quotes: any = await withYahooSlot(() => (yf as any).quote(mainSymbols));
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    // 3. Kripto için Binance Klines sparkline (24 saat × 15dk = 96 nokta, rate-limitsiz)
    let sparkData: Record<string, number[]> = {};
    try {
      const [btcRes, ethRes] = await Promise.all([
        axios.get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=96', { timeout: 8000 }),
        axios.get('https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=15m&limit=96', { timeout: 8000 })
      ]);
      sparkData['BTC-USD'] = btcRes.data.map((k: any[]) => parseFloat(k[4]));
      sparkData['ETH-USD'] = ethRes.data.map((k: any[]) => parseFloat(k[4]));
      console.log(`✅ Binance sparkline: BTC ${sparkData['BTC-USD'].length}pts, ETH ${sparkData['ETH-USD'].length}pts`);
    } catch (e: any) {
      console.warn(`⚠️ Binance sparkline failed:`, e.message?.slice(0, 60));
    }

    // Yahoo Spark API ile diğer sembollerin (BIST + Global endeksler) sparkline'ını TEK SEFERDE çek
    try {
      const allBistSymbols = [...INDEX_COMPONENTS['XU100.IS'], ...mainSymbols].sort();
      const nonCryptoSymbols = mainSymbols.filter(s => !sparkData[s]);
      const sparkSymbols = nonCryptoSymbols.join('%2C');
      const sparkUrl = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${sparkSymbols}&range=1d&interval=15m`;
      const sparkRes = await (axios as any).get(sparkUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000
      });
      const sparkSpark = sparkRes.data?.spark?.result || [];
      for (const item of sparkSpark) {
        const sym = item.symbol;
        const closes = item.response?.[0]?.indicators?.quote?.[0]?.close || [];
        sparkData[sym] = closes.filter((c: any) => c != null);
      }
      console.log(`✅ Spark API: ${Object.keys(sparkData).length} symbols total`);
    } catch (e: any) {
      console.warn(`⚠️ Spark API failed, will use chart() fallback:`, e.message?.slice(0, 60));
    }

    // 4. Fiyat verisi ile sparkline'ı birleştir
    const results = await Promise.all(quotesArray.map(async (quote: any) => {
      try {
        const symbol = quote.symbol;
        let history: number[] = sparkData[symbol] || [];

        let price = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
        let change = quote.regularMarketChange || 0;
        let changePercent = quote.regularMarketChangePercent || 0;

        // KRİPTO: 24 saatlik rolling pencere (Binance standardı) - Anlık Fiyat Entegrasyonu
        if ((symbol === 'BTC-USD' || symbol === 'ETH-USD') && history.length > 0) {
          // Mini grafiğin son noktasını anlık canlı fiyatla güncelleyelim ki grafik ve fiyat tam uyuşsun
          history[history.length - 1] = price;

          const startPrice = history[0];
          change = price - startPrice;
          changePercent = (change / startPrice) * 100;
        }

        // KALDIRILAN: chart() fallback — eşzamanlı 14 ağır istek yaparak RAM/GPU crash'e yol açıyordu.
        // Spark API boş döndüğünde sparkline yok gösteriyoruz (güvenli, hafif).
        if (history.length < 5 && !['BTC-USD', 'ETH-USD'].includes(symbol)) {
          // history boş kalabilir — frontend bunu gracefully handle eder
          console.log(`ℹ️ [market-summary] ${symbol} için sparkline yok (Spark API boş döndü, fallback devre dışı)`);
        }

        return {
          symbol: quote.symbol,
          price,
          change,
          changePercent,
          history
        };
      } catch (e: any) {
        return {
          symbol: quote.symbol,
          price: 0,
          change: 0,
          changePercent: 0,
          history: []
        };
      }
    }));

    // 4. Cache'e kaydet
    marketSummaryCache = {
      data: results,
      timestamp: Date.now()
    };

    res.json(results);
  } catch (error: any) {
    console.error('Market Summary Error:', error.message);
    res.json([]); // Hata olsa bile boş dizi dön ki frontend patlamasın
  }
});

// Basit bir in-memory cache (Hız için)
// 15 Dakikalık Veri Toplama Motoru (Market Data Collector)
const mainTickers = [
  'XU100.IS', 'XU050.IS', 'XU030.IS', 'XBANK.IS', 'XUTEK.IS',
  '^GSPC', '^NDX', '^IXIC', '^SOX', '^NYFANG', '^NBI',
  'BTC-USD', 'ETH-USD', 'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS'
];

async function collectMarketData() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // BIST Çalışma Saatleri (10:00 - 18:15)
  const isBistOpen = day >= 1 && day <= 5 && (
    (hour > 10 && hour < 18) ||
    (hour === 10 && minute >= 0) ||
    (hour === 18 && minute <= 15)
  );

  // Kripto her zaman açık, Global endeksler için de kontrol eklenebilir
  console.log(`🕒 [Data Collector] Running at ${now.toLocaleTimeString()}`);

  try {
    const quotes: any = await withYahooSlot(() => (yf as any).quote(mainTickers));
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    const records = quotesArray.map((q: any) => ({
      symbol: q.symbol,
      price: q.regularMarketPrice || q.price || q.regularMarketPreviousClose || 0,
      timestamp: new Date()
    }));

    // Veritabanına toplu kaydet (Duplicate hatasını önlemek için insertMany yerine tek tek veya try-catch ile)
    for (const record of records) {
      try {
        await MarketData.findOneAndUpdate(
          { symbol: record.symbol, timestamp: { $gte: new Date(now.getTime() - 5 * 60 * 1000) } }, // Son 5 dk içinde kayıt varsa güncelle
          record,
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err) {
        // Sessizce devam et
      }
    }
    console.log(`✅ [Data Collector] Saved ${records.length} records to DB.`);
  } catch (error: any) {
    console.error('❌ [Data Collector] Error:', error.message);
  }
}

// Her 15 dakikada bir çalıştır
setInterval(collectMarketData, 15 * 60 * 1000);

// İlk açılışta bir kez çalıştır (30sn gecikme — frontend başlangıç yüküyle çakışmasın)
setTimeout(collectMarketData, 30000);

// ═══════════════════════════════════════════════════════════════
// 🆕 AKILLI KAP VE HABER SENKRONİZASYONU (15 DK)
// ═══════════════════════════════════════════════════════════════

let isKapSyncRunning = false;
const KAP_SYNC_MAX_ITEMS = parsePositiveIntEnv('KAP_SYNC_MAX_ITEMS', 20, 1, 50);
const KAP_TRANSLATION_DELAY_MS = parsePositiveIntEnv('KAP_TRANSLATION_DELAY_MS', 1000, 0, 10000);

function normalizeKapSymbols(stockCodes: string | undefined | null): string[] {
  const rawCodes = (stockCodes || '')
    .split(/[;,\s]+/)
    .map(code => normalizeSymbol(code).replace('.IS', ''))
    .filter(Boolean);

  const uniqueCodes = Array.from(new Set(rawCodes));
  if (uniqueCodes.length === 0) return ['BIST'];
  return uniqueCodes.map(code => code === 'BIST' ? code : `${code}.IS`);
}

async function syncKapNews() {
  if (isKapSyncRunning) {
    console.log('[KAP-SYNC] Devam eden senkronizasyon var, yeni tur atlandi.');
    return;
  }

  isKapSyncRunning = true;
  console.log('[KAP-SYNC] Yeni bildirimler kontrol ediliyor...');

  try {
    await ensureDisclosuresLoaded();
    const disclosures = getCachedDisclosures();

    if (!disclosures || disclosures.length === 0) {
      console.log('[KAP-SYNC] Yeni bildirim bulunamadi.');
      return;
    }

    const recentDisclosures = disclosures.slice(0, KAP_SYNC_MAX_ITEMS);
    let processedCount = 0;

    for (const item of recentDisclosures) {
      const uuid = item.disclosureIndex.toString();
      const exists = await NewsArticle.exists({ uuid });
      if (exists) continue;

      const symbols = normalizeKapSymbols(item.stockCodes);
      const primarySymbol = symbols[0] || 'BIST';
      const rawTitle = `${item.kapTitle} - ${item.subject}`;
      const rawContent = item.summary || item.subject;

      console.log(`[KAP-SYNC] [${primarySymbol}] Yeni KAP haberi: ${item.kapTitle.substring(0, 40)}...`);

      try {
        const translatedTitle = await translateToTurkish(rawTitle);
        const translatedContent = rawContent && rawContent.length > 5
          ? await translateToTurkish(rawContent)
          : '';

        await NewsArticle.findOneAndUpdate(
          { uuid },
          {
            symbol: primarySymbol,
            symbols,
            title: translatedTitle,
            publisher: 'KAP',
            link: `https://www.kap.org.tr/tr/Bildirim/${item.disclosureIndex}`,
            providerPublishTime: new Date(item.publishDate),
            thumbnail: 'https://images.unsplash.com/photo-1611974717482-58a2527e7446?auto=format&fit=crop&q=80&w=300&h=200',
            content: translatedContent
          },
          { upsert: true, returnDocument: 'after' }
        );

        processedCount++;
        console.log(`[KAP-SYNC] [+] [${symbols.join(', ')}] KAP haberi eklendi: ${translatedTitle.substring(0, 45)}...`);

        if (KAP_TRANSLATION_DELAY_MS > 0) {
          await new Promise(res => setTimeout(res, KAP_TRANSLATION_DELAY_MS));
        }
      } catch (trErr: any) {
        console.error(`[KAP-SYNC] [${primarySymbol}] Ceviri/kayit hatasi:`, trErr.message);
      }
    }

    console.log(`[KAP-SYNC] Senkronizasyon tamamlandi. ${processedCount} yeni haber islendi.`);
  } catch (err: any) {
    console.error('[KAP-SYNC] Kritik Hata:', err.message);
  } finally {
    isKapSyncRunning = false;
  }
}
// 15 dakikada bir çalıştır
setInterval(syncKapNews, 15 * 60 * 1000);
setTimeout(syncKapNews, 5000); // Başlangıçta 5 sn sonra ilk tur


const componentsCache: { [key: string]: { data: any, timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 Dakika (Performans için artırıldı)

// Endeks bileşenlerini getir (SÜPER HIZLI - BATCH & CHUNK HYBRID)
app.get('/api/stocks/:symbol/components', async (req, res) => {
  try {
    const { symbol } = req.params;
    const cacheKey = symbol.toUpperCase();

    // 1. Cache kontrolü
    if (componentsCache[cacheKey] && (Date.now() - componentsCache[cacheKey].timestamp < CACHE_DURATION)) {
      console.log(`⚡ Serving components from cache for ${cacheKey}`);
      return res.json(componentsCache[cacheKey].data);
    }

    const components = INDEX_COMPONENTS[cacheKey];
    if (!components) {
      return res.status(404).json({ message: 'Bileşen listesi bulunamadı' });
    }

    console.log(`🚀 Batch fetching ${components.length} stocks for ${cacheKey}`);

    const results: any[] = [];
    // Eğer liste 100'den küçükse tek seferde çek (BIST 100 için ideal), büyükse 100'erli grupla (S&P 500 için ideal)
    const chunkSize = 100;

    for (let i = 0; i < components.length; i += chunkSize) {
      const chunk = components.slice(i, i + chunkSize);
      try {
        const quotes: any = await (yf as any).quote(chunk);
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

        results.push(...quotesArray.map((quote: any) => ({
          symbol: quote.symbol.replace('.IS', ''),
          name: quote.shortName || quote.symbol.split('.')[0],
          price: quote.regularMarketPrice || quote.price || quote.bid || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0
        })));
      } catch (chunkErr: any) {
        console.error(`[CHUNK ERROR] ${cacheKey} group ${i}:`, chunkErr.message);
      }
    }

    // 3. Cache'e kaydet
    componentsCache[cacheKey] = {
      data: results,
      timestamp: Date.now()
    };

    res.json(results);
  } catch (error: any) {
    console.error('Batch Fetch Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Halka Arz Verileri (2026 Detaylı Liste)
app.get('/api/halkaarz', (req, res) => {
  const ipoData = [
    {
      name: "Şa-Ra Enerji İnşaat Tic. ve San. A.Ş.",
      symbol: "SARAE",
      status: "active",
      statusText: "Yeni!",
      date: "8-9-10 Temmuz 2026",
      logo: "/logos/SARAE.png",
      details: {
        price: "70,00 TL",
        distribution: "Bireysel Eşit / Oransal **",
        lots: "89.000.000 Lot",
        manager: "Tera Yatırım Menkul Değerler A.Ş.",
        market: "Yıldız Pazar",
        listingDate: "Hazırlanıyor...",
        participants: "Açıklanmadı",
        perPerson: "Açıklanmadı"
      }
    },
    {
      name: "Saat ve Saat San. ve Tic. A.Ş.",
      symbol: "SSAAT",
      status: "active",
      statusText: "Yeni!",
      date: "6-7-8 Temmuz 2026",
      logo: "/logos/SSAAT.png",
      details: {
        price: "56,00 TL",
        distribution: "Eşit Dağıtım **",
        lots: "66.944.955 Lot (+13.388.991 Lot Ek Pay)",
        manager: "Garanti Yatırım Menkul Kıymetler A.Ş. & Halk Yatırım Menkul Değerler A.Ş. (Konsorsiyum)",
        market: "Yıldız Pazar",
        listingDate: "Hazırlanıyor...",
        participants: "Açıklanmadı",
        perPerson: "Açıklanmadı"
      }
    },
    {
      name: "Isvea Seramik ve Banyo Ürünleri Sanayi A.Ş.",
      symbol: "ISVEA",
      status: "completed",
      statusText: "",
      date: "1-2-3 Temmuz 2026",
      logo: "/logos/ISVEA.png",
      details: {
        price: "20,90 TL",
        distribution: "Eşit Dağıtım **",
        lots: "67.000.000 Lot",
        manager: "Halk Yatırım Menkul Değerler A.Ş. & Ahlatcı Yatırım Menkul Değerler A.Ş. (Konsorsiyum)",
        market: "Ana Pazar",
        listingDate: "",
        participants: "",
        perPerson: ""
      }
    },
    {
      name: "Ekim Turizm Tic. ve San. A.Ş. (Intercity)",
      symbol: "EKIM",
      status: "completed",
      statusText: "",
      date: "1-2-3 Temmuz 2026",
      logo: "/logos/EKIM.png",
      details: {
        price: "30,26 TL",
        distribution: "Eşit Dağıtım **",
        lots: "161.999.998 Lot",
        manager: "Ak Yatırım Menkul Değerler A.Ş. & Vakıf Yatırım Menkul Değerler A.Ş. (Konsorsiyum)",
        market: "Yıldız Pazar",
        listingDate: "",
        participants: "",
        perPerson: ""
      }
    },
    {
      name: "Golda Gıda San. ve Tic. A.Ş.",
      symbol: "GOLDA",
      status: "completed",
      statusText: "",
      date: "1-2 Temmuz 2026",
      logo: "/logos/GOLDA.png",
      details: {
        price: "9,20 TL",
        distribution: "Eşit Dağıtım **",
        lots: "87.499.998 Lot",
        manager: "Gedik Yatırım Menkul Değerler A.Ş. / Misyon Yatırım Bankası A.Ş. (Konsorsiyum)",
        market: "Ana Pazar",
        listingDate: "Hazırlanıyor...",
        participants: "749.674 Kişi",
        perPerson: "117 Lot"
      }
    },
    {
      name: "Soho Giyim ve Enerji A.Ş.",
      symbol: "SOHOE",
      status: "completed",
      statusText: "",
      date: "30 Haziran, 1 Temmuz 2026",
      logo: "/logos/SOHOE.png",
      details: {
        price: "15,00 TL",
        distribution: "Eşit Dağıtım **",
        lots: "100.000.000 Lot",
        manager: "İntegral Yatırım Menkul Değerler A.Ş.",
        market: "Ana Pazar",
        listingDate: "6 Temmuz 2026",
        participants: "660.121 Kişi",
        perPerson: "121 Lot"
      }
    },
    {
      name: "Orzaks İlaç ve Kimya San. Tic. A.Ş. (Orzax)",
      symbol: "ORZAX",
      status: "completed",
      statusText: "",
      date: "29-30 Haziran, 1 Temmuz 2026",
      logo: "/logos/ORZAX.png",
      details: {
        price: "69,00 TL",
        distribution: "Eşit Dağıtım **",
        lots: "52.500.000 Lot",
        manager: "İnfo Yatırım Menkul Değerler A.Ş.",
        market: "Yıldız Pazar",
        listingDate: "7 Temmuz 2026",
        participants: "973.805 Kişi",
        perPerson: "30 Lot"
      }
    },
    {
      name: "Beta Enerji ve Teknoloji A.Ş.",
      symbol: "BETAE",
      status: "completed",
      date: "23-24-25 Haziran 2026",
      logo: "/logos/BETAE.png",
      details: {
        price: "40,00 TL",
        distribution: "Bireysele Eşit Dağıtım",
        lots: "60.750.000 Lot",
        manager: "TSKB & Ziraat & Yatırım Finansman",
        market: "Yıldız Pazar",
        listingDate: "1 Temmuz 2026",
        participants: "1.100.000 Kişi",
        perPerson: "28 Lot"
      }
    },
    {
      name: "Ekinciler Demir ve Çelik Sanayi A.Ş.",
      symbol: "EKDMR",
      status: "completed",
      date: "13-14-15 Mayıs 2026",
      logo: "https://halkarz.com/wp-content/uploads/2024/09/EKINCILER.jpg",
      details: {
        price: "45,00 TL",
        distribution: "Eşit Dağıtım",
        lots: "52.000.000 Lot",
        manager: "A1 Capital Yatırım",
        market: "Yıldız Pazar",
        listingDate: "22 Mayıs 2026",
        participants: "770.000 Kişi",
        perPerson: "27 Lot"
      }
    },
    {
      name: "Enpara Bank A.Ş.",
      symbol: "ENPRA",
      date: "7 Nisan 2026",
      logo: "https://halkarz.com/wp-content/uploads/2024/01/enpara.png",
      details: { price: "Açıklanmadı", distribution: "Açıklanmadı", lots: "Açıklanmadı", manager: "Açıklanmadı", market: "Piyasa Öncesi Platform" }
    },
    {
      name: "Ağaoğlu Avrasya GYO A.Ş.",
      symbol: "AAGYO",
      date: "1-2-3 Nisan 2026",
      logo: "https://halkarz.com/wp-content/uploads/2023/12/agaoglu.png",
      details: { price: "21,10 TL", distribution: "Eşit Dağıtım", lots: "176.000.000 Lot", manager: "İnfo & Vakıf Yatırım", market: "Yıldız Pazar" }
    },
    {
      name: "Metropal Kurumsal (MetropolCard)",
      symbol: "MCARD",
      date: "2026 (Taslak)",
      logo: "https://halkarz.com/wp-content/uploads/2023/12/metropolcard.png",
      details: { price: "80,00 TL", distribution: "Eşit Dağıtım", lots: "18.900.000 Lot", manager: "Tera Yatırım", market: "Ana Pazar" }
    },
    {
      name: "Luxera GYO A.Ş.",
      symbol: "LXGYO",
      date: "2026 (Taslak)",
      logo: "https://halkarz.com/wp-content/uploads/2023/12/luxera.png",
      details: { price: "12,05 TL", distribution: "Eşit Dağıtım", lots: "120.000.000 Lot", manager: "Tera Yatırım", market: "Ana Pazar" }
    },
    {
      name: "Gentaş Kimya A.Ş.",
      symbol: "GENKM",
      date: "2026 (Taslak)",
      logo: "https://halkarz.com/wp-content/uploads/2023/12/gentas.png",
      details: { price: "11,00 TL", distribution: "Eşit Dağıtım", lots: "124.845.000 Lot", manager: "Deniz Yatırım", market: "Ana Pazar", listingDate: "10 Mart 2026" }
    },
    {
      name: "Akhan Un Fabrikası A.Ş.",
      symbol: "AKHAN",
      date: "28-30 Ocak 2026",
      logo: "https://halkarz.com/wp-content/uploads/2023/12/akhanun.png",
      details: { price: "21,50 TL", distribution: "Eşit Dağıtım", lots: "54.700.000 Lot", manager: "Halk Yatırım", market: "Ana Pazar", listingDate: "5 Şubat 2026", participants: "2.840.000 Kişi", perPerson: "19 Lot" }
    }
  ];
  res.json(ipoData);
});

// Halka Arz Detay Verisi (Sembol Bazlı)
app.get('/api/halkaarz/:symbol', (req, res) => {
  const { symbol } = req.params;
  const sym = symbol.toUpperCase();

  if (sym === 'SARAE') {
    return res.json({
      title: "Şa-Ra Enerji İnşaat Tic. ve San. A.Ş.",
      symbol: "SARAE",
      status: "active",
      statusText: "Yeni!",
      logo: "/logos/SARAE.png",
      date: "8-9-10 Temmuz 2026",
      hours: "09:00 - 17:00",
      price: "70,00 TL",
      distribution: "Eşit Dağıtım **",
      lots: "89.000.000 Lot",
      manager: "Tera Yatırım Menkul Değerler A.Ş.",
      market: "Yıldız Pazar",
      size: "~ 6,2 Milyar TL",
      method: {
        capitalIncrease: "44.500.000 Lot. * SPK Bülteni, 2026/43.",
        partnerSale: "44.500.000 Lot (35.600.000 Lot Şadi Türk, 8.900.000 Lot Hilkat Mor)",
        total: "89.000.000 Lot",
        partners: [
          { name: "Şadi Türk", lot: "35.600.000" },
          { name: "Hilkat Mor", lot: "8.900.000" }
        ]
      },
      balanceSheet: [
        { year: "2026/3", revenue: "3,3 Milyar TL", profit: "904,9 Milyon TL" },
        { year: "2025", revenue: "7,0 Milyar TL", profit: "1,9 Milyar TL" },
        { year: "2024", revenue: "14,3 Milyar TL", profit: "3,4 Milyar TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "225 Lot", amount: "15.750 TL" },
        { participants: "250 Bin", lots: "135 Lot", amount: "9.450 TL" },
        { participants: "350 Bin", lots: "96 Lot", amount: "6.720 TL" },
        { participants: "500 Bin", lots: "67 Lot", amount: "4.690 TL" },
        { participants: "700 Bin", lots: "48 Lot", amount: "3.360 TL" },
        { participants: "1,1 Milyon", lots: "31 Lot", amount: "2.170 TL" },
        { participants: "1,6 Milyon", lots: "21 Lot", amount: "1.470 TL" },
        { participants: "2,2 Milyon", lots: "16 Lot", amount: "1.120 TL" }
      ],
      fundUsage: [
        { area: "Yatırım harcamaları", ratio: 15 },
        { area: "İşletme sermayesi", ratio: 55 },
        { area: "Finansal borç ödemesi", ratio: 30 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel Yatırımcı", ratio: 38, lot: "33.820.000 Lot" },
        { group: "Şirket Çalışanları", ratio: 2, lot: "1.780.000 Lot" },
        { group: "Yüksek Başvurulu Yatırımcı", ratio: 10, lot: "8.900.000 Lot" },
        { group: "Yurt İçi Kurumsal Yatırımcı", ratio: 25, lot: "22.250.000 Lot" },
        { group: "Yurt Dışı Kurumsal Yatırımcı", ratio: 25, lot: "22.250.000 Lot" }
      ],
      t1t2: "*** T1-T2 Kullanılamaz.",
      stability: "Planlanmamaktadır.",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar.",
      index: "Katılım Endeksine uygun değildir.",
      extra: {
        float: "%20,02",
        discount: "%20",
        salesMethod: "Sabit Fiyatla Talep Toplama."
      }
    });
  }

  if (sym === 'SSAAT') {
    return res.json({
      title: "Saat ve Saat San. ve Tic. A.Ş.",
      symbol: "SSAAT",
      status: "active",
      statusText: "Yeni!",
      logo: "/logos/SSAAT.png",
      date: "6-7-8 Temmuz 2026",
      hours: "09:00 - 17:00",
      price: "56,00 TL",
      distribution: "Bireysele Eşit Dağıtım **",
      lots: "66.944.955 Lot (+13.388.991 Lot Ek Pay)",
      manager: "Garanti Yatırım Menkul Kıymetler A.Ş. & Halk Yatırım Menkul Değerler A.Ş. (Konsorsiyum)",
      market: "Yıldız Pazar",
      size: "~ 4,5 Milyar TL (Ek satış dahil)",
      method: {
        capitalIncrease: "40.166.973 Lot. * SPK Bülteni, 2026/43.",
        partnerSale: "26.777.982 Lot",
        total: "66.944.955 Lot",
        partners: [
          { name: "Ortak Satışı", lot: "26.777.982" },
          { name: "Ek Ortak Satışı", lot: "13.388.991" }
        ]
      },
      balanceSheet: [
        { year: "2026/3", revenue: "3,3 Milyar TL", profit: "1,9 Milyar TL" },
        { year: "2025", revenue: "13,0 Milyar TL", profit: "7,7 Milyar TL" },
        { year: "2024", revenue: "11,5 Milyar TL", profit: "6,7 Milyar TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "267 Lot", amount: "14.952 TL" },
        { participants: "250 Bin", lots: "161 Lot", amount: "9.016 TL" },
        { participants: "350 Bin", lots: "114 Lot", amount: "6.384 TL" },
        { participants: "500 Bin", lots: "80 Lot", amount: "4.480 TL" },
        { participants: "700 Bin", lots: "57 Lot", amount: "3.192 TL" },
        { participants: "1,1 Milyon", lots: "36 Lot", amount: "2.016 TL" },
        { participants: "1,6 Milyon", lots: "25 Lot", amount: "1.400 TL" },
        { participants: "2,2 Milyon", lots: "19 Lot", amount: "1.064 TL" }
      ],
      fundUsage: [
        { area: "Finansal borçların ödenmesi", ratio: 20 },
        { area: "İşletme sermayesi", ratio: 80 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel Yatırımcı", ratio: 60, lot: "40.166.973 Lot" },
        { group: "Yurt İçi Kurumsal Yatırımcı", ratio: 40, lot: "26.777.982 Lot" }
      ],
      t1t2: "*** T1-T2 Kullanılamaz.",
      stability: "30 gün. * Brüt halka arz gelirinin %20'si (Halk Yatırım Menkul Değerler A.Ş.)",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar.",
      index: "Uygundur (Katılım Endeksine Uygun - XKTUM)",
      extra: {
        float: "%12,3",
        discount: "%37,01",
        salesMethod: "Sabit Fiyatla Talep Toplama."
      }
    });
  }

  if (sym === 'BETAE') {
    return res.json({
      title: "Beta Enerji ve Teknoloji A.Ş.",
      symbol: "BETAE",
      status: "completed",
      logo: "/logos/BETAE.png",
      date: "23-24-25 Haziran 2026",
      price: "40,00 TL",
      distribution: "Bireysele Eşit Dağıtım",
      lots: "60.750.000 Lot",
      manager: "Türkiye Sınai Kalkınma Bankası A.Ş. & Ziraat Yatırım & Yatırım Finansman",
      market: "Yıldız Pazar",
      size: "2.430.000.000 TL",
      method: {
        capitalIncrease: "55.000.000 Lot",
        partnerSale: "5.750.000 Lot",
        total: "60.750.000 Lot",
        partners: [
          { name: "Mevcut Ortaklar", lot: "5.750.000" }
        ]
      },
      balanceSheet: [
        { year: "2026/3", revenue: "704,0 Milyon TL", profit: "158,0 Milyon TL" },
        { year: "2025", revenue: "4,6 Milyar TL", profit: "1,5 Milyar TL" },
        { year: "2024", revenue: "4,3 Milyar TL", profit: "1,5 Milyar TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "202 Lot", amount: "8.080 TL" },
        { participants: "250 Bin", lots: "121 Lot", amount: "4.840 TL" },
        { participants: "350 Bin", lots: "86 Lot", amount: "3.440 TL" },
        { participants: "500 Bin", lots: "61 Lot", amount: "2.440 TL" },
        { participants: "700 Bin", lots: "43 Lot", amount: "1.720 TL" },
        { participants: "1,1 Milyon", lots: "28 Lot", amount: "1.120 TL" },
        { participants: "1,6 Milyon", lots: "19 Lot", amount: "760 TL" },
        { participants: "2,2 Milyon", lots: "14 Lot", amount: "560 TL" }
      ],
      fundUsage: [
        { area: "Büyüme yatırımlarının finansmanı", ratio: 45 },
        { area: "İşletme sermayesi", ratio: 55 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel", ratio: 50, lot: "30.375.000" },
        { group: "Yüksek Başvurulu", ratio: 10, lot: "6.075.000" },
        { group: "Şirket Çalışanları", ratio: 1, lot: "607.500" },
        { group: "Yurt İçi Kurumsal", ratio: 39, lot: "23.692.500" }
      ],
      t1t2: "Kullanılamaz",
      stability: "30 Gün (Yatırım Finansman)",
      index: "Uygundur (Katılım Endeksine Uygun)",
      extra: {
        float: "%15",
        discount: "%20,45",
        salesMethod: "Sabit Fiyatla Talep Toplama",
        highThreshold: "450.045 TL"
      }
    });
  }

  if (sym === 'SOHOE') {
    return res.json({
      title: "Soho Giyim ve Enerji A.Ş.",
      symbol: "SOHOE",
      status: "completed",
      logo: "/logos/SOHOE.png",
      date: "30 Haziran, 1 Temmuz 2026",
      hours: "10:30 - 13:00",
      price: "15,00 TL",
      distribution: "Eşit Dağıtım **",
      lots: "100.000.000 Lot",
      manager: "İntegral Yatırım Menkul Değerler A.Ş.",
      market: "Ana Pazar",
      size: "~ 1,5 Milyar TL",
      method: {
        capitalIncrease: "100.000.000 Lot. * SPK Bülteni, 2026/41.",
        partnerSale: "Yoktur",
        total: "100.000.000 Lot",
        partners: []
      },
      balanceSheet: [
        { year: "2026/3", revenue: "709,6 Milyon TL", profit: "274,0 Milyon TL" },
        { year: "2025", revenue: "3,0 Milyar TL", profit: "988,6 Milyon TL" },
        { year: "2024", revenue: "2,6 Milyar TL", profit: "532,8 Milyon TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "750 Lot", amount: "9.000 TL" },
        { participants: "250 Bin", lots: "400 Lot", amount: "6.000 TL" },
        { participants: "350 Bin", lots: "285 Lot", amount: "4.275 TL" },
        { participants: "500 Bin", lots: "200 Lot", amount: "3.000 TL" },
        { participants: "700 Bin", lots: "143 Lot", amount: "2.145 TL" },
        { participants: "1,1 Milyon", lots: "90 Lot", amount: "1.350 TL" },
        { participants: "1,6 Milyon", lots: "63 Lot", amount: "945 TL" },
        { participants: "2,2 Milyon", lots: "45 Lot", amount: "675 TL" }
      ],
      fundUsage: [
        { area: "Mağazalaşma yatırımları", ratio: 30 },
        { area: "Markalaşma yatırımları", ratio: 10 },
        { area: "Kreasyon Yatırımları", ratio: 60 }
      ],
      allocation: [
        { group: "Yoktur", ratio: 100, lot: "Yoktur. * Tamamen Eşit Dağıtım." }
      ],
      t1t2: "*** T1-T2 Uygun.",
      stability: "30 gün. * Brüt halka arz gelirinin %10'u.",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar.",
      index: "Uygundur (Katılım Endeksine Uygun)",
      extra: {
        float: "%32,60",
        discount: "%37",
        salesMethod: "Borsa'da Satış - Sabit Fiyatla Talep Toplama."
      }
    });
  }

  if (sym === 'GOLDA') {
    return res.json({
      title: "Golda Gıda San. ve Tic. A.Ş.",
      symbol: "GOLDA",
      status: "completed",
      logo: "/logos/GOLDA.png",
      date: "1-2 Temmuz 2026",
      hours: "10:30 - 13:00",
      price: "9,20 TL",
      distribution: "Eşit Dağıtım **",
      lots: "87.499.998 Lot",
      manager: "Gedik Yatırım Menkul Değerler A.Ş. & Misyon Yatırım Bankası A.Ş. (Konsorsiyum)",
      market: "Ana Pazar",
      size: "~ 804 Milyon TL",
      method: {
        capitalIncrease: "50.000.000 Lot. * SPK Bülteni, 2026/41.",
        partnerSale: "37.499.998 Lot (Bera Holding A.Ş.)",
        total: "87.499.998 Lot",
        partners: [
          { name: "Bera Holding A.Ş.", lot: "37.499.998" }
        ]
      },
      balanceSheet: [
        { year: "2026/3", revenue: "685,4 Milyon TL", profit: "90,9 Milyon TL" },
        { year: "2025", revenue: "2,5 Milyar TL", profit: "362,6 Milyon TL" },
        { year: "2024", revenue: "2,9 Milyar TL", profit: "411,8 Milyon TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "583 Lot", amount: "5.363 TL" },
        { participants: "250 Bin", lots: "350 Lot", amount: "3.220 TL" },
        { participants: "350 Bin", lots: "250 Lot", amount: "2.300 TL" },
        { participants: "500 Bin", lots: "175 Lot", amount: "1.610 TL" },
        { participants: "700 Bin", lots: "125 Lot", amount: "1.150 TL" },
        { participants: "1,1 Milyon", lots: "80 Lot", amount: "736 TL" },
        { participants: "1,6 Milyon", lots: "55 Lot", amount: "506 TL" },
        { participants: "2,2 Milyon", lots: "40 Lot", amount: "368 TL" }
      ],
      fundUsage: [
        { area: "Kapasite artışı, modernizasyon. * İzahname, Sayfa 243.", ratio: 55 },
        { area: "İşletme sermayesi.", ratio: 45 }
      ],
      allocation: [
        { group: "Yoktur", ratio: 100, lot: "Yoktur. * Tamamen Eşit Dağıtım." }
      ],
      t1t2: "*** T1-T2 Uygun.",
      stability: "30 gün. * Brüt halka arz gelirinin %20'si.",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar.",
      index: "Uygundur (Katılım Endeksine Uygun)",
      extra: {
        float: "%35. * İzahname, Sayfa 229.",
        discount: "%30,7",
        salesMethod: "Borsa'da Satış - Sabit Fiyatla Talep Toplama."
      }
    });
  }

  if (sym === 'ISVEA') {
    return res.json({
      title: "Isvea Seramik ve Banyo Ürünleri Sanayi A.Ş.",
      symbol: "ISVEA",
      status: "completed",
      logo: "/logos/ISVEA.png",
      date: "1-2-3 Temmuz 2026",
      hours: "09:00 - 17:00",
      price: "20,90 TL",
      distribution: "Eşit Dağıtım **",
      lots: "67.000.000 Lot",
      manager: "Halk Yatırım Menkul Değerler A.Ş. & Ahlatcı Yatırım Menkul Değerler A.Ş. (Konsorsiyum)",
      market: "Ana Pazar",
      size: "~ 1,4 Milyar TL",
      method: {
        capitalIncrease: "60.000.000 Lot. * SPK Bülteni, 2026/41.",
        partnerSale: "7.000.000 Lot",
        total: "67.000.000 Lot",
        partners: []
      },
      balanceSheet: [
        { year: "2026/3", revenue: "584,2 Milyon TL", profit: "158,7 Milyon TL" },
        { year: "2025", revenue: "2,3 Milyar TL", profit: "830,8 Milyon TL" },
        { year: "2024", revenue: "2,7 Milyar TL", profit: "890,6 Milyon TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "268 Lot", amount: "5.601 TL" },
        { participants: "250 Bin", lots: "160 Lot", amount: "3.344 TL" },
        { participants: "350 Bin", lots: "114 Lot", amount: "2.382 TL" },
        { participants: "500 Bin", lots: "80 Lot", amount: "1.672 TL" },
        { participants: "700 Bin", lots: "57 Lot", amount: "1.191 TL" },
        { participants: "1,1 Milyon", lots: "36 Lot", amount: "752 TL" },
        { participants: "1,6 Milyon", lots: "25 Lot", amount: "522 TL" },
        { participants: "2,2 Milyon", lots: "18 Lot", amount: "376 TL" }
      ],
      fundUsage: [
        { area: "Öztüketime yönelik yenilenebilir enerji yatırımları. * İzahname, Sayfa 271.", ratio: 15 },
        { area: "Makine ve ekipman yatırımları.", ratio: 30 },
        { area: "Kiralama yoluyla elde edilen makine ve teçhizatların satın alma yatırımları.", ratio: 15 },
        { area: "Finansal borçluluğun azaltılması.", ratio: 20 },
        { area: "İşletme sermayesi.", ratio: 20 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel Yatırımcı", ratio: 60, lot: "40.200.000. * İzahname, Sayfa 252." },
        { group: "Yurt İçi Kurumsal Yatırımcı", ratio: 40, lot: "26.800.000." }
      ],
      t1t2: "*** T1-T2 Kullanılamaz.",
      stability: "30 gün. * Brüt halka arz gelirinin %20'si.",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar.",
      index: "Katılım Endeksine uygun değildir.",
      extra: {
        float: "%23,93",
        discount: "%27,03",
        salesMethod: "Sabit Fiyatla Talep Toplama - En İyi Gayret Aracılığı."
      }
    });
  }

  if (sym === 'EKDMR') {
    return res.json({
      title: "Ekinciler Demir ve Çelik Sanayi A.Ş.",
      symbol: "EKDMR",
      status: "active",
      logo: "https://halkarz.com/wp-content/uploads/2024/09/EKINCILER.jpg",
      date: "13-14-15 Mayıs 2026",
      price: "45,00 TL",
      distribution: "Bireysele Eşit Dağıtım",
      lots: "52.000.000 Lot",
      manager: "A1 Capital Yatırım Menkul Değerler A.Ş.",
      market: "Yıldız Pazar",
      size: "2.340.000.000 TL",
      method: {
        capitalIncrease: "40.000.000 Lot",
        partnerSale: "12.000.000 Lot",
        total: "52.000.000 Lot",
        partners: [
          { name: "Ekinciler Holding A.Ş.", lot: "3.339.977" },
          { name: "Faruk Ekinci", lot: "1.236.793" },
          { name: "Namık Kemal Ekinci", lot: "1.236.793" }
        ]
      },
      balanceSheet: [
        { year: "2025", revenue: "20,8 Milyar TL", profit: "1,5 Milyar TL" },
        { year: "2024", revenue: "16,8 Milyar TL", profit: "1,4 Milyar TL" },
        { year: "2023", revenue: "11,0 Milyar TL", profit: "754,9 Milyon TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "138 Lot", amount: "6.210 TL" },
        { participants: "350 Bin", lots: "59 Lot", amount: "2.655 TL" },
        { participants: "700 Bin", lots: "30 Lot", amount: "1.350 TL" },
        { participants: "1,1 Milyon", lots: "19 Lot", amount: "855 TL" },
        { participants: "1,6 Milyon", lots: "13 Lot", amount: "585 TL" },
        { participants: "2,2 Milyon", lots: "9 Lot", amount: "405 TL" }
      ],
      fundUsage: [
        { area: "Yenilenebilir enerji yatırımları", ratio: 25 },
        { area: "Hammadde tedariki ve işletme sermayesi", ratio: 40 },
        { area: "Haddehane modernizasyonu ve kapasite artışı", ratio: 25 },
        { area: "Kütük kaynatma sistemi yatırımı", ratio: 10 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel", ratio: 40, lot: "20.800.000" },
        { group: "Yüksek Başvurulu", ratio: 10, lot: "5.200.000" },
        { group: "Yurt İçi Kurumsal", ratio: 30, lot: "15.600.000" },
        { group: "Yurt Dışı Kurumsal", ratio: 20, lot: "10.400.000" }
      ],
      t1t2: "Kullanılamaz",
      stability: "Planlanmamaktadır",
      index: "Uygun Değildir",
      extra: {
        float: "%16,25",
        discount: "%37,72",
        salesMethod: "Sabit Fiyatla Talep Toplama",
        highThreshold: "450.045 TL (10.001 Lot ve üzeri)"
      }
    });
  }

  if (sym === 'EKIM') {
    return res.json({
      title: "(Intercity) Ekim Turizm Tic. ve San. A.Ş.",
      symbol: "EKIM",
      status: "completed",
      logo: "/logos/EKIM.png",
      date: "1-2-3 Temmuz 2026",
      hours: "09:00 - 17:00",
      price: "30,26 TL",
      distribution: "Eşit Dağıtım **",
      lots: "161.999.998 Lot",
      manager: "Ak Yatırım Menkul Değerler A.Ş. & Vakıf Yatırım Menkul Değerler A.Ş. (Konsorsiyum)",
      market: "Yıldız Pazar",
      size: "~ 4,9 Milyar TL",
      method: {
        capitalIncrease: "132.000.000 Lot. * SPK Bülteni, 2026/41.",
        partnerSale: "30.000.000 Lot (Ali Vural Ak)",
        total: "161.999.998 Lot",
        partners: [
          { name: "Ali Vural Ak", lot: "30.000.000" }
        ]
      },
      balanceSheet: [
        { year: "2026/3", revenue: "2,9 Milyar TL", profit: "799,0 Milyon TL" },
        { year: "2025", revenue: "15,3 Milyar TL", profit: "959,6 Milyon TL" },
        { year: "2024", revenue: "15,9 Milyar TL", profit: "881,2 Milyon TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "756 Lot", amount: "22.876 TL" },
        { participants: "250 Bin", lots: "454 Lot", amount: "13.738 TL" },
        { participants: "350 Bin", lots: "324 Lot", amount: "9.804 TL" },
        { participants: "500 Bin", lots: "227 Lot", amount: "6.869 TL" },
        { participants: "700 Bin", lots: "162 Lot", amount: "4.902 TL" },
        { participants: "1,1 Milyon", lots: "104 Lot", amount: "3.147 TL" },
        { participants: "1,6 Milyon", lots: "71 Lot", amount: "2.148 TL" },
        { participants: "2,2 Milyon", lots: "52 Lot", amount: "1.573 TL" }
      ],
      fundUsage: [
        { area: "Kiralamada kullanılacak kara araçlarının satın alınması. * İzahname, Sayfa 300.", ratio: 100 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel Yatırımcı", ratio: 70, lot: "113.400.000. * İzahname, Sayfa 280." },
        { group: "Yurt İçi Kurumsal Yatırımcı", ratio: 20, lot: "32.400.000." },
        { group: "Yüksek Başvurulu Yatırımcı", ratio: 10, lot: "16.200.000." }
      ],
      t1t2: "*** T1-T2 Kullanılamaz.",
      stability: "15 gün.",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar.",
      index: "Katılım Endeksine uygun değildir.",
      extra: {
        float: "%19,47",
        discount: "%20",
        salesMethod: "Sabit Fiyatla Talep Toplama - En İyi Gayret Aracılığı."
      }
    });
  }

  if (sym === 'ORZAX') {
    return res.json({
      title: "(Orzax) Orzaks İlaç ve Kimya San. Tic. A.Ş.",
      symbol: "ORZAX",
      status: "completed",
      logo: "/logos/ORZAX.png",
      date: "29-30 Haziran, 1 Temmuz 2026",
      hours: "09:00 - 17:00",
      price: "69,00 TL",
      distribution: "Eşit Dağıtım **",
      lots: "52.500.000 Lot",
      manager: "İnfo Yatırım Menkul Değerler A.Ş.",
      market: "Yıldız Pazar",
      size: "~ 3,6 Milyar TL",
      method: {
        capitalIncrease: "31.500.000 Lot. * SPK Bülteni, 2026/41.",
        partnerSale: "21.000.000 Lot (Yunus Emre Alimoğlu)",
        total: "52.500.000 Lot",
        partners: [
          { name: "Yunus Emre Alimoğlu", lot: "21.000.000" }
        ]
      },
      balanceSheet: [
        { year: "2026/3", revenue: "2,6 Milyar TL", profit: "1,7 Milyar TL" },
        { year: "2025", revenue: "7,3 Milyar TL", profit: "4,7 Milyar TL" },
        { year: "2024", revenue: "5,7 Milyar TL", profit: "3,7 Milyar TL" }
      ],
      estimates: [
        { participants: "150 Bin", lots: "199 Lot", amount: "13.731 TL" },
        { participants: "250 Bin", lots: "120 Lot", amount: "8.280 TL" },
        { participants: "350 Bin", lots: "86 Lot", amount: "5.934 TL" },
        { participants: "500 Bin", lots: "61 Lot", amount: "4.209 TL" },
        { participants: "700 Bin", lots: "43 Lot", amount: "2.967 TL" },
        { participants: "1,1 Milyon", lots: "27 Lot", amount: "1.863 TL" },
        { participants: "1,6 Milyon", lots: "19 Lot", amount: "1.311 TL" },
        { participants: "2,2 Milyon", lots: "14 Lot", amount: "966 TL" }
      ],
      fundUsage: [
        { area: "Devam eden ve yeni yatırımların finansmanında. * İzahname, Sayfa 285.", ratio: 50 },
        { area: "Finansal borç anapara ve faiz ödemelerinde.", ratio: 30 },
        { area: "İşletme sermayesi.", ratio: 20 }
      ],
      allocation: [
        { group: "Yurt İçi Bireysel Yatırımcı", ratio: 57, lot: "29.925.000. * İzahname, Sayfa 269." },
        { group: "Şirket Çalışanları", ratio: 3, lot: "1.575.000." },
        { group: "Yurt İçi Kurumsal Yatırımcı", ratio: 30, lot: "15.750.000." },
        { group: "Yurt Dışı Kurumsal Yatırımcı", ratio: 10, lot: "5.250.000." }
      ],
      t1t2: "*** T1-T2 Kullanılamaz.",
      stability: "Planlanmamaktadır.",
      satmama: "1 Yıl, İhraççı. 1 Yıl, Ortaklar. * Günlük Alım Emri Taahhüdü: 5 Gün, 2.625.000 adet.",
      index: "Katılım Endeksine uygun değildir.",
      extra: {
        float: "%15,51",
        discount: "%20",
        salesMethod: "Sabit Fiyatla Talep Toplama - En İyi Gayret Aracılığı."
      }
    });
  }

  // Varsayılan/Boş detay (Veri yoksa)
  res.json({
    title: symbol,
    symbol: sym,
    error: "Bu hisse için henüz detaylı veri işlenmedi.",
    fundUsage: [],
    allocation: []
  });
});

// Auth Routes

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Bu e-posta adresi zaten kullanımda.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, name });
    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email }, AUTH_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ message: 'Kayıt sırasında hata oluştu.', error });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Kullanıcı bulunamadı.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Hatalı şifre.' });

    const token = jwt.sign({ userId: user._id, email: user.email }, AUTH_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ message: 'Giriş sırasında hata oluştu.', error });
  }
});

// User Info (Token verification)
app.get('/api/auth/me', authMiddleware, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Kullanıcı bilgisi alınamadı.' });
  }
});

// Routes

// 1. Get all portfolio items (User specific)
app.get('/api/portfolio', authMiddleware, async (req: any, res: any) => {
  try {
    const items = await Portfolio.find({ userId: req.user.userId }).sort({ createdAt: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error('❌ [PORTFOLIO] DB Error:', error);
    res.status(500).json({ message: 'Error fetching portfolio', error });
  }
});

// 2. Add or Update a stock (User specific)
app.post('/api/portfolio', authMiddleware, async (req: any, res: any) => {
  const { name, amount, cost, color, purchaseDate } = req.body;
  try {
    console.log(`📥 Incoming portfolio update for user ${req.user.userId}:`, req.body);
    const item = await Portfolio.findOneAndUpdate(
      { userId: req.user.userId, name },
      { userId: req.user.userId, name, amount, cost, color, purchaseDate },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    console.log(`✅ MongoDB: Updated/Inserted stock: ${name}`);
    res.json(item);
  } catch (error: any) {
    console.error('❌ Portfolio Save Error:', error.message);
    res.status(500).json({ message: 'Hisse kaydedilirken hata oluştu.', error: error.message });
  }
});

// 3. Delete a stock (User specific)
app.delete('/api/portfolio/:name', authMiddleware, async (req: any, res: any) => {
  try {
    const name = req.params.name === "undefined" || req.params.name === "null" ? "" : req.params.name;
    await Portfolio.findOneAndDelete({ userId: req.user.userId, name: name });
    console.log(`🗑️ MongoDB: Deleted stock for user ${req.user.userId}: "${name}"`);
    res.json({ message: 'Stock deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting stock', error });
  }
});

// 4. Portfolio value history for charts
app.get('/api/portfolio/history', authMiddleware, async (req: any, res: any) => {
  try {
    const { range = '1d' } = req.query;
    const items = await Portfolio.find({ userId: req.user.userId });

    if (!items || items.length === 0) {
      return res.json({
        success: true,
        items: [],
        history: [],
        timestamps: [],
        currentValue: 0,
        totalCost: 0,
        dailyChange: 0,
        dailyChangePercent: 0
      });
    }

    // Prepare Yahoo symbols
    const symbolMap = new Map<string, any>();
    items.forEach((item: any) => {
      const yahooSymbol = toYahooPortfolioSymbol(item.name);
      if (yahooSymbol) symbolMap.set(yahooSymbol, item);
    });
    const yahooSymbols = Array.from(symbolMap.keys());
    const hasForeign = yahooSymbols.some(sym => !sym.endsWith('.IS') && sym !== 'USDTRY=X');
    let fetchSymbols = [...yahooSymbols];
    if (hasForeign && !fetchSymbols.includes('USDTRY=X')) {
      fetchSymbols.push('USDTRY=X');
    }

    // Set time range
    const period1 = new Date();
    let interval = '15m';
    const rangeStr = (range as string).toLowerCase();
    if (rangeStr === '1d' || rangeStr === '1g') { period1.setDate(period1.getDate() - 2); interval = '15m'; }
    else if (rangeStr === '2g') { period1.setDate(period1.getDate() - 3); interval = '15m'; }
    else if (rangeStr === '3g') { period1.setDate(period1.getDate() - 4); interval = '15m'; }
    else if (rangeStr === '1w' || rangeStr === '1h') { period1.setDate(period1.getDate() - 9); interval = '1h'; }

    // Fetch USDTRY rate
    let usdRate = 0;
    try {
      const usdQuote: any = await withYahooSlot(() => (yf as any).quote('USDTRY=X'));
      usdRate = usdQuote.regularMarketPrice || usdQuote.price || 32.5;
    } catch (e) { usdRate = 32.5; }

    // Fetch chart data with bounded concurrency
    const chartResults = await mapWithConcurrency(fetchSymbols, 3, async (sym) => {
      try {
        const chart: any = await withYahooSlot(() => (yf as any).chart(sym, { period1, interval }, { validateResult: false }));
        return {
          symbol: sym,
          quotes: (chart.quotes || []).filter((q: any) => q.close != null)
        };
      } catch (err: any) {
        console.warn(`[PORTFOLIO] ${sym} grafigi cekilemedi:`, err.message);
        return null;
      }
    });
    const validCharts = chartResults.filter(Boolean) as any[];
    // Get all unique timestamps (excluding USDTRY=X)
    const allTimestamps = new Set<number>();
    validCharts.forEach(r => {
      if (r.symbol !== 'USDTRY=X') {
        r.quotes.forEach((q: any) => allTimestamps.add(new Date(q.date).getTime()));
      }
    });
    const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

    const usdQuotes = validCharts.find(r => r.symbol === 'USDTRY=X')?.quotes || [];

    // Calculate portfolio value at each timestamp
    const history = sortedTimestamps.map(ts => {
      let totalValue = 0;

      // Find the closest USDTRY rate at this timestamp
      let usdRateAtTs = usdRate || 32.5;
      if (usdQuotes.length > 0) {
        let closestUsd = usdQuotes[0];
        let minUsdDiff = Infinity;
        for (const q of usdQuotes) {
          const diff = Math.abs(new Date(q.date).getTime() - ts);
          if (diff < minUsdDiff) {
            minUsdDiff = diff;
            closestUsd = q;
          }
        }
        usdRateAtTs = closestUsd.close || usdRateAtTs;
      }

      validCharts.forEach(r => {
        if (r.symbol === 'USDTRY=X') return;
        const item = symbolMap.get(r.symbol);
        if (!item || r.quotes.length === 0) return;

        let closest = r.quotes[0];
        let minDiff = Infinity;
        for (const q of r.quotes) {
          const diff = Math.abs(new Date(q.date).getTime() - ts);
          if (diff < minDiff) { minDiff = diff; closest = q; }
        }

        let stockPrice = closest.close || 0;
        const isBist = r.symbol.endsWith('.IS');
        if (!isBist) {
          stockPrice = stockPrice * usdRateAtTs;
        }

        totalValue += (item.amount || 0) * stockPrice;
      });
      return Math.round(totalValue * 100) / 100;
    });

    const currentValue = history.length > 0 ? history[history.length - 1] : 0;
    const totalCost = items.reduce((acc: number, item: any) => {
      const yahooSymbol = toYahooPortfolioSymbol(item.name);
      const costTL = portfolioCostInTry(item, yahooSymbol, usdRate);
      return acc + (item.amount || 0) * costTL;
    }, 0);
    const previousValue = history.length > 1 ? history[history.length - 2] : totalCost;
    const dailyChange = currentValue - previousValue;
    const dailyChangePercent = previousValue > 0 ? (dailyChange / previousValue) * 100 : 0;

    res.json({
      success: true,
      history,
      timestamps: sortedTimestamps,
      currentValue,
      totalCost,
      dailyChange: Math.round(dailyChange * 100) / 100,
      dailyChangePercent: Math.round(dailyChangePercent * 100) / 100
    });
  } catch (error: any) {
    console.error('Portfolio history error:', error.message);
    res.json({ success: false, history: [], timestamps: [], currentValue: 0, totalCost: 0, dailyChange: 0, dailyChangePercent: 0 });
  }
});

function parsePipelineOptions(req: any) {
  const body = req.body || {};
  const symbols = Array.isArray(body.symbols)
    ? body.symbols.map((symbol: any) => String(symbol)).filter(Boolean)
    : typeof body.symbols === 'string'
      ? body.symbols.split(',').map((symbol: string) => symbol.trim()).filter(Boolean)
      : undefined;

  const years = Number(body.years || req.query?.years || 5);
  const limit = Number(body.limit || req.query?.limit || 0);
  return {
    symbols,
    years: Number.isFinite(years) ? Math.max(1, Math.min(15, Math.floor(years))) : 5,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(120, Math.floor(limit)) : undefined
  };
}

app.get('/api/model-data/status', authMiddleware, async (req: any, res: any) => {
  try {
    const status = await getModelDataStatus();
    res.json({ success: true, status });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/model-data/readiness', authMiddleware, async (req: any, res: any) => {
  try {
    const readiness = await getModelDataReadiness(parsePipelineOptions(req));
    res.json({ success: true, readiness });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/backfill-daily-bars', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await backfillDailyBars(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/sync-macro', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await syncMacroSeries(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/features', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await buildFeatureSnapshots(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/labels', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await generateTrainingLabels(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/backtest', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await runQuantBacktest(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/news-events', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await scoreNewsEvents(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/model-data/run', authMiddleware, async (req: any, res: any) => {
  try {
    const result = await runModelDataPipeline(parsePipelineOptions(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Analiz Endpoint'i
app.get('/api/analysis/bist100', (req, res) => {
  res.json(getBist100Analysis());
});

app.get('/api/analysis/nasdaq100', (req, res) => {
  res.json(getNasdaq100Analysis());
});

app.get('/api/analysis/ai-portfolio', async (req, res) => {
  try {
    const market = req.query.market as string || 'nasdaq';
    const signals = await AiSignal.find({ market }).sort({ createdAt: -1 });
    res.json({ success: true, data: signals });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Arka Plan Analiz Görevi (30 dakikada bir)
setInterval(updateBist100Analysis, 30 * 60 * 1000);
setTimeout(updateBist100Analysis, 10000); // Başlangıçta 10sn sonra çalıştır

setInterval(updateNasdaq100Analysis, 30 * 60 * 1000);
setTimeout(updateNasdaq100Analysis, 20000); // Başlangıçta 20sn sonra çalıştır (staggered)

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Saniyede bir anlık toplam bellek kullanımını (Memory Usage) konsola yazdır
setInterval(() => {
  const memory = process.memoryUsage();
  const toMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  console.log(
    `⚙️ [MEM LOG] RSS: ${toMB(memory.rss)} | Heap Total: ${toMB(memory.heapTotal)} | Heap Used: ${toMB(memory.heapUsed)} | External: ${toMB(memory.external)}`
  );
}, 10000);
