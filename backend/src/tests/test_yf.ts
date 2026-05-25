import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
  try {
    const q: any = await yahooFinance.quote('AAPL');
    console.log(q.regularMarketPrice);
  } catch (e: any) {
    console.error(e?.message || "Bilinmeyen hata");
  }
}
test();
