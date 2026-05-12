const fs = require('fs');
const path = require('path');
const https = require('https');

const bist30Logos = [
    { symbol: 'THYAO', slug: 'turk-hava-yollari' },
    { symbol: 'TUPRS', slug: 'tupras' },
    { symbol: 'AKBNK', slug: 'akbank' },
    { symbol: 'GARAN', slug: 'garanti-bankasi' },
    { symbol: 'EREGL', slug: 'eregli-demir-celik' },
    { symbol: 'KCHOL', slug: 'koc-holding' },
    { symbol: 'ASELS', slug: 'aselsan' },
    { symbol: 'SAHOL', slug: 'sabanci-holding' },
    { symbol: 'ISCTR', slug: 'is-bankasi' },
    { symbol: 'YKBNK', slug: 'yapi-ve-kredi-bankasi' },
    { symbol: 'BIMAS', slug: 'bim-magazalar' },
    { symbol: 'SASA', slug: 'sasa-polyester' },
    { symbol: 'HEKTS', slug: 'hektas' },
    { symbol: 'PETKM', slug: 'petkim' },
    { symbol: 'TKFEN', slug: 'tekfen-holding' },
    { symbol: 'SISE', slug: 'sise-cam' },
    { symbol: 'PGSUS', slug: 'pegasus' },
    { symbol: 'ARCLK', slug: 'arcelik' },
    { symbol: 'TOASO', slug: 'tofas-oto-fab' },
    { symbol: 'FROTO', slug: 'ford-otosan' },
    { symbol: 'ENKAI', slug: 'enka-insaat' },
    { symbol: 'ALARK', slug: 'alarko-holding' },
    { symbol: 'EKGYO', slug: 'emlak-konut-gyo' },
    { symbol: 'OYAKC', slug: 'oyak-cimento' },
    { symbol: 'ASTOR', slug: 'astor-enerji' },
    { symbol: 'KONTR', slug: 'kontrolmatik-teknoloji' },
    { symbol: 'YEOTK', slug: 'yeo-teknoloji' }
];

const targetDir = path.join(__dirname, '..', 'frontend', 'public', 'logos');

async function downloadLogo(symbol, slug) {
    const url = `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
    const filePath = path.join(targetDir, `${symbol}.svg`);

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
                // Alternatif olarak --big.svg dene
                const urlBig = `https://s3-symbol-logo.tradingview.com/${slug}--big.svg`;
                https.get(urlBig, (res2) => {
                    if (res2.statusCode === 200) {
                        const fileStream = fs.createWriteStream(filePath);
                        res2.pipe(fileStream);
                        fileStream.on('finish', () => {
                            fileStream.close();
                            console.log(`✅ ${symbol} (--big) indirildi.`);
                            resolve(true);
                        });
                    } else {
                        console.log(`❌ ${symbol} bulunamadı (${res2.statusCode})`);
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
    console.log('🚀 Logolar indiriliyor...\n');
    for (const item of bist30Logos) {
        await downloadLogo(item.symbol, item.slug);
    }
    console.log('\n✨ İşlem tamamlandı.');
}

start();
