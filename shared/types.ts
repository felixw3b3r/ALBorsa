import { z } from 'zod';

// Technical Indicators Schema
export const TechnicalIndicatorsSchema = z.object({
  rsi: z.number().nullable(),
  macd: z.object({
    value: z.number(),
    signal: z.number(),
    histogram: z.number(),
  }).nullable(),
  bollinger: z.object({
    upper: z.number(),
    middle: z.number(),
    lower: z.number(),
    pb: z.number(),
  }).nullable().optional(),
  ema: z.object({
    ema20: z.number().nullable(),
    ema50: z.number().nullable(),
  }).nullable().optional(),
  signals: z.object({
    rsiStatus: z.string(),
    trend: z.string(),
  }).optional(),
});

// Stock Data Schema
export const StockDataSchema = z.object({
  symbol: z.string().regex(/^[a-zA-Z0-9^.=-]+$/, "Invalid symbol format"),
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
  symbol: z.string().regex(/^[a-zA-Z0-9^.=-]+$/, "Invalid symbol format"),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  targetPrice: z.number().nullable(),
  summary: z.string(),
});

// AI Analysis Report Schema
export const AiAnalysisReportSchema = z.object({
  symbol: z.string().regex(/^[a-zA-Z0-9^.=-]+$/, "Invalid symbol format"),
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
