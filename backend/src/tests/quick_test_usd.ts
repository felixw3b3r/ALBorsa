import YahooFinanceModule from 'yahoo-finance2';
const yahooFinance = new (YahooFinanceModule as any)();

async function testHistoricalUSD() {
    const symbol = 'USDTRY=X';
    const purchaseDate = new Date('2024-05-10'); 
    const fromDate = new Date(purchaseDate);
    fromDate.setDate(fromDate.getDate() - 7);
    const toDate = new Date(purchaseDate);
    toDate.setDate(toDate.getDate() + 2);

    console.log(`🔍 [DEBUG] ${symbol} sorgusu: ${purchaseDate.toISOString().split('T')[0]}`);

    try {
        const results = await yahooFinance.historical(symbol, {
            period1: fromDate,
            period2: toDate,
            interval: '1d'
        });

        console.log('\n📅 [RESULT] Bulunan Kayıtlar:');
        results.forEach((r: any) => {
            console.log(`- ${new Date(r.date).toLocaleDateString('tr-TR')}: ${r.close} ₺`);
        });

        const validResults = results.filter((r: any) => new Date(r.date) <= purchaseDate)
                                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (validResults.length > 0) {
            console.log(`\n✅ [MATCH] En Yakın Kur: ${validResults[0].close} (Tarih: ${new Date(validResults[0].date).toLocaleDateString('tr-TR')})`);
        } else {
            console.log('\n❌ [ERROR] Uygun kur bulunamadı.');
        }
    } catch (error: any) {
        console.log(`\n❌ [CRASH] Hata: ${error.message}`);
    }
    process.exit(0);
}

testHistoricalUSD();
