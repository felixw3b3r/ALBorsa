const fs = require('fs');
const path = require('path');
const https = require('https');

const failedOnes = [
    { symbol: 'GARAN', slug: 'garanti-bbva' },
    { symbol: 'EREGL', slug: 'eregli-demir-ve-celik-fabrikalari' },
    { symbol: 'KCHOL', slug: 'koc-holding' },
    { symbol: 'YKBNK', slug: 'yapi-ve-kredi-bankasi' },
    { symbol: 'BIMAS', slug: 'bim-birlesik-magazalar' },
    { symbol: 'TKFEN', slug: 'tekfen-holding' },
    { symbol: 'SISE', slug: 'turkiye-sise-ve-cam-fabrikalari' },
    { symbol: 'EKGYO', slug: 'emlak-konut-gayrimenkul-yatirim-ortakligi' },
    { symbol: 'YEOTK', slug: 'yeo-teknoloji-enerji-ve-endustri' }
];

const targetDir = path.join(__dirname, '..', 'frontend', 'public', 'logos');

async function downloadLogo(symbol, slug) {
    const url = `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
    const filePath = path.join(targetDir, `${symbol}.svg`);

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };

    return new Promise((resolve) => {
        https.get(url, options, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`✅ ${symbol} indirildi.`);
                    resolve(true);
                });
            } else {
                // Alternatif --big dene
                const urlBig = `https://s3-symbol-logo.tradingview.com/${slug}--big.svg`;
                https.get(urlBig, options, (res2) => {
                    if (res2.statusCode === 200) {
                        const fileStream = fs.createWriteStream(filePath);
                        res2.pipe(fileStream);
                        fileStream.on('finish', () => {
                            fileStream.close();
                            console.log(`✅ ${symbol} (--big) indirildi.`);
                            resolve(true);
                        });
                    } else {
                        console.log(`❌ ${symbol} hala bulunamadı (${res2.statusCode}) - Slug: ${slug}`);
                        resolve(false);
                    }
                });
            }
        }).on('error', (err) => {
            console.log(`❌ ${symbol} hata: ${err.message}`);
            resolve(false);
        });
    });
}

async function start() {
    console.log('🚀 2. Tur: Eksik logolar indiriliyor (Browser-Agent ile)...\n');
    for (const item of failedOnes) {
        await downloadLogo(item.symbol, item.slug);
    }
    console.log('\n✨ 2. tur tamamlandı.');
}

start();
