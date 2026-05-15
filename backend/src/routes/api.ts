import { Router } from 'express';
import { fetchStockData } from '../services/yahooFinance';
import { calculateRSI, calculateMACD } from '../utils/technicalAnalysis';
import { GoogleGenAI } from '@google/genai';
import { redisClient } from '../index';

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

router.get('/analyze/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const formattedSymbol = symbol.endsWith('.IS') ? symbol : `${symbol}.IS`;

  try {
    let cachedData = null;
    try {
      if (redisClient.isReady) {
        cachedData = await redisClient.get(`analysis:${formattedSymbol}`);
      }
    } catch(e) {
      console.warn("Redis get failed");
    }
    
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // 2. Fetch Data
    const stockData = await fetchStockData(formattedSymbol);
    
    // 3. Technical Analysis
    const rsi = calculateRSI(stockData.closePrices);
    const macd = calculateMACD(stockData.closePrices);

    // 4. AI Analysis via Gemini 1.5 Flash
    const prompt = `Analyze the stock ${formattedSymbol}. Current Price: ${stockData.price}. RSI: ${rsi}. MACD: ${JSON.stringify(macd)}. Give a recommendation (BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL) and reasoning. Return as JSON with keys "recommendation", "confidence" (0-100), and "reasoning".`;
    
    let analysisResult;
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy') {
        throw new Error('No API key');
      }
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: prompt,
      });
      
      const text = (response.text as any) || '';
      // Strip markdown code block if present
      const jsonStr = text?.replace(/```json\n?|\n?```/g, '').trim() || '{}';
      analysisResult = JSON.parse(jsonStr);
    } catch (aiError) {
      console.error('AI Analysis failed or no API key:', aiError);
      analysisResult = {
        recommendation: "HOLD",
        confidence: 50,
        reasoning: "AI analysis temporarily unavailable or API key missing."
      };
    }

    const finalResponse = {
      symbol: formattedSymbol,
      price: stockData.price,
      changePercent: stockData.changePercent,
      indicators: { rsi, macd },
      analysis: analysisResult,
      timestamp: new Date()
    };

    // 5. Cache result
    try {
      if (redisClient.isReady) {
        await redisClient.setEx(`analysis:${formattedSymbol}`, 3600, JSON.stringify(finalResponse));
      }
    } catch (e) {
      console.warn("Redis set failed");
    }

    res.json(finalResponse);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Basit stok verisi çekme rotası
router.get('/stocks/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await fetchStockData(symbol);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
