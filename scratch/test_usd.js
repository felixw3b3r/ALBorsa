const yahooFinance = require('yahoo-finance2').default;

async function testHistoricalUSD() {
    const symbol = 'USDTRY=X';
    const purchaseDate = new Date('2024-05-10'); // AKBNK alış tarihi
    
    // Yahoo'nun arama yapması için geniş bir pencere (7 gün önce, 2 gün sonra)
    const fromDate = new Date(purchaseDate);
    fromDate.setDate(fromDate.getDate() - 7);
    const toDate = new Date(purchaseDate);
    toDate.setDate(toDate.getDate() + 2);

    console.log(`🔍 ${symbol} için ${purchaseDate.toISOString().split('T')[0]} tarihindeki kur sorgulanıyor...`);

    try {
        const results = await yahooFinance.historical(symbol, {
            period1: fromDate,
            period2: toDate,
            interval: '1d'
        });

        if (results && results.length > 0) {
            console.log('\n📅 Bulunan Kayıtlar:');
            results.forEach(r => {
                console.log(`${new Date(r.date).toLocaleDateString('tr-TR')}: ${r.close}`);
            });

            // Bizim kodun kullandığı filtreleme mantığı:
            const validResults = results.filter(r => new Date(r.date) <= purchaseDate)
                                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            if (validResults.length > 0) {
                console.log(`\n✅ Eşleşen En Yakın Kur: ${validResults[0].close} (Tarih: ${new Date(validResults[0].date).toLocaleDateString('tr-TR')})`);
            } else {
                console.log('\n❌ Filtreleme sonrası uygun kur bulunamadı.');
            }
        } else {
            console.log('\n❌ Yahoo bu tarih aralığı için hiçbir veri döndürmedi.');
        }
    } catch (error) {
        console.log(`\n❌ Hata: ${error.message}`);
    }
}

testHistoricalUSD();
