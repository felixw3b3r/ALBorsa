const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bistai';

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

async function checkNews() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const count = await NewsArticle.countDocuments();
    console.log(`Total news articles: ${count}`);

    const latest = await NewsArticle.find().sort({ createdAt: -1 }).limit(10);
    latest.forEach(n => {
      console.log(`- [${n.symbol}] ${n.title.substring(0, 50)}... (${n.createdAt})`);
    });

    const thyaoNews = await NewsArticle.find({ symbol: 'THYAO.IS' });
    console.log(`News for THYAO.IS: ${thyaoNews.length}`);
    
    const thyaoRawNews = await NewsArticle.find({ symbol: 'THYAO' });
    console.log(`News for THYAO (raw): ${thyaoRawNews.length}`);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkNews();
