const testSymbols = [
    { symbol: 'THYAO', variants: ['thyao', 'turkish-airlines', 'turk-hava-yollari'] },
    { symbol: 'EREGL', variants: ['eregl', 'eregli-demir-celik'] },
    { symbol: 'ASELS', variants: ['asels', 'aselsan'] },
    { symbol: 'GARAN', variants: ['garan', 'garanti-bankasi'] },
    { symbol: 'AKBNK', variants: ['akbnk', 'akbank'] },
    { symbol: 'SISE',  variants: ['sise', 'sise-cam'] }
];

async function testLogos() {
    console.log('🔍 BIST 30 Detaylı Logo Testi...\n');

    for (const s of testSymbols) {
        console.log(`--- ${s.symbol} ---`);
        for (const v of s.variants) {
            const url = `https://s3-symbol-logo.tradingview.com/${v}.svg`;
            const urlBig = `https://s3-symbol-logo.tradingview.com/${v}--big.svg`;
            
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.status === 200) console.log(`✅ OK: ${url}`);
                
                const resBig = await fetch(urlBig, { method: 'HEAD' });
                if (resBig.status === 200) console.log(`✅ OK: ${urlBig}`);
            } catch (e) {}
        }
        console.log('');
    }
}

testLogos();
