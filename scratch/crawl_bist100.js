const fs = require('fs');
const path = require('path');
const https = require('https');

const bist100Symbols = [
    'AEFES', 'AGHOL', 'AKBNK', 'AKCNS', 'AKFYE', 'AKSA', 'AKSEN', 'ALARK', 'ALBRK', 'ALFAS',
    'ARCLK', 'ASELS', 'ASTOR', 'ASUZU', 'AYDEM', 'BAGFS', 'BERA', 'BIENP', 'BIMAS', 'BRISA',
    'BRYAT', 'BUCIM', 'CANTE', 'CCOLA', 'CIMSA', 'CWENE', 'DOAS', 'DOHOL', 'EGEEN', 'EKGYO',
    'ENJSA', 'ENKAI', 'EREGL', 'EUPWR', 'FROTO', 'GARAN', 'GENIL', 'GESAN', 'GSDHO', 'GUBRF',
    'GWIND', 'HALKB', 'HEKTS', 'IPEKE', 'ISCTR', 'ISDMR', 'ISGYO', 'ISMEN', 'IZMDC', 'KARDMD',
    'KCHOL', 'KLSER', 'KOCAER', 'KONTR', 'KORDS', 'KOZAA', 'KOZAL', 'KRDMD', 'MAVI', 'MGROS',
    'MIATK', 'ODAS', 'OTKAR', 'OYAKC', 'PENTA', 'PETKM', 'PGSUS', 'QUAGR', 'SAHOL', 'SASA',
    'SAYAS', 'SDTTR', 'SISE', 'SKBNK', 'SMRTG', 'SOKM', 'TABGD', 'TARKN', 'TATEN', 'TAVHL',
    'TCELL', 'THYAO', 'TKFEN', 'TMSN', 'TOASO', 'TSKB', 'TTKOM', 'TTRAK', 'TUPRS', 'TURSG',
    'ULKER', 'VAKBN', 'VESBE', 'VESTL', 'YEOTK', 'YKBNK', 'YYLGD', 'ZOREN'
];

const targetDir = path.join(__dirname, '..', 'frontend', 'public', 'logos');

if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

function cleanup() {
    const files = fs.readdirSync(targetDir);
    files.forEach(file => {
        const filePath = path.join(targetDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        // Eğer dosya HTML hata sayfası içeriyorsa sil
        if (content.includes('<!doctype html') || content.includes('<html>')) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Hatalı dosya silindi: ${file}`);
        }
    });
}

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
    console.log('🧹 Akıllı temizlik yapılıyor...');
    cleanup();
    
    console.log('🚀 BIST 100 Logo Taraması Başladı...\n');
    
    for (const symbol of bist100Symbols) {
        const filePath = path.join(targetDir, `${symbol}.svg`);
        const filePathPng = path.join(targetDir, `${symbol}.png`);

        if (fs.existsSync(filePath) || fs.existsSync(filePathPng)) continue;

        // 1. TradingView
        let success = await download(`https://s3-symbol-logo.tradingview.com/${symbol.toLowerCase()}.svg`, filePath);
        if (success) {
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('<svg')) {
                console.log(`✅ ${symbol} (TradingView)`);
                continue;
            } else {
                fs.unlinkSync(filePath);
            }
        }

        // 2. Yahoo
        success = await download(`https://s.yimg.com/cl/library/symbol/${symbol}.IS/logo.png`, filePathPng);
        if (success) {
            const content = fs.readFileSync(filePathPng, 'utf8');
            if (!content.includes('<html>')) {
                console.log(`✅ ${symbol} (Yahoo)`);
            } else {
                fs.unlinkSync(filePathPng);
            }
        }
    }
    
    console.log('\n✨ Tarama tamamlandı.');
}

start();
