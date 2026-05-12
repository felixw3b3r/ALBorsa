const testSymbols = [
    { symbol: 'THYAO', name: 'turkish-airlines' },
    { symbol: 'TUPRS', name: 'tupras' },
    { symbol: 'EREGL', name: 'eregli-demir-celik' },
    { symbol: 'KCHOL', name: 'koc-holding' },
    { symbol: 'AAPL', name: 'apple' },
    { symbol: 'BTC', name: 'bitcoin' }
];

async function testLogos() {
    console.log('🔍 TradingView Logo URL Testi Başlatılıyor (Using Native Fetch)...\n');

    for (const s of testSymbols) {
        const urls = [
            `https://s3-symbol-logo.tradingview.com/${s.name}.svg`,
            `https://s3-symbol-logo.tradingview.com/${s.name}--big.svg`,
            `https://s3-symbol-logo.tradingview.com/crypto/XTVC${s.symbol}.svg`, // TV Crypto format
            `https://s3-symbol-logo.tradingview.com/indices/${s.name}.svg`
        ];

        console.log(`--- ${s.symbol} ---`);
        for (const url of urls) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.status === 200) {
                    console.log(`✅ BAŞARILI: ${url}`);
                }
            } catch (e) {
                // Silently skip errors
            }
        }
        console.log('');
    }
}

testLogos();
