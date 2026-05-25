const mongoose = require('mongoose');
const dotenv = require('dotenv');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bistai';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy';

const newsSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  title: { type: String, required: true },
  publisher: { type: String },
  link: { type: String },
  providerPublishTime: { type: Date },
  thumbnail: { type: String },
  content: { type: String },
}, { timestamps: true });

const NewsArticle = mongoose.model('NewsArticle', newsSchema);

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function translateToTurkish(text) {
  if (GEMINI_API_KEY === 'dummy') return text;
  if (!text || text.length < 5) return text;
  try {
    const prompt = `Sen profesyonel bir finans ve borsa editörüsün. Aşağıdaki İngilizce finans haberini borsa terminolojisine uygun, akıcı bir Türkçeye yerelleştir. Sadece çeviriyi döndür, yorum yapma:\n\n${text}`;
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return (result.text || '').trim();
  } catch (error) {
    console.warn(`   [!] Çeviri başarısız (${error.message}), orijinal metin döndürülüyor...`);
    return text;
  }
}

async function runSync() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('Fetching KAP disclosures...');
    const response = await axios.post(
      'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
      {
        pageSize: 50,
        pageIndex: 0,
        disclosureClass: "ALL",
        disclosureType: "ALL",
        stockCodes: "",
        memberType: "ALL",
        subject: "",
        orderByField: "publishDate",
        orderByType: "desc"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
        },
        timeout: 20000
      }
    );

    const disclosures = response.data;
    console.log(`Fetched ${disclosures.length} disclosures`);

    for (const item of disclosures.slice(0, 10)) {
      let sym = item.stockCodes ? item.stockCodes.split(',')[0].trim() : 'BIST';
      if (sym !== 'BIST' && !sym.includes('.') && !sym.includes('-')) {
        sym = `${sym}.IS`;
      }

      const exists = await NewsArticle.findOne({ uuid: item.disclosureIndex.toString() });
      if (exists) {
        console.log(`[${sym}] Already exists: ${item.disclosureIndex}`);
        continue;
      }

      const rawTitle = `${item.kapTitle} - ${item.subject}`;
      console.log(`[${sym}] Processing: ${rawTitle}`);

      const translatedTitle = await translateToTurkish(rawTitle);
      
      await NewsArticle.findOneAndUpdate(
        { uuid: item.disclosureIndex.toString() },
        {
          symbol: sym,
          title: translatedTitle,
          publisher: "KAP",
          link: `https://www.kap.org.tr/tr/Bildirim/${item.disclosureIndex}`,
          providerPublishTime: new Date(item.publishDate),
          thumbnail: 'https://images.unsplash.com/photo-1611974717482-58a2527e7446?auto=format&fit=crop&q=80&w=300&h=200',
          content: item.summary || item.subject
        },
        { upsert: true, new: true }
      );
      console.log(`[${sym}] Saved!`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

runSync();
