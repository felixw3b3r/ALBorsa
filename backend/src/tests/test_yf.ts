import yahooFinance from 'yahoo-finance2';

async function test() {
  try {
    const q = await yahooFinance.quote('AAPL');
    console.log(q.regularMarketPrice);
  } catch (e: any) {
    console.error(e?.message || "Bilinmeyen hata");
  }
}
test();
