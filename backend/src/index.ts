import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import { GoogleGenAI } from '@google/genai';
import { ensureDisclosuresLoaded, getCachedDisclosures, getDisclosuresByStock, getLastFetchTime } from './services/kapService';
import { INDEX_COMPONENTS } from './utils/constants';
import { updateBist100Analysis, getBist100Analysis } from './services/analysisService';

// ... rest of imports
import apiRouter from './routes/api';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

async function translateToTurkish(text: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy') return text;
  if (!text || text.length < 5) return text;
  
  try {
    const prompt = `Sen profesyonel bir finans ve borsa editörüsün. Aşağıdaki İngilizce finans haberini borsa terminolojisine uygun, akıcı bir Türkçeye yerelleştir. Sadece çeviriyi döndür, yorum yapma:\n\n${text}`;
    
    // Projedeki mevcut SDK kullanımına sadık kalıyoruz
    const result = await genAI.models.generateContent({
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
    const heapUsedMB  = Math.round(used.heapUsed  / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssM        = Math.round(used.rss       / 1024 / 1024);
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
const YAHOO_MAX_CONCURRENT = 1; // 1 yapılarak API işlemleri tamamen sıraya alındı (yavaşlatıldı)
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
  try {
    return await fn();
  } finally {
    release();
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
    try {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('portfolios').dropIndex('name_1');
        console.log('🗑️ Eski "name_1" index\'i başarıyla temizlendi.');
      }
    } catch (e) {
      // Index zaten yoksa veya silinmişse sessizce devam et
    }
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));

import yahooFinance from 'yahoo-finance2';
// yahoo-finance2 v3 requires initialization with `new YahooFinance()`
export const yf = new (yahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
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
    const yahooSymbols = rawSymbols.map(s => s.trim().toUpperCase());

    const quotes: any = await (yf as any).quote(yahooSymbols);
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
    const symbols = ['USDTRY=X', 'EURTRY=X', 'GBPTRY=X'];
    
    // Anlık veri çek
    const quotes: any = await (yf as any).quote(symbols);
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
    
    const result = quotesArray.map((q: any) => {
      const code = q.symbol.substring(0, 3);
      // Fiyat için birden fazla kaynağı dene (Yahoo bazen birini boş dönerse diğeri kurtarır)
      const price = q.regularMarketPrice || q.price || q.bid || q.ask || q.regularMarketPreviousClose || 0;
      
      return {
        name: code === 'USD' ? 'Amerikan Doları' : (code === 'EUR' ? 'Euro' : 'İngiliz Sterlini'),
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
  title: { type: String, required: true },
  publisher: { type: String },
  link: { type: String },
  providerPublishTime: { type: Date },
  thumbnail: { type: String },
  content: { type: String }, // Tam metin
}, { timestamps: true });
newsSchema.index({ symbol: 1, providerPublishTime: -1 });
const NewsArticle = mongoose.model('NewsArticle', newsSchema);

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
          '1g': { interval: '15m', limit: 96 },  '1d': { interval: '15m', limit: 96 },
          '2g': { interval: '30m', limit: 96 },  '3g': { interval: '1h',  limit: 72 },
          '1h': { interval: '1h',  limit: 168 }, '1w': { interval: '1h',  limit: 168 },
          '1a': { interval: '2h',  limit: 360 }, '1m': { interval: '2h',  limit: 360 },
          '3a': { interval: '1d',  limit: 90 },  '3m': { interval: '1d',  limit: 90 },
          '1y': { interval: '1d',  limit: 365 }, '1s': { interval: '1d',  limit: 365 },
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
        
        // STRICT ROLLING FILTER (Gram/Çeyrek için de son 24/48/72 saat kesimi)
        if (isGlobal && (r === '1d' || r === '1g' || r === '2g' || r === '3g') && onsQuotes.length > 0) {
          const now = new Date();
          const hoursBack = r === '1g' || r === '1d' ? 24 : (r === '2g' ? 48 : 72);
          const startTime = now.getTime() - (hoursBack * 60 * 60 * 1000);
          onsQuotes = onsQuotes.filter((q: any) => new Date(q.date).getTime() >= startTime);
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
      const uniqueDays = [...new Set(quotes.map((q: any) => {
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
    const { symbol } = req.params;
    const formattedSymbol = symbol.includes('.') || symbol.startsWith('^') || symbol.includes('-')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}.IS`;

    // 1. Önce veritabanına bak (Hem .IS'li hem .IS'siz ara)
    const searchSymbols = [formattedSymbol, formattedSymbol.replace('.IS', '')];
    const dbNews = await NewsArticle.find({ symbol: { $in: searchSymbols } })
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
const INDEX_COMPONENTS: { [key: string]: string[] } = {
  'XU100.IS': [
    'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS', 'ISCTR.IS', 'GARAN.IS', 'BIMAS.IS', 'EREGL.IS', 'SAHOL.IS', 'YKBNK.IS',
    'ASELS.IS', 'SISE.IS', 'FROTO.IS', 'SASA.IS', 'HEKTS.IS', 'ARCLK.IS', 'TOASO.IS', 'ASTOR.IS', 'KONTR.IS', 'YEOTK.IS',
    'EFOR.IS', 'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TKFEN.IS', 'ODAS.IS', 'AKSEN.IS', 'AEFES.IS', 'MGROS.IS',
    'TTKOM.IS', 'TCELL.IS', 'HALKB.IS', 'VAKBN.IS', 'DOHOL.IS', 'SOKM.IS', 'KOZAL.IS', 'KOZAA.IS', 'IPEKE.IS', 'OTKAR.IS',
    'ALARK.IS', 'MAVI.IS', 'CCOLA.IS', 'ULKER.IS', 'GUBRF.IS', 'AGHOL.IS', 'DOAS.IS', 'ZOREN.IS', 'BERA.IS', 'TURSG.IS',
    'SKBNK.IS', 'TSKB.IS', 'VESTL.IS', 'KARSN.IS', 'EGEEN.IS', 'OYAKC.IS', 'KORDS.IS', 'ALBRK.IS', 'BRISA.IS', 'LOGO.IS',
    'QUAGR.IS', 'ASUZU.IS', 'GENIL.IS', 'CWENE.IS', 'ALFAS.IS', 'SDTTR.IS', 'MIATK.IS', 'REEDR.IS', 'SAYAS.IS', 'EUPWR.IS',
    'GESAN.IS', 'SMRTG.IS', 'BRYAT.IS', 'CANTE.IS', 'AKFGY.IS', 'KAYSE.IS', 'ENERY.IS', 'TATEN.IS', 'EBEBK.IS', 'TABGD.IS',
    'VAKFN.IS', 'IZMDC.IS', 'KTSPR.IS', 'BTCIM.IS', 'OYYAT.IS', 'KFEIN.IS', 'ARDYZ.IS', 'FORMT.IS', 'QNBFB.IS', 'BVSAN.IS',
    'MHRGY.IS', 'BORLS.IS', 'BHRGY.IS', 'AVPGY.IS', 'SURGY.IS', 'MEGMT.IS', 'LMKDC.IS', 'MOGAN.IS', 'ENTRA.IS', 'KOTON.IS',
    'AGROT.IS', 'BEGYO.IS', 'CATES.IS', 'SKYMD.IS', 'KUZAY.IS', 'LKMNH.IS', 'PKENT.IS'
  ],
  'XU050.IS': [
    'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS', 'ISCTR.IS', 'GARAN.IS', 'BIMAS.IS', 'EREGL.IS', 'SAHOL.IS', 'YKBNK.IS',
    'ASELS.IS', 'SISE.IS', 'FROTO.IS', 'SASA.IS', 'HEKTS.IS', 'ARCLK.IS', 'TOASO.IS', 'ASTOR.IS', 'KONTR.IS', 'YEOTK.IS',
    'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TKFEN.IS', 'ODAS.IS', 'AKSEN.IS', 'AEFES.IS', 'MGROS.IS', 'TTKOM.IS',
    'TCELL.IS', 'HALKB.IS', 'VAKBN.IS', 'DOHOL.IS', 'SOKM.IS', 'KOZAL.IS', 'KOZAA.IS', 'IPEKE.IS', 'OTKAR.IS', 'ALARK.IS',
    'MAVI.IS', 'CCOLA.IS', 'ULKER.IS', 'GUBRF.IS', 'AGHOL.IS', 'DOAS.IS', 'ZOREN.IS', 'BERA.IS', 'TURSG.IS', 'SKBNK.IS'
  ],
  'XU030.IS': [
    'THYAO.IS', 'TUPRS.IS', 'KCHOL.IS', 'AKBNK.IS', 'ISCTR.IS', 'GARAN.IS', 'BIMAS.IS', 'EREGL.IS', 'SAHOL.IS', 'YKBNK.IS',
    'ASELS.IS', 'SISE.IS', 'FROTO.IS', 'SASA.IS', 'HEKTS.IS', 'ARCLK.IS', 'TOASO.IS', 'ASTOR.IS', 'KONTR.IS', 'YEOTK.IS',
    'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TCELL.IS', 'HALKB.IS', 'VAKBN.IS', 'KOZAL.IS', 'ALARK.IS', 'GUBRF.IS'
  ],
  'XBANK.IS': [
    'AKBNK.IS', 'GARAN.IS', 'ISCTR.IS', 'YKBNK.IS', 'VAKBN.IS', 'HALKB.IS', 'ALBRK.IS', 'SKBNK.IS', 'TSKB.IS', 'QNBFB.IS',
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
    'VRSK', 'LCID', 'MELI', 'ZM', 'ADP', 'PDD', 'SNPS', 'CRWD', 'ATVI', 'DXCM'
  ],
  '^IXIC': [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'COST',
    'NFLX', 'ADBE', 'AMD', 'PEP', 'TMUS', 'INTU', 'CSCO', 'QCOM', 'AMAT', 'TXN'
  ]
};

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
          { upsert: true, new: true }
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

async function syncKapNews() {
  console.log('🚀 [KAP-SYNC] Yeni bildirimler kontrol ediliyor...');
  try {
    await ensureDisclosuresLoaded();
    const disclosures = getCachedDisclosures();
    
    if (!disclosures || disclosures.length === 0) {
      console.log('   [KAP-SYNC] Yeni bildirim bulunamadı.');
      return;
    }

    // Sadece son 50 bildirimi kontrol edelim (Performans için)
    const recentDisclosures = disclosures.slice(0, 50);
    let processedCount = 0;

    for (let i = 0; i < recentDisclosures.length; i += 5) {
      const chunk = recentDisclosures.slice(i, i + 5);
      
      for (const item of chunk) {
        // Zaten var mı kontrolü
        const exists = await NewsArticle.findOne({ uuid: item.disclosureIndex.toString() });
        if (exists) continue;

        let sym = item.stockCodes ? item.stockCodes.split(',')[0].trim() : 'BIST';
        
        // BIST sembollerine .IS ekle (eşleşme için kritik)
        if (sym !== 'BIST' && !sym.includes('.') && !sym.includes('-') && !sym.startsWith('^')) {
          sym = `${sym}.IS`;
        }

        const rawTitle = `${item.kapTitle} - ${item.subject}`;
        const rawContent = item.summary || item.subject;

        console.log(`   [TR] [${sym}] Yeni KAP Haberi Çevriliyor: ${item.kapTitle.substring(0, 40)}...`);

        try {
          const translatedTitle = await translateToTurkish(rawTitle);
          let translatedContent = '';
          
          if (rawContent && rawContent.length > 5) {
            translatedContent = await translateToTurkish(rawContent);
          }

          // Çeviri başarısız olsa bile (zaten Türkçe ise) kaydet
          await NewsArticle.findOneAndUpdate(
            { uuid: item.disclosureIndex.toString() },
            {
              symbol: sym,
              title: translatedTitle,
              publisher: "KAP",
              link: `https://www.kap.org.tr/tr/Bildirim/${item.disclosureIndex}`,
              providerPublishTime: new Date(item.publishDate),
              thumbnail: 'https://images.unsplash.com/photo-1611974717482-58a2527e7446?auto=format&fit=crop&q=80&w=300&h=200',
              content: translatedContent
            },
            { upsert: true, new: true }
          );

          processedCount++;
          console.log(`   [+] [${sym}] KAP Haberi Eklendi: ${translatedTitle.substring(0, 45)}...`);
          
          // Gemini RPM limit koruması
          await new Promise(res => setTimeout(res, 5000));
        } catch (trErr: any) {
          console.error(`   [!] [${sym}] Çeviri hatası:`, trErr.message);
        }
      }

      if (processedCount >= 5) {
        console.log('   [💤] 5 haber işlendi, Gemini limitleri için 30 saniye mola...');
        await new Promise(res => setTimeout(res, 30000));
        processedCount = 0;
      }
    }
    
    console.log('✅ [KAP-SYNC] Senkronizasyon tamamlandı.');
  } catch (err: any) {
    console.error('❌ [KAP-SYNC] Kritik Hata:', err.message);
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
      name: "Beta Enerji ve Teknoloji A.Ş.",
      symbol: "BETAE",
      status: "active",
      date: "23-24-25 Haziran 2026",
      logo: "/logos/BETAE.png",
      details: { 
        price: "40,00 TL", 
        distribution: "Bireysele Eşit Dağıtım", 
        lots: "60.750.000 Lot", 
        manager: "TSKB & Ziraat & Yatırım Finansman", 
        market: "Yıldız Pazar",
        listingDate: "Açıklanmadı",
        participants: "Açıklanmadı",
        perPerson: "Açıklanmadı"
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
  
  if (sym === 'BETAE') {
    return res.json({
      title: "Beta Enerji ve Teknoloji A.Ş.",
      symbol: "BETAE",
      status: "active",
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

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });
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

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });
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
    const totalGlobal = await Portfolio.countDocuments();
    const sample = await Portfolio.findOne();
    console.log(`🔍 [PORTFOLIO] DB Total: ${totalGlobal}, User in Token: ${req.user.userId}`);
    if (sample) console.log(`🔍 [PORTFOLIO] Sample User in DB: ${sample.userId}`);
    
    const items = await Portfolio.find({ userId: req.user.userId }).sort({ createdAt: 1 });
    console.log(`✅ [PORTFOLIO] Found ${items.length} items for this user`);
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
      const isBist = item.name && !item.name.includes('.') && !item.name.includes('-') && !item.name.startsWith('^') && item.name.length <= 5;
      const yahooSymbol = isBist ? `${item.name}.IS` : item.name;
      symbolMap.set(yahooSymbol, item);
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
      const usdQuote: any = await (yf as any).quote('USDTRY=X');
      usdRate = usdQuote.regularMarketPrice || usdQuote.price || 32.5;
    } catch (e) { usdRate = 32.5; }

    // Fetch chart data for all symbols SEQUENTIALLY (Sırayla)
    const validCharts: any[] = [];
    for (const sym of fetchSymbols) {
      try {
        console.log(`[PORTFOLIO] ${sym} geçmiş grafiği çekiliyor... (Sırayla)`);
        const chart: any = await (yf as any).chart(sym, { period1, interval }, { validateResult: false });
        validCharts.push({
          symbol: sym,
          quotes: (chart.quotes || []).filter((q: any) => q.close != null)
        });
        // Sistemi ve ağ kartını yormamak için her istek arasına 500ms bekleme ekle
        await new Promise(res => setTimeout(res, 500));
      } catch (err: any) {
        console.warn(`[PORTFOLIO] ${sym} grafiği çekilemedi:`, err.message);
      }
    }

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
      const isBist = item.name && !item.name.includes('.') && !item.name.includes('-') && !item.name.startsWith('^') && item.name.length <= 5;
      let costTL = item.cost || 0;
      if (!isBist && costTL < 1500) {
        costTL = costTL * usdRate;
      }
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

// Analiz Endpoint'i
app.get('/api/analysis/bist100', (req, res) => {
  res.json(getBist100Analysis());
});

// Arka Plan Analiz Görevi (30 dakikada bir)
setInterval(updateBist100Analysis, 30 * 60 * 1000);
setTimeout(updateBist100Analysis, 10000); // Başlangıçta 10sn sonra çalıştır

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
