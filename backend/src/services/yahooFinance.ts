import axios from 'axios';

export async function fetchStockData(symbol: string) {
  // Ensure symbol ends with .IS
  const formattedSymbol = symbol.endsWith('.IS') ? symbol : `${symbol}.IS`;
  
  // A mock or basic implementation using a public free API (Yahoo Finance v8 chart API)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}?range=1mo&interval=1d`;
    const response = await axios.get(url);
    const result = response.data.chart.result[0];
    
    if (!result) throw new Error("No data found");
    
    const meta = result.meta;
    const closePrices = result.indicators.quote[0].close;
    
    return {
      symbol: formattedSymbol,
      price: meta.regularMarketPrice,
      change: meta.regularMarketPrice - meta.chartPreviousClose,
      changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
      closePrices: closePrices // useful for technical analysis
    };
  } catch (error) {
    console.error(`Error fetching data for ${formattedSymbol}:`, error);
    throw error;
  }
}
