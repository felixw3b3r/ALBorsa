import axios from 'axios';

export interface DeepSeekAnalysis {
  karar: "GÜÇLÜ_AL" | "AL" | "BEKLE" | "SAT";
  olasilik_yuzdesi: number;
  neden: string;
  stop_loss: number;
  take_profit: number;
  timestamp: number;
}

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
    console.error("❌ [DEEPSEEK] API Key missing!");
    return null;
  }

  const prompt = `
### QUANTITATIVE ANALYSIS REQUEST
**Role**: Senior Quantitative Strategist at a Global Hedge Fund
**Context**: 15-30 minute probabilistic trade signal generation

---
### [1] MARKET & ASSET STATE
- **Stock**: ${data.hisse_adi}
- **Current Price**: ${data.anlik_fiyat} TRY
- **Volatility (ATR)**: ${data.indikatorler.atr} TRY

---
### [2] TECHNICAL INDICATOR REPORT
- **Trend Strength (ADX)**: ${data.indikatorler.adx}
  *(Guidance: <20 Range, >25 Developing, >40 Strong Trend)*
- **Institutional Cost (VWAP)**: ${data.indikatorler.vwap_sapma}% ${data.indikatorler.vwap_sapma > 0 ? 'Above' : 'Below'}
- **Volume Momentum**: ${data.indikatorler.hacim_orani}x vs. 10m Average
- **Relative Strength (RSI)**:
  - Current: ${data.indikatorler.rsi_anlik}
  - Previous: ${data.indikatorler.rsi_onceki}

---
### [3] STRATEGIC MANDATE
Synthesize the data above. Focus on identifying:
1. **Mean Reversion**: Overextended moves returning to VWAP.
2. **Volume Breakouts**: High-momentum trend continuations.
3. **Trend Reversals**: Fading momentum combined with volume exhaustion.

---
### [4] OUTPUT REQUIREMENTS (STRICT JSON)
Return **ONLY** a valid JSON object in Turkish. No preamble, no explanation.

{
    "karar": "GÜÇLÜ_AL" | "AL" | "BEKLE" | "SAT",
    "olasilik_yuzdesi": integer (0-100),
    "neden": "Short mathematical reasoning in Turkish",
    "stop_loss": number (suggested stop level),
    "take_profit": number (suggested target level)
}
  `;

  try {
    const response = await axios.post('https://api.deepseek.com/chat/completions', {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Sen bir kantitatif finans asistanısın. Sadece JSON döndürürsün." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
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
    console.error(`❌ [DEEPSEEK] API Error for ${data.hisse_adi}:`, error.response?.data || error.message);
    return null;
  }
}
