const yahooFinance = require('yahoo-finance2').default;

async function testMavi() {
    const symbols = ['MAVI.IS', 'MAVI'];
    console.log('🔍 MAVI Sembol Testi Başladı...');

    for (const symbol of symbols) {
        try {
            console.log(`\n--- Test ediliyor: ${symbol} ---`);
            
            // 1. Quote Test (Anlık Fiyat)
            const quote = await yahooFinance.quote(symbol);
            console.log(`✅ Quote Başarılı: Fiyat = ${quote.regularMarketPrice}`);

            // 2. Chart Test (Grafik - 15m)
            try {
                const chart15m = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), interval: '15m' });
                console.log(`✅ 15m Grafik Başarılı: ${chart15m.quotes.length} bar bulundu.`);
            } catch (e) {
                console.log(`❌ 15m Grafik Hata: ${e.message}`);
            }

            // 3. Chart Test (Grafik - 1d)
            try {
                const chart1d = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), interval: '1d' });
                console.log(`✅ 1d Grafik Başarılı: ${chart1d.quotes.length} bar bulundu.`);
            } catch (e) {
                console.log(`❌ 1d Grafik Hata: ${e.message}`);
            }

        } catch (error) {
            console.log(`❌ ${symbol} Genel Hata: ${error.message}`);
        }
    }
}

testMavi();
