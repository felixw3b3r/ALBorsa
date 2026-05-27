import YahooFinance from 'yahoo-finance2';
const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

async function testHistorical() {
  const symbol = 'THYAO.IS';
  const dateStr = '2026-05-20';
  const queryDate = new Date(dateStr);
  queryDate.setHours(23, 59, 59, 999);

  const fromDate = new Date(queryDate);
  fromDate.setDate(fromDate.getDate() - 10);
  const toDate = new Date(queryDate);
  toDate.setDate(toDate.getDate() + 2);

  console.log(`Querying ${symbol} from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

  try {
    console.log('Testing (yf as any).chart...');
    const chartRes = await (yf as any).chart(symbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d'
    }, { validateResult: false });
    
    console.log('Chart quotes:', chartRes.quotes ? chartRes.quotes.length : 'undefined');
    if (chartRes.quotes && chartRes.quotes.length > 0) {
      console.log('First quote:', chartRes.quotes[0]);
    }
  } catch (e: any) {
    console.error('Chart error:', e.message);
  }

  try {
    console.log('Testing (yf as any).historical...');
    const historicalRes = await (yf as any).historical(symbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d'
    });
    console.log('Historical quotes:', historicalRes ? historicalRes.length : 'undefined');
    if (historicalRes && historicalRes.length > 0) {
      console.log('First quote:', historicalRes[0]);
    }
  } catch (e: any) {
    console.error('Historical error:', e.message);
  }
}

testHistorical();
