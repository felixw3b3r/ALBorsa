import axios from 'axios';

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchStockData(symbol: string) {
  // Akıllı formatlama: Eğer sembolde nokta, tire veya şapka yoksa .IS ekle
  const formattedSymbol = (symbol.includes('.') || symbol.includes('-') || symbol.startsWith('^')) 
    ? symbol 
    : `${symbol}.IS`;
  
  try {
    // TradingView benzeri kütüphaneler için daha uzun süreli (6 ay) ve detaylı veri çekiyoruz
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}?range=6mo&interval=1d`;
    const response = await axios.get(url);
    const result = response.data.chart.result[0];
    
    if (!result) throw new Error("No data found");
    
    const meta = result.meta;
    const timestamps = result.timestamp;
    const indicators = result.indicators.quote[0];
    
    const { open, high, low, close, volume } = indicators;
    
    // TradingView (Lightweight Charts) formatına uygun OHLC dizisi hazırlıyoruz
    const chartData: OHLCData[] = timestamps.map((ts: number, i: number) => ({
      time: ts, // UNIX Timestamp
      open: open[i],
      high: high[i],
      low: low[i],
      close: close[i],
      volume: volume[i]
    })).filter((d: any) => d.open !== null && d.close !== null);

    return {
      symbol: formattedSymbol,
      price: meta.regularMarketPrice || close[close.length - 1],
      change: (meta.regularMarketPrice || close[close.length - 1]) - meta.chartPreviousClose,
      changePercent: (((meta.regularMarketPrice || close[close.length - 1]) - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
      closePrices: close.filter((c: any) => c !== null), // Teknik analiz için düz dizi
      ohlc: chartData // TradingView kütüphanesi için tam veri seti
    };
  } catch (error) {
    console.error(`Error fetching data for ${formattedSymbol}:`, error);
    throw error;
  }
}
