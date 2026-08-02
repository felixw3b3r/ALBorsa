import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
  const symbols = ['HXSCF', 'HXSCL'];
  for (const sym of symbols) {
    try {
      const period1 = new Date();
      period1.setMonth(period1.getMonth() - 6);
      const data: any = await yahooFinance.chart(sym, { period1, interval: '1d' }, { validateResult: false });
      console.log(`[OK] ${sym}: quotes: ${data?.quotes?.length || 0}`);
    } catch (e: any) {
      console.error(`[ERROR] ${sym}: ${e?.message || "Bilinmeyen hata"}`);
    }
  }
}
test();
