const fs = require('fs');
const path = require('path');
const https = require('https');

const missingSymbols = [
    'GARAN', 'EREGL', 'KCHOL', 'YKBNK', 'BIMAS', 'TKFEN', 'SISE', 'EKGYO', 'YEOTK', 'KRDMD', 'PETKM', 'HALKB', 'VAKBN'
];

const targetDir = path.join(__dirname, '..', 'frontend', 'public', 'logos');

async function downloadLogo(symbol) {
    // Finansonline logoları genellikle PNG formatında ve çok daha erişilebilir
    const url = `https://static2.finansonline.com/logos/${symbol}.png`;
    const filePath = path.join(targetDir, `${symbol}.png`);

    return new Promise((resolve) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`✅ ${symbol} indirildi.`);
                    resolve(true);
                });
            } else {
                console.log(`❌ ${symbol} bulunamadı (${res.statusCode})`);
                resolve(false);
            }
        }).on('error', (err) => {
            console.log(`❌ ${symbol} hata: ${err.message}`);
            resolve(false);
        });
    });
}

async function start() {
    console.log('🚀 Eksik logolar Finansonline üzerinden tamamlanıyor...\n');
    for (const symbol of missingSymbols) {
        await downloadLogo(symbol);
    }
    console.log('\n✨ İşlem tamamlandı.');
}

start();
