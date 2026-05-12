const fs = require('fs');
const path = require('path');
const https = require('https');

const bist50Symbols = [
    'AGHOL', 'AKSEN', 'ALARK', 'ARCLK', 'ASELS', 'ASTOR', 'BERA', 'BIMAS', 'BRYAT', 'CANTE', 
    'CIMSA', 'DOAS', 'DOHOL', 'EKGYO', 'ENJSA', 'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GESAN', 
    'GSDHO', 'GUBRF', 'HALKB', 'HEKTS', 'IPEKE', 'ISCTR', 'ISGYO', 'KCHOL', 'KONTR', 'KOZAA', 
    'KOZAL', 'KRDMD', 'MGROS', 'ODAS', 'OTKAR', 'OYAKC', 'PETKM', 'PGSUS', 'QUAGR', 'SAHOL', 
    'SASA', 'SISE', 'SKBNK', 'SMRTG', 'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TOASO', 'TSKB', 
    'TUPRS', 'TURSG', 'ULKER', 'VAKBN', 'VESBE', 'VESTL', 'YKBNK', 'ZOREN', 'YEOTK'
];

const targetDir = path.join(__dirname, '..', 'frontend', 'public', 'logos');

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 3000
};

async function download(url, filePath) {
    return new Promise((resolve) => {
        https.get(url, options, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(true);
                });
            } else {
                resolve(false);
            }
        }).on('error', () => resolve(false));
    });
}

async function start() {
    console.log('🚀 BIST 50 Logo Taraması Başladı...\n');
    
    for (const symbol of bist50Symbols) {
        const filePath = path.join(targetDir, `${symbol}.svg`);
        const filePathPng = path.join(targetDir, `${symbol}.png`);

        // Eğer zaten varsa atla
        if (fs.existsSync(filePath) || fs.existsSync(filePathPng)) {
            // console.log(`⏭️ ${symbol} zaten mevcut.`);
            continue;
        }

        // 1. TradingView Denemesi (Sembol bazlı)
        let success = await download(`https://s3-symbol-logo.tradingview.com/${symbol.toLowerCase()}.svg`, filePath);
        if (success) {
            console.log(`✅ ${symbol} (TradingView)`);
            continue;
        }

        // 2. Yahoo Finance Denemesi
        success = await download(`https://s.yimg.com/cl/library/symbol/${symbol}.IS/logo.png`, filePathPng);
        if (success) {
            // Yahoo bazen 404 olsa da 200 dönebiliyor, dosya boyutunu kontrol et
            const stats = fs.statSync(filePathPng);
            if (stats.size > 500) { // 500 byte'dan küçükse muhtemelen hata sayfasıdır
                console.log(`✅ ${symbol} (Yahoo)`);
            } else {
                fs.unlinkSync(filePathPng);
                // console.log(`❌ ${symbol} bulunamadı.`);
            }
        }
    }
    
    console.log('\n✨ Tarama tamamlandı.');
}

start();
