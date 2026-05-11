import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware (Her şeyden ÖNCE gelmeli!)
app.use(cors());
app.use(express.json());

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
  try {
    // Portföydeki tüm isimleri alıp Yahoo formatına çeviriyoruz
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      return res.json({ success: true, result: [] });
    }

    const rawSymbols = symbolsQuery.split(',');
    const yahooSymbols = rawSymbols.map(s => s.trim().toUpperCase());

    console.log('📈 Batch fetching from Yahoo:', yahooSymbols);
    const quotes: any = await (yahooFinance as any).quote(yahooSymbols);
    const result = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
      code: q.symbol.replace('.IS', ''),
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice || q.price || q.bid || q.ask || 0,
      lastprice: q.regularMarketPrice || q.price || 0,
      rate: q.regularMarketChangePercent || 0,
      currency: q.currency,
      updatedAt: new Date()
    }));

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Yahoo Stocks Error:', error.message);
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
    
    // Gelen veriyi frontend'in daha kolay okuyabileceği sade bir formata çevirelim
    const result = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
      code: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice,
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

    console.log(`📜 Fetching historical data for ${yahooSymbol} (${market}) on ${date}`);
    
    // Tarihi Yahoo formatına çevir (Hafta sonlarını kapsamak için 7 günlük bir pencere tarayalım)
    const queryDate = new Date(date as string);
    const today = new Date();
    
    // Eğer sorgulanan tarih bugün veya gelecekteyse, doğrudan güncel fiyatı dön
    if (queryDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
       try {
         const quote: any = await (yahooFinance as any).quote(yahooSymbol);
         return res.json({ success: true, price: quote.regularMarketPrice || quote.price, date: new Date(), isLive: true });
       } catch (e) {
         // Quote başarısız olursa historical'a devam et
       }
    }

    const fromDate = new Date(queryDate);
    fromDate.setDate(fromDate.getDate() - 7); 
    
    const toDate = new Date(queryDate);
    toDate.setDate(toDate.getDate() + 2); // Birkaç gün sonrasını da kapsa (hafta sonu vs)

    const results: any = await (yahooFinance as any).historical(yahooSymbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d'
    });

    if (results && results.length > 0) {
      // Sorgulanan tarihe en yakın (ama o tarihten sonra olmayan) veriyi bul
      const validResults = results.filter((r: any) => new Date(r.date) <= queryDate)
                                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const dayData = validResults[0] || results[results.length - 1];
      let finalPrice = dayData.close || dayData.adjClose || dayData.regularMarketPrice;

      if (!finalPrice && results.length > 0) finalPrice = results[results.length-1].close;
      
      if (!finalPrice) {
         return res.status(404).json({ success: false, message: 'Fiyat bulunamadı' });
      }

      // Eğer NASDAQ ise TL'ye çevir (Tarihsel Kur ile)
      if (market === "NASDAQ 500") {
        try {
          const exchangeResults: any = await (yahooFinance as any).historical('USDTRY=X', {
            period1: fromDate,
            period2: toDate,
            interval: '1d'
          });
          if (exchangeResults && exchangeResults.length > 0) {
            const histRate = exchangeResults[exchangeResults.length - 1].close;
            finalPrice = finalPrice * histRate;
            console.log(`💱 Historical USD/TRY rate on ${date}: ${histRate}`);
          }
        } catch (exErr) {
          console.warn('Could not fetch historical exchange rate, returning USD price');
        }
      }

      res.json({ success: true, price: finalPrice, date: dayData.date, currency: market === "NASDAQ 500" ? 'TL (Converted from USD)' : 'TL' });
    } else {
      res.status(404).json({ success: false, message: 'O tarih için veri bulunamadı. (Borsa kapalı olabilir)' });
    }
  } catch (error: any) {
    console.error('Historical Data Error:', error.message);
    
    // Crypto fallbacks or better retry logic could go here
    res.status(500).json({ success: false, message: 'Geçmiş veri alınamadı', error: error.message });
  }
});

// Yahoo Finance'den döviz kurlarını çek (CollectAPI yerine)
app.get('/api/exchange-rate', authMiddleware, async (req, res) => {
  try {
    console.log('🌍 Fetching currency rates from Yahoo Finance...');
    const symbols = ['USDTRY=X', 'EURTRY=X', 'GBPTRY=X'];
    const quotes: any = await (yahooFinance as any).quote(symbols);
    
    const result = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => {
      const code = q.symbol.substring(0, 3);
      return {
        name: code === 'USD' ? 'Amerikan Doları' : (code === 'EUR' ? 'Euro' : 'İngiliz Sterlini'),
        code: code,
        buying: q.regularMarketPrice,
        selling: q.regularMarketPrice, // Yahoo'da tek fiyat
      };
    });
    
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

app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    let { range = '1d', interval = '15m' } = req.query as any;

    // Sembolü hazırla: Eğer nokta, şapka veya tire yoksa ve 5 karakterse .IS ekle
    let formattedSymbol = symbol.toUpperCase();
    if (!formattedSymbol.includes('.') && !formattedSymbol.startsWith('^') && !formattedSymbol.includes('-') && formattedSymbol.length >= 5) {
      formattedSymbol = `${formattedSymbol}.IS`;
    }

    // Hassasiyet ayarları
    // Hassasiyet ayarları (User Request) - Hem Türkçe hem İngilizce kısaltmaları destekle
    let intervalVal: any = '1d';
    // Zaman aralığını hesapla (Kütüphane range desteklemiyor, period1 zorunlu) - Saatleri sıfırla (Garantici yöntem)
    const period1 = new Date();
    period1.setHours(0, 0, 0, 0);
    
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
          '1a': { interval: '4h',  limit: 180 }, '1m': { interval: '4h',  limit: 180 },
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
    // ===== KRİPTO SONU =====


    if (r === '1d' || r === '1g' || r === '2g' || r === '3g') {
      intervalVal = '15m';
      period1.setDate(period1.getDate() - 14); 
    } else if (r === '1w' || r === '1h') {
      intervalVal = '30m';
      period1.setDate(period1.getDate() - 14);
    } else if (r === '1m' || r === '1a' || r === '3m' || r === '3a' || r === '1y' || r === '1s') {
      // KRİTİK: BIST endeksleri için Yahoo '1d' (günlük) geçmişi vermiyor, ama '1h' (saatlik) veriyor.
      // Bu yüzden tüm uzun vadeli BIST grafiklerinde saatlik hassasiyeti zorunlu kılıyoruz.
      intervalVal = formattedSymbol.endsWith('.IS') ? '1h' : '1d';
      
      if (r === '1m' || r === '1a') period1.setMonth(period1.getMonth() - 1);
      else if (r === '3m' || r === '3a') period1.setMonth(period1.getMonth() - 3);
      else period1.setFullYear(period1.getFullYear() - 1);
    }

    // Dinamik Sembol ve Hassasiyet Avcısı: Yahoo bazen nazlanır
    let chart: any = null;
    let quotes: any[] = [];
    
    // Denenecek semboller ve hassasiyetler
    const symbolVariants = [formattedSymbol];
    if (!formattedSymbol.startsWith('^')) symbolVariants.push(`^${formattedSymbol.replace('.IS', '')}`);
    if (formattedSymbol.endsWith('.IS')) symbolVariants.push(formattedSymbol.replace('.IS', ''));

    const intervalsToTry = [intervalVal, '1h', '1d'];

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
            console.log(`✅ Success: ${variant} with ${inv}`);
            break outerLoop;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // GENEL FALLBACK: Hala veri yoksa geniş aralığı dene
    if (quotes.length === 0) {
      console.log(`⚠️ No data found anywhere for ${formattedSymbol}, trying broad fallback...`);
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

    // AKILLI İŞLEM GÜNÜ FİLTRESİ (1G, 2G, 3G İçin) - Sayısal Sıralama ile Hatasız
    if ((r === '1d' || r === '1g' || r === '2g' || r === '3g') && quotes.length > 0) {
      // 1. Tüm benzersiz işlem günlerini gece yarısına yuvarlayarak sayısal (timestamp) olarak bul
      const uniqueDays = [...new Set(quotes.map((q: any) => {
        const d = new Date(q.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }))].sort((a, b) => b - a); // En yeni gün en başta (Sayısal sıralama)

      // 2. İstenen gün sayısını belirle
      let daysToKeep = 1;
      if (r === '2g') daysToKeep = 2;
      else if (r === '3g') daysToKeep = 3;

      // 3. Sadece en son 'daysToKeep' kadar benzersiz güne ait verileri tut
      const targetDays = uniqueDays.slice(0, daysToKeep);
      quotes = quotes.filter((q: any) => {
        const d = new Date(q.date);
        d.setHours(0, 0, 0, 0);
        return targetDays.includes(d.getTime());
      });
    }

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
    
    res.json({
      symbol: activeSymbol,
      name: liveQuote?.shortName || liveQuote?.longName || activeSymbol,
      price: liveQuote?.regularMarketPrice || liveQuote?.price || liveQuote?.bid || liveQuote?.regularMarketPreviousClose || (history.length > 0 ? history[history.length - 1] : 0),
      change: liveQuote?.regularMarketChange || 0,
      changePercent: liveQuote?.regularMarketChangePercent || 0,
      category: activeSymbol.startsWith('^') ? 'Global Endeksler' : 'Borsa İstanbul',
      history,
      timestamps
    });

  } catch (error: any) {
    console.error(`Error for ${req.params.symbol}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Hisseye Özel Haberler (Yahoo Finance)
app.get('/api/stocks/:symbol/news', async (req, res) => {
  try {
    const { symbol } = req.params;
    const formattedSymbol = symbol.includes('.') || symbol.startsWith('^') || symbol.includes('-')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}.IS`;

    // Daha iyi sonuç için şirketin adını da alalım
    const liveQuote: any = await (yahooFinance as any).quote(formattedSymbol);
    const searchQuery = liveQuote.shortName || liveQuote.longName || formattedSymbol;

    console.log(`📰 Fetching news for ${searchQuery} (${formattedSymbol})`);
    
    // Sadece sembolle değil, isimle arama yapıyoruz (Daha alakalı sonuçlar için)
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

// KAP Bildirimlerini Arşivden Çek ve Analiz Et
app.get('/api/stocks/:symbol/kap', async (req, res) => {
  res.json([]); 
});

// Endeks Bileşenlerini Getir (Batch Fetching)
app.get('/api/stocks/:symbol/components', async (req, res) => {
  try {
    const { symbol } = req.params;
    const formattedSymbol = symbol.includes('.') || symbol.startsWith('^') || symbol.includes('-')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}.IS`;

    const componentSymbols = INDEX_COMPONENTS[formattedSymbol] || [];
    if (componentSymbols.length === 0) return res.json([]);

    console.log(`🚀 Fetching ${componentSymbols.length} components for ${formattedSymbol}`);
    
    // Toplu veri çekme
    const quotes: any = await (yahooFinance as any).quote(componentSymbols);
    const data = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
      symbol: q.symbol.replace('.IS', ''),
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      history: [] // Özet için history boş olabilir
    }));
    res.json(data);
  } catch (error: any) {
    console.error('Components fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
    // 1. Global Cache Kontrolü (5 dakika - Sequential fetch uzun sürdüğü için)
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && marketSummaryCache && (Date.now() - marketSummaryCache.timestamp < 300000)) {
      console.log("🚀 Serving Global Market Summary from Cache");
      return res.json(marketSummaryCache.data);
    }

    const mainSymbols = [
      'XU100.IS', 'XU050.IS', 'XU030.IS', 'XBANK.IS', 'XUTEK.IS',
      '^GSPC', '^NDX', '^IXIC', '^SOX', '^NYFANG', '^NBI',
      'BTC-USD', 'ETH-USD'
    ];

    console.log(`📊 Batch processing market summary for ${mainSymbols.length} tickers`);

    // 2. Yahoo'dan toplu fiyatları çek
    const quotes: any = await (yahooFinance as any).quote(mainSymbols);
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

        // KRİPTO İÇİN VERİ TUTARLILIĞI: Eğer kripto ise ve Binance verimiz varsa, 
        // Yahoo'nun tutarsız değişim verisi yerine Binance trendine göre hesapla
        if ((symbol === 'BTC-USD' || symbol === 'ETH-USD') && history.length > 0) {
          const startPrice = history[0];
          const currentPrice = history[history.length - 1];
          price = currentPrice;
          change = currentPrice - startPrice;
          changePercent = (change / startPrice) * 100;
        }

        // Spark API boş döndürdüyse chart() fallback'ini kullan (BIST vb. için)
        if (history.length < 5 && !['BTC-USD', 'ETH-USD'].includes(symbol)) {
          try {
            const sparklineDate = new Date();
            sparklineDate.setDate(sparklineDate.getDate() - 14);
            const chart: any = await (yahooFinance as any).chart(symbol, { period1: sparklineDate, interval: '15m' }, { validateResult: false });
            let sparkQuotes = (chart.quotes || []).filter((q: any) => q.close != null);
            
            if (sparkQuotes.length > 5) {
              const lastDate = new Date(sparkQuotes[sparkQuotes.length - 1].date);
              sparkQuotes = sparkQuotes.filter((q: any) => {
                const d = new Date(q.date);
                return d.getDate() === lastDate.getDate() && d.getMonth() === lastDate.getMonth();
              });
              history = sparkQuotes.map((q: any) => q.close);
            }
          } catch (e) { /* fallback fail */ }
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
    const quotes: any = await (yahooFinance as any).quote(mainTickers);
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

// İlk açılışta bir kez çalıştır
setTimeout(collectMarketData, 5000);

const componentsCache: { [key: string]: { data: any, timestamp: number } } = {};
const CACHE_DURATION = 30 * 1000; // 30 saniye

// Endeks bileşenlerini getir (SÜPER HIZLI - BATCH MODE)
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

    // 2. TOPLU SORGU (Tüm hisseleri tek seferde iste)
    // yahooFinance.quote bir array kabul eder ve tek bir HTTP isteği atar.
    const quotes: any = await (yahooFinance as any).quote(components);
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    const results = quotesArray.map((quote: any) => ({
      symbol: quote.symbol,
      name: quote.shortName || quote.symbol.split('.')[0],
      price: quote.regularMarketPrice || quote.price || quote.bid || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0
    }));

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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
