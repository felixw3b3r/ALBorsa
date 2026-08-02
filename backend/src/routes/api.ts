import { Router } from 'express';
import { fetchStockData } from '../services/yahooFinance';
import { buildQuantSignal } from '../services/quantModel';
import { fetchDeepSeekQuantExplanation } from '../services/deepseekService';
import { redisClient, withYahooSlot } from '../index';

import { INDEX_COMPONENTS } from '../utils/constants';

const router = Router();

function normalizeAnalysisSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.includes('.') || normalized.includes('-') || normalized.startsWith('^')) {
    return normalized;
  }
  const isNasdaq = INDEX_COMPONENTS.NASDAQ100.includes(normalized);
  if (isNasdaq) {
    return normalized;
  }
  return `${normalized}.IS`;
}

router.get('/analyze/:symbol', async (req, res) => {
  const formattedSymbol = normalizeAnalysisSymbol(req.params.symbol);
  const cleanSymbol = formattedSymbol.replace('.IS', '');
  const cacheKey = `quant-analysis:${formattedSymbol}`;

  try {
    try {
      if (redisClient.isReady) {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) return res.json(JSON.parse(cachedData));
      }
    } catch (cacheErr) {
      console.warn('[QUANT] Redis get skipped.');
    }

    const [stockData, indexData] = await Promise.all([
      withYahooSlot(() => fetchStockData(formattedSymbol)),
      withYahooSlot(() => fetchStockData('XU100.IS'))
    ]);

    const quant = buildQuantSignal({
      symbol: cleanSymbol,
      quotes: stockData.ohlc,
      indexQuotes: indexData.ohlc
    });

    const deepSeekExplanation = await fetchDeepSeekQuantExplanation({
      hisse_adi: cleanSymbol,
      anlik_fiyat: stockData.price,
      quant
    });

    const reasoning = deepSeekExplanation || quant.reasons.join(' ');
    const finalResponse = {
      symbol: formattedSymbol,
      price: stockData.price,
      changePercent: stockData.changePercent,
      indicators: quant.indicators,
      quant,
      deepseek: {
        karar: quant.decision,
        olasilik_yuzdesi: quant.probability,
        neden: reasoning,
        stop_loss: quant.stopLoss,
        take_profit: quant.takeProfit,
        timestamp: Date.now()
      },
      analysis: {
        recommendation: quant.decision,
        confidence: quant.confidence,
        reasoning
      },
      timestamp: new Date()
    };

    try {
      if (redisClient.isReady) {
        await redisClient.setEx(cacheKey, 900, JSON.stringify(finalResponse));
      }
    } catch (cacheErr) {
      console.warn('[QUANT] Redis set skipped.');
    }

    res.json(finalResponse);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
