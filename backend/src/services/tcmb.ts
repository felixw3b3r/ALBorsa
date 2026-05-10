import axios from 'axios';

export async function fetchUSDTRY() {
  // EVDS is complex and requires an API key. Using a public mock or Yahoo Finance for USDTRY as fallback.
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?range=1d&interval=1d`;
    const response = await axios.get(url);
    const result = response.data?.chart?.result?.[0];
    
    if (!result || !result.meta) throw new Error("No valid data found in Yahoo response");
    
    return result.meta.regularMarketPrice;
  } catch (error: any) {
    console.error(`Error fetching USDTRY:`, error?.message || error);
    return null;
  }
}
