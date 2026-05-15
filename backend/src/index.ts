import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

async function translateToTurkish(text: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy') return text;
  if (!text || text.length < 5) return text;
  
  try {
    const prompt = `Aşağıdaki finans haberini profesyonel bir finans diliyle Türkçe'ye çevir. Sadece çeviriyi döndür: \n\n${text}`;
    const result = await genAI.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt
    });
    return result.text.trim();
  } catch (error) {
    console.warn('Translation failed, using original text');
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

    if (pct > 95) {
      console.error(`🚨 [MEM] Heap kritik seviyede: ${heapUsedMB}/${MAX_HEAP_MB} MB (${pct.toFixed(1)}%) — Güvenli çıkış yapılıyor...`);
      process.exit(1); // Node.js temiz kapanır, masaüstü çökmez
    } else if (pct > 85) {
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
async function withYahooSlot<T>(fn: () => Promise<T>): Promise<T> {
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

import YahooFinanceModule from 'yahoo-finance2';
const yahooFinance = new (YahooFinanceModule as any)();

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

// Portföydeki tüm varlıkların fiyatlarını Yahoo Finance'den çek (CollectAPI yerine)
app.get('/api/stocks', authMiddleware, async (req, res) => {
  const t0 = Date.now();
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      return res.json({ success: true, result: [] });
    }

    const rawSymbols = symbolsQuery.split(',');
    const yahooSymbols = rawSymbols.map(s => s.trim().toUpperCase());

    const quotes: any = await (yahooFinance as any).quote(yahooSymbols);
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
    const quotes: any = await (yahooFinance as any).quote(symbols);
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
    
    // Eğer sorgulanan tarih bugün veya gelecekteyse, doğrudan güncel fiyatı dön
    if (new Date(date as string) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
       try {
         const quote: any = await (yahooFinance as any).quote(yahooSymbol);
         return res.json({ success: true, price: quote.regularMarketPrice || quote.price, date: new Date(), isLive: true });
       } catch (e) {
         // Quote başarısız olursa historical'a devam et
       }
    }

    const fromDate = new Date(queryDate);
    fromDate.setDate(fromDate.getDate() - 10); // 10 günlük pencere (Sizin tercihiniz, ideal süre)
    
    const toDate = new Date(queryDate);
    toDate.setDate(toDate.getDate() + 2); 

    // KRİTİK: Historical yerine Chart + validateResult:false kullanmaya devam ediyoruz 
    // Bu sayede hafta sonu boşlukları olsa bile kütüphane hata fırlatmıyor.
    const chartRes: any = await (yahooFinance as any).chart(yahooSymbol, {
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
      let finalPrice = dayData.close || dayData.open || dayData.high || dayData.low;
      
      if (!finalPrice) {
         return res.status(404).json({ success: false, message: 'Fiyat seçilemedi' });
      }

      console.log(`  ✅ Bulunan Fiyat: ${finalPrice.toFixed(4)} (${new Date(dayData.date).toLocaleDateString('tr-TR')})\n`);
      res.json({ success: true, price: finalPrice, date: dayData.date, currency: dayData.currency || 'RAW' });
    } else {
      res.status(404).json({ success: false, message: 'O tarih için veri bulunamadı. (Borsa kapalı olabilir)' });
    }
  } catch (error: any) {
    console.error('Historical Data Error:', error.message);
    
    // Crypto fallbacks or better retry logic could go here
    res.status(500).json({ success: false, message: 'Geçmiş veri alınamadı', error: error.message });
  }
});

// Yahoo Finance'den döviz kurlarını çek (Gelişmiş Fallback Sistemi ile)
app.get('/api/exchange-rate', authMiddleware, async (req, res) => {
  const t0 = Date.now();
  try {
    const symbols = ['USDTRY=X', 'EURTRY=X', 'GBPTRY=X'];
    
    // Anlık veri çek
    const quotes: any = await (yahooFinance as any).quote(symbols);
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
      // Frontend'in beklediği CollectAPI yapısını taklit ediyoruz (kod değişikliği gerekmesin diye)
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
      if (isGlobal) {
        // Global varlıklar için TAM 24/48/72 saat geriye git (Rolling window)
        const hoursBack = r === '1g' || r === '1d' ? 24 : (r === '2g' ? 48 : 72);
        period1.setHours(period1.getHours() - hoursBack);
        console.log(`⏱️ Global Rolling Start: ${period1.toLocaleString()} for ${formattedSymbol}`);
      } else {
        // BIST için: Son 20 gün içinde işlem yapılan en son günü bul
        period1.setDate(period1.getDate() - 20);
      }
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
        const usdData: any = await (yahooFinance as any).quote('USDTRY=X');
        const onsData: any = await (yahooFinance as any).chart('GC=F', { period1, interval: intervalVal }, { validateResult: false });
        
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
          const attempt: any = await (yahooFinance as any).chart(variant, { 
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
            const attempt = await (yahooFinance as any).chart(variant, { period1: fallbackDate, interval: fallbackInterval }, { validateResult: false });
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
    if (!isGlobal && (r === '1d' || r === '1g' || r === '2g' || r === '3g') && quotes.length > 0) {
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

    // GLOBAL ROLLING FILTER (Son 24/48/72 Saat Kesin Kesim)
    if (isGlobal && (r === '1d' || r === '1g' || r === '2g' || r === '3g') && quotes.length > 0) {
      const now = new Date();
      const hoursBack = r === '1g' || r === '1d' ? 24 : (r === '2g' ? 48 : 72);
      const startTime = now.getTime() - (hoursBack * 60 * 60 * 1000);
      
      const filtered = quotes.filter((q: any) => new Date(q.date).getTime() >= startTime);
      if (filtered.length > 0) {
        quotes = filtered;
        console.log(`📊 Global Rolling Filter: ${quotes.length} bars kept for last ${hoursBack}h`);
      }
    }

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
      liveQuote = await (yahooFinance as any).quote(activeSymbol);
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

    // 1. Önce veritabanına bak (kayıtlı içerikli haberleri getir)
    const dbNews = await NewsArticle.find({ symbol: formattedSymbol })
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
    const liveQuote: any = await (yahooFinance as any).quote(formattedSymbol);
    const searchQuery = liveQuote.shortName || liveQuote.longName || formattedSymbol;

    console.log(`📰 Fetching LIVE news fallback for ${searchQuery} (${formattedSymbol})`);
    
    const result: any = await (yahooFinance as any).search(searchQuery, { newsCount: 10 });
    
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

    const response = await fetch(url);
    const html = await response.text();
    
    // Basit metin ayıklama: Paragrafları yakala ve temizle
    const paragraphs = html.match(/<p>(.*?)<\/p>/g) || [];
    const content = paragraphs
      .map(p => p.replace(/<[^>]*>/g, ''))
      .filter(p => p.length > 40)
      .slice(0, 15)
      .join('\n\n');

    res.json({ content: content || 'Haber içeriği şu an çekilemiyor. Lütfen orijinal kaynağı ziyaret edin.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// KAP Bildirimlerini Playwright ile Çek
import { ensureDisclosuresLoaded, getDisclosuresByStock, getCachedDisclosures, getLastFetchTime } from './services/kapService';

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
    'EFORC.IS', 'ENKAI.IS', 'PGSUS.IS', 'KARDM.IS', 'PETKM.IS', 'TKFEN.IS', 'ODAS.IS', 'AKSEN.IS', 'AEFES.IS', 'MGROS.IS',
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
    const quotes: any = await withYahooSlot(() => (yahooFinance as any).quote(mainSymbols));
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

        // KRİPTO: 24 saatlik rolling pencere (Binance standardı)
        if ((symbol === 'BTC-USD' || symbol === 'ETH-USD') && history.length > 0) {
          const startPrice = history[0];
          const currentPrice = history[history.length - 1];
          price = currentPrice;
          change = currentPrice - startPrice;
          changePercent = (change / startPrice) * 100;
        }

        // KALDIRILAN: chart() fallback — eşzamanlı 14 ağır istek yaparak RAM/GPU crash'e yol açıyordu.
        // Spark API boş döndürdüğünde sparkline yok gösteriyoruz (güvenli, hafif).
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
    const quotes: any = await withYahooSlot(() => (yahooFinance as any).quote(mainTickers));
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

// ===== 5'erli Haber Toplayıcı (Background Task) =====
async function collectNewsData() {
  console.log(`📰 [News Collector] Haber toplama başlatıldı...`);
  // BIST 100 bileşenlerini al
  const symbols = INDEX_COMPONENTS['XU100.IS'] || [];
  
  // 5'erli gruplar halinde işle
  const chunkSize = 5;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    console.log(`[News Collector] Grup ${Math.floor(i / chunkSize) + 1}: ${chunk.join(', ')}`);
    
    for (const sym of chunk) {
      try {
        const liveQuote: any = await (yahooFinance as any).quote(sym);
        const searchQuery = liveQuote.shortName || liveQuote.longName || sym;
        const result: any = await (yahooFinance as any).search(searchQuery, { newsCount: 5 });
        
        for (const item of (result.news || [])) {
          if (!item.uuid) continue;
          
          // Veritabanında zaten var mı?
          const exists = await NewsArticle.exists({ uuid: item.uuid });
          if (exists) continue;

          // İçeriği çek (raw fetch ile)
          let content = '';
          try {
             // AbortController ile 5 saniye timeout (sistemi kilitlememesi için)
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 5000);
             const fetchRes = await fetch(item.link, { signal: controller.signal });
             clearTimeout(timeoutId);
             
             const html = await fetchRes.text();
             const paragraphs = html.match(/<p>(.*?)<\/p>/g) || [];
             content = paragraphs
               .map((p: string) => p.replace(/<[^>]*>/g, ''))
               .filter((p: string) => p.length > 40)
               .slice(0, 15)
               .join('\n\n');
          } catch (e) {
             content = 'Haber içeriği çekilemedi veya zaman aşımı.';
          }

          // Çeviri İşlemi (Gemini AI)
          let translatedTitle = item.title;
          let translatedContent = content;

          try {
            console.log(`   [TR] Çevriliyor: ${item.title.substring(0, 30)}...`);
            translatedTitle = await translateToTurkish(item.title);
            if (content && content.length > 50 && !content.includes('çekilemedi')) {
              translatedContent = await translateToTurkish(content);
            }
          } catch (trErr) {
            console.warn('   [!] Çeviri hatası, orijinal metin kullanılacak.');
          }

          // Veritabanına kaydet
          await NewsArticle.create({
            uuid: item.uuid,
            symbol: sym,
            title: translatedTitle,
            publisher: item.publisher,
            link: item.link,
            providerPublishTime: item.providerPublishTime,
            thumbnail: item.thumbnail?.resolutions?.[0]?.url || 'https://images.unsplash.com/photo-1611974717482-58a2527e7446?auto=format&fit=crop&q=80&w=300&h=200',
            content: translatedContent || 'İçerik okunamadı.'
          });
          console.log(`   [+] Haber eklendi (TR): ${translatedTitle.substring(0,30)}...`);
        }
      } catch (err: any) {
        console.warn(`[News Collector] ${sym} hatası:`, err.message);
      }
      // Her hisse arası 1 saniye dinlen
      await new Promise(res => setTimeout(res, 1000));
    }
    // Her 5'li grup arası 3 saniye dinlen
    await new Promise(res => setTimeout(res, 3000));
  }
  console.log(`✅ [News Collector] Tur tamamlandı.`);
}

// Yarım saatte bir (30 * 60 * 1000) çalıştır
setInterval(collectNewsData, 30 * 60 * 1000);
// Başlangıçtan 1 dakika sonra ilk turu at
setTimeout(collectNewsData, 60000);

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
        const quotes: any = await (yahooFinance as any).quote(chunk);
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
    const items = await Portfolio.find({ userId: req.user.userId }).sort({ createdAt: 1 });
    res.json(items);
  } catch (error) {
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
      { upsert: true, new: true, runValidators: true }
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
      const usdQuote: any = await (yahooFinance as any).quote('USDTRY=X');
      usdRate = usdQuote.regularMarketPrice || usdQuote.price || 32.5;
    } catch (e) { usdRate = 32.5; }

    // Fetch chart data for all symbols SEQUENTIALLY (Sırayla)
    const validCharts: any[] = [];
    for (const sym of yahooSymbols) {
      try {
        console.log(`[PORTFOLIO] ${sym} geçmiş grafiği çekiliyor... (Sırayla)`);
        const chart: any = await (yahooFinance as any).chart(sym, { period1, interval }, { validateResult: false });
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

    // Get all unique timestamps
    const allTimestamps = new Set<number>();
    validCharts.forEach(r => r.quotes.forEach((q: any) => allTimestamps.add(new Date(q.date).getTime())));
    const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

    // Calculate portfolio value at each timestamp
    const history = sortedTimestamps.map(ts => {
      let totalValue = 0;
      validCharts.forEach(r => {
        const item = symbolMap.get(r.symbol);
        if (!item || r.quotes.length === 0) return;

        let closest = r.quotes[0];
        let minDiff = Infinity;
        for (const q of r.quotes) {
          const diff = Math.abs(new Date(q.date).getTime() - ts);
          if (diff < minDiff) { minDiff = diff; closest = q; }
        }

        totalValue += (item.amount || 0) * (closest.close || 0);
      });
      return Math.round(totalValue * 100) / 100;
    });

    const currentValue = history.length > 0 ? history[history.length - 1] : 0;
    const totalCost = items.reduce((acc: number, item: any) => acc + (item.amount || 0) * (item.cost || 0), 0);
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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
