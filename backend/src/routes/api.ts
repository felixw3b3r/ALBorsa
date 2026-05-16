import { Router } from 'express';
import { fetchStockData } from '../services/yahooFinance';
import { getTechnicalSummary } from '../utils/technicalAnalysis';
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
    
    // 3. Professional Technical Analysis
    const technicals = getTechnicalSummary(stockData.closePrices);

    // 4. AI Analysis via Gemini 1.5 Flash (Enhanced with more data)
    const prompt = `
    Analyze the stock ${formattedSymbol}. 
    Current Price: ${stockData.price} TL
    Change: ${stockData.changePercent.toFixed(2)}%

    Technical Indicators:
    - RSI: ${technicals.rsi?.toFixed(2)} (${technicals.signals.rsiStatus})
    - MACD: Value ${technicals.macd?.value.toFixed(2)}, Signal ${technicals.macd?.signal.toFixed(2)}, Hist ${technicals.macd?.histogram.toFixed(2)}
    - Bollinger Bands: Upper ${technicals.bollinger?.upper.toFixed(2)}, Lower ${technicals.bollinger?.lower.toFixed(2)}
    - EMA Trend: EMA20: ${technicals.ema.ema20?.toFixed(2)}, EMA50: ${technicals.ema.ema50?.toFixed(2)} (Trend: ${technicals.signals.trend})

    Provide a professional stock analysis recommendation (BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL) and detailed reasoning in Turkish.
    Return only as JSON with keys "recommendation", "confidence" (0-100), and "reasoning".
    `;
    
    let analysisResult;
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy') {
        throw new Error('No API key');
      }
      const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      
      const text = (response.text as any) || '';
      const jsonStr = text?.replace(/```json\n?|\n?```/g, '').trim() || '{}';
      analysisResult = JSON.parse(jsonStr);
    } catch (aiError) {
      console.error('AI Analysis failed:', aiError);
      analysisResult = {
        recommendation: "HOLD",
        confidence: 50,
        reasoning: "AI analizi şu an yapılamıyor. Teknik verileri manuel inceleyin."
      };
    }

    const finalResponse = {
      symbol: formattedSymbol,
      price: stockData.price,
      changePercent: stockData.changePercent,
      indicators: technicals,
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

export default router;
