
import yahooFinance from 'yahoo-finance2';

async function test() {
  try {
    const symbols = ['XU100.IS', 'BTC-USD', '^GSPC'];
    console.log('Testing symbols:', symbols);
    const quotes = await (yahooFinance as any).quote(symbols);
    console.log('Full Quote Response (First item):', JSON.stringify(Array.isArray(quotes) ? quotes[0] : quotes, null, 2));
    
    const chart = await (yahooFinance as any).chart('XU100.IS', { period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) });
    console.log('Chart quotes structure:', chart.quotes ? 'Exists' : 'Missing');
    if (chart.quotes) console.log('First chart quote:', chart.quotes[0]);
  } catch (e: any) {
    console.error('Test failed:', e.message);
  }
}

test();
