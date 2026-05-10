import { z } from 'zod';

// Technical Indicators Schema
export const TechnicalIndicatorsSchema = z.object({
  rsi: z.number().nullable(),
  macd: z.object({
    value: z.number(),
    signal: z.number(),
    histogram: z.number(),
  }).nullable(),
});

// Stock Data Schema
export const StockDataSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]+\.IS$/, "Symbol must end with .IS"),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  lastUpdated: z.date(),
  indicators: TechnicalIndicatorsSchema,
});

// BoFA Report Schema (Example structure)
export const BofaReportSchema = z.object({
  date: z.date(),
  symbol: z.string().regex(/^[A-Z0-9]+\.IS$/, "Symbol must end with .IS"),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  targetPrice: z.number().nullable(),
  summary: z.string(),
});

// AI Analysis Report Schema
export const AiAnalysisReportSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]+\.IS$/, "Symbol must end with .IS"),
  recommendation: z.enum(['BUY', 'SELL', 'HOLD', 'STRONG_BUY', 'STRONG_SELL']),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  generatedAt: z.date(),
});

// Type exports based on Zod schemas
export type TechnicalIndicators = z.infer<typeof TechnicalIndicatorsSchema>;
export type StockData = z.infer<typeof StockDataSchema>;
export type BofaReport = z.infer<typeof BofaReportSchema>;
export type AiAnalysisReport = z.infer<typeof AiAnalysisReportSchema>;
