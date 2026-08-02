import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
  const symbols = ['SPCX', 'SKHYV', 'DXYZ', '000660.KS', 'AAPL'];
  for (const sym of symbols) {
    try {
      const q: any = await yahooFinance.quote(sym);
      console.log(`[OK] ${sym}: ${q.shortName || q.longName || 'No Name'} - Price: ${q.regularMarketPrice || q.price}`);
    } catch (e: any) {
      console.error(`[ERROR] ${sym}: ${e?.message || "Bilinmeyen hata"}`);
    }
  }
}
test();
