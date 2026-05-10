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

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new (YahooFinance as any)();

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
    const quotes = await yahooFinance.quote(yahooSymbols);
    const result = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
      code: q.symbol.replace('.IS', ''),
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice,
      lastprice: q.regularMarketPrice,
      rate: q.regularMarketChangePercent,
      currency: q.currency,
      updatedAt: new Date()
    }));

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Yahoo Stocks Error:', error.message);
    res.status(500).json({ success: false, message: 'Fiyatlar alınamadı' });
  }
});

// Yahoo Finance'den global hisse ve borsa verilerini çek
app.get('/api/yahoo', authMiddleware, async (req, res) => {
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      return res.status(400).json({ success: false, message: 'Lütfen sembolleri virgülle ayırarak belirtin (Örn: ?symbols=AAPL,TSLA,THYAO.IS)' });
    }

    const symbols = symbolsQuery.split(',').map(s => s.trim().toUpperCase());
    console.log(`📈 Fetching Yahoo Finance data for: ${symbols.join(', ')}`);
    
    // Yahoo Finance API'sinden çoklu fiyat sorgusu
    const quotes = await yahooFinance.quote(symbols);
    
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
         const quote = await yahooFinance.quote(yahooSymbol);
         return res.json({ success: true, price: quote.regularMarketPrice || quote.price, date: new Date(), isLive: true });
       } catch (e) {
         // Quote başarısız olursa historical'a devam et
       }
    }

    const fromDate = new Date(queryDate);
    fromDate.setDate(fromDate.getDate() - 7); 
    
    const toDate = new Date(queryDate);
    toDate.setDate(toDate.getDate() + 2); // Birkaç gün sonrasını da kapsa (hafta sonu vs)

    const results = await yahooFinance.historical(yahooSymbol, {
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
          const exchangeResults = await yahooFinance.historical('USDTRY=X', {
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
    const quotes = await yahooFinance.quote(symbols);
    
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

// Portfolio Schema & Model
const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true, default: 0 },
  cost: { type: Number, required: true, default: 0 },
  purchaseDate: { type: Date, default: Date.now },
  color: { type: String, default: '#8b00e8' },
}, { timestamps: true });

// User bazlı unique index (Bir kullanıcı aynı hisseden sadece bir tane ekleyebilir)
portfolioSchema.index({ userId: 1, name: 1 }, { unique: true });

const Portfolio = mongoose.model('Portfolio', portfolioSchema);

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
