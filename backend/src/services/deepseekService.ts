import axios from 'axios';
import type { QuantSignal } from './quantModel';

export interface DeepSeekAnalysis {
  karar: string;
  olasilik_yuzdesi: number;
  neden: string;
  stop_loss: number;
  take_profit: number;
  timestamp: number;
}

// Legacy function kept for compatibility. The active quant model does not use
// DeepSeek as the decision maker anymore; DeepSeek only explains model output.
export async function fetchDeepSeekAnalysis(data: {
  hisse_adi: string;
  anlik_fiyat: number;
  indikatorler: {
    adx: number;
    vwap_sapma: number;
    hacim_orani: number;
    rsi_anlik: number;
    rsi_onceki: number;
    atr: number;
  }
}): Promise<DeepSeekAnalysis | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('[DEEPSEEK] API Key missing.');
    return null;
  }

  const prompt = `
Return ONLY valid JSON in Turkish.
Use the provided technical state to produce a short trade signal.

Stock: ${data.hisse_adi}
Current Price: ${data.anlik_fiyat}
ADX: ${data.indikatorler.adx}
VWAP deviation: ${data.indikatorler.vwap_sapma}
Volume ratio: ${data.indikatorler.hacim_orani}
RSI current: ${data.indikatorler.rsi_anlik}
RSI previous: ${data.indikatorler.rsi_onceki}
ATR: ${data.indikatorler.atr}

{
  "karar": "GUCLU_AL" | "KADEMELI_AL" | "IZLE" | "AZALT",
  "olasilik_yuzdesi": integer,
  "neden": "...",
  "stop_loss": number,
  "take_profit": number
}
  `;

  try {
    const response = await axios.post('https://api.deepseek.com/chat/completions', {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: 'Sen bir kantitatif finans asistanisin. Sadece JSON dondurursun.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const result = response.data.choices[0].message.content;
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    return {
      ...parsed,
      timestamp: Date.now()
    };
  } catch (error: any) {
    console.error(`[DEEPSEEK] API error for ${data.hisse_adi}:`, error.response?.data || error.message);
    return null;
  }
}

export async function fetchDeepSeekQuantExplanation(data: {
  hisse_adi: string;
  anlik_fiyat: number;
  quant: QuantSignal;
}): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const prompt = `
Deterministik kantitatif modelin ciktisini Turkce ve kisa sekilde acikla.
Karari, olasiligi, hedefi veya stop seviyesini DEGISTIRME.
Sadece modelin neden bu sonuca vardigini 1-2 cumlede anlat.

Hisse: ${data.hisse_adi}
Fiyat: ${data.anlik_fiyat}
Karar: ${data.quant.decision}
Endeksi yenme olasiligi: ${data.quant.probability}
Guven: ${data.quant.confidence}
Firsat skoru: ${data.quant.opportunityScore}
Risk skoru: ${data.quant.riskScore}
Piyasa rejimi: ${data.quant.regime}
Beklenen 20 gunluk alpha: ${data.quant.expectedAlpha20d}
Faktorler: ${JSON.stringify(data.quant.factorScores)}
Teshis: ${JSON.stringify(data.quant.diagnostics)}
Model gerekceleri: ${data.quant.reasons.join(' | ')}

STRICT JSON:
{ "neden": "..." }
  `;

  try {
    const response = await axios.post('https://api.deepseek.com/chat/completions', {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: 'Sen kantitatif modeli aciklayan bir finans asistanisin. Sadece JSON dondurursun; yatirim tavsiyesi dili kullanmazsin.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const result = response.data.choices[0].message.content;
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    return typeof parsed?.neden === 'string' ? parsed.neden : null;
  } catch (error: any) {
    console.error(`[DEEPSEEK] Quant explanation error for ${data.hisse_adi}:`, error.response?.data || error.message);
    return null;
  }
}
