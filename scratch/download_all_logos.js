/**
 * Tüm BIST 100 hisseleri için logo indirme scripti.
 *
 * Kaynaklar:
 * 1. TradingView (SVG) - https://s3-symbol-logo.tradingview.com/{slug}.svg
 * 2. Finansonline (PNG)  - https://static2.finansonline.com/logos/{SYMBOL}.png (fallback)
 *
 * Kullanım: node scratch/download_all_logos.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// BIST 100 hisseleri ve TradingView slug mapping
const BIST100_LOGOS = {
  'THYAO': 'turk-hava-yollari',
  'TUPRS': 'tupras',
  'KCHOL': 'koc-holding',
  'AKBNK': 'akbank',
  'ISCTR': 'is-bankasi',
  'GARAN': 'garanti-bbva',
  'BIMAS': 'bim-birlesik-magazalar',
  'EREGL': 'eregli-demir-ve-celik-fabrikalari',
  'SAHOL': 'sabanci-holding',
  'YKBNK': 'yapi-ve-kredi-bankasi',
  'ASELS': 'aselsan',
  'SISE': 'turkiye-sise-ve-cam-fabrikalari',
  'FROTO': 'ford-otosan',
  'SASA': 'sasa-polyester',
  'HEKTS': 'hektas',
  'ARCLK': 'arcelik',
  'TOASO': 'tofas-oto-fab',
  'ASTOR': 'astor-enerji',
  'KONTR': 'kontrolmatik-teknoloji',
  'YEOTK': 'yeo-teknoloji-enerji-ve-endustri',
  'EFORC': 'efor-cay-sanayi',
  'ENKAI': 'enka-insaat',
  'PGSUS': 'pegasus',
  'KARDM': 'kardemir',
  'PETKM': 'petkim',
  'TKFEN': 'tekfen-holding',
  'ODAS': 'odas-elektrik',
  'AKSEN': 'akenerji',
  'AEFES': 'anadolu-efes',
  'MGROS': 'migros',
  'TTKOM': 'turk-telekom',
  'TCELL': 'turkcell',
  'HALKB': 'halk-bankasi',
  'VAKBN': 'vakif-bank',
  'DOHOL': 'dogan-holding',
  'SOKM': 'sok-marketler',
  'KOZAL': 'koza-altin',
  'KOZAA': 'koza-aa',
  'IPEKE': 'ipek-dogal-kaynaklar',
  'OTKAR': 'otokar',
  'ALARK': 'alarko-holding',
  'MAVI': 'mavi-giyim',
  'CCOLA': 'coca-cola-icecek',
  'ULKER': 'ulker-biskuvi',
  'GUBRF': 'gubre-fabrikalari',
  'AGHOL': 'ag-holding',
  'DOAS': 'dogus-otomotiv',
  'ZOREN': 'zoren-enerji',
  'BERA': 'bera-holding',
  'TURSG': 'turkiye-sigorta',
  'SKBNK': 'sekerbank',
  'TSKB': 'tskb',
  'VESTL': 'vestel',
  'KARSN': 'karsan',
  'EGEEN': 'ege-endustri',
  'OYAKC': 'oyak-cimento',
  'KORDS': 'kordsa-teknik',
  'ALBRK': 'albaraka-turk',
  'BRISA': 'brisa',
  'LOGO': 'logo-yazilim',
  'QUAGR': 'qua-granite',
  'ASUZU': 'anadolu-isuzu',
  'GENIL': 'gen-enerji',
  'CWENE': 'cw-enerji',
  'ALFAS': 'alfas-solar',
  'SDTTR': 'sdt-uzay-ve-savunma',
  'MIATK': 'mia-teknoloji',
  'REEDR': 'reeder-teknoloji',
  'SAYAS': 'sayas-yazilim',
  'EUPWR': 'euro-power',
  'GESAN': 'gesan',
  'SMRTG': 'smart-gunes-teknolojileri',
  'BRYAT': 'beyaz-filo-oto-kiralama',
  'CANTE': 'can2-termik',
  'AKFGY': 'akfen-gyo',
  'KAYSE': 'kayseri-seker',
  'ENERY': 'enerjisa-enerji',
  'TATEN': 'taten-sermaye',
  'EBEBK': 'ebebek-magazacilik',
  'TABGD': 'tab-gida',
  'VAKFN': 'vakif-fon',
  'IZMDC': 'izmir-demir-celik',
  'KTSPR': 'kutsan-plastik',
  'BTCIM': 'bat%C4%B1%C3%A7im', // batıçim
  'OYYAT': 'oyak-yatirim',
  'KFEIN': 'kafein-yazilim',
  'ARDYZ': 'ard-bilisim',
  'FORMT': 'formet-metal',
  'QNBFB': 'qnb-finansbank',
  'BVSAN': 'bvsan-bilgi',
  'MHRGY': 'mhr-gyo',
  'BORLS': 'borlease',
  'BHRGY': 'bati-ego-gyo',
  'AVPGY': 'avrupa-gyo',
  'SURGY': 'suranet-gyo',
  'MEGMT': 'megapol',
  'LMKDC': 'limak-dogal-tas',
  'MOGAN': 'mogan-enerji',
  'ENTRA': 'entra-savunma',
  'KOTON': 'koton-magazacilik',
  'AGROT': 'agrotek-teknoloji',
  'BEGYO': 'birlesim-gyo',
  'CATES': 'cates-elektrik',
  'SKYMD': 'sky-md',
  'KUZAY': 'kuzay-grup',
  'LKMNH': 'lokman-hekim',
  'PKENT': 'petro-kent',
  'HALKS': 'halk-sigorta',
  'KLNMA': 'kl-nma',
  'LINK': 'link-bilgisayar',
  'ALCTL': 'alc-telekom',
  'KAREL': 'karel-elektronik',
  'VBTYO': 'vbt-gyo',
  'PCILT': 'pci-teknoloji',
  'ESCOM': 'escom-elektronik',
  'INDES': 'indeks-bilgisayar',
  'KRDMD': 'kardemir',
  'BRSAN': 'brisa',
  'ERBOS': 'er-bos',
  'FENER': 'fenerbahce',
  'GSRAY': 'galatasaray',
  'TRAK': 'trakyacam',
  'PINSU': 'pinsut',
  'DITAS': 'ditas-dogan',
  'ANSGR': 'anadolu-sigorta',
  'AVHOL': 'avrupa-holding',
  'BUCIM': 'bursa-cimento',
  'CEMTS': 'cemtas',
  'CLEBI': 'celebi',
  'DOKTA': 'doktas',
  'ECILC': 'ecilc',
  'EGGUB': 'eggub',
  'EMKEL': 'emek-elektrik',
  'ERSU': 'ersu',
  'FMIZP': 'f-m-izmir',
  'GEDIK': 'gedik-yatirim',
  'GOZDE': 'gozde-girisim',
  'ISDMR': 'iskenderun-demir',
  'ISGYO': 'is-gyo',
  'ISKPL': 'iskpl',
  'IZENR': 'izmir-enerji',
  'KERVT': 'kervansaray',
  'KLSER': 'kilim-seramik',
  'KRTEK': 'kardemir-karabuk',
  'MAALT': 'marbas-altin',
  'MACKO': 'mackolik',
  'MEDTR': 'medikal-saglik',
  'MNDRS': 'menderes-tekstil',
  'NTHOL': 'net-holding',
  'NUGYO': 'nur-gyo',
  'OZGYO': 'oz-gyo',
  'PAPIL': 'papilon',
  'PARSN': 'parsan',
  'PENTA': 'penta-teknoloji',
  'PLTUR': 'plastikkart',
  'POLHO': 'polisan-holding',
  'PRKAB': 'turk-prysmian',
  'PRZMA': 'prizma',
  'RGYAS': 'rasyonel-gyo',
  'RTALB': 'rotas-altin',
  'RYGYO': 'ruya-gyo',
  'SAFKR': 'safkar',
  'SAMAT': 'samatech',
  'SANEL': 'san-el-muhendislik',
  'SANKO': 'sanko-pamuk',
  'SELEC': 'selekt-otomotiv',
  'SILVR': 'silverline',
  'SNICA': 'sanica',
  'SNKRN': 'senkron',
  'SODSN': 'soda-sanayi',
  'SOKE': 'soke',
  'SUNTK': 'sun-tekstil',
  'TARKM': 'tarkim',
  'TEKST': 'tekstil',
  'TEZOL': 'tezol',
  'TKNSA': 'teknosa',
  'TMPOL': 'tmp-holding',
  'TRCAS': 'turcas',
  'TSGYO': 'ts-gyo',
  'TTRAK': 'turk-traktor',
  'TUKAS': 'tukas',
  'TUREX': 'turex',
  'UFUK': 'ufuk-yatirim',
  'ULAS': 'ulaslar',
  'USAK': 'usak-seramik',
  'VERUS': 'verusa-holding',
  'VESBE': 'vestel-beyaz-esya',
  'YATAS': 'yatas',
  'YAYLA': 'yayla-enerji',
  'YONGA': 'yonga',
};

const targetDir = path.join(__dirname, '..', 'frontend', 'public', 'logos');

// İndirme istatistikleri
let stats = { success: 0, failed: 0, skipped: 0 };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFromUrl(url, filePath, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/svg+xml,image/png,image/*,*/*',
          },
          timeout: 10000,
        };

        protocol.get(url, options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Redirect takibi
            downloadFromUrl(res.headers.location, filePath, 0).then(resolve);
            return;
          }

          if (res.statusCode === 200) {
            const fileStream = fs.createWriteStream(filePath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve(true);
            });
            fileStream.on('error', () => resolve(false));
          } else {
            resolve(false);
          }
        }).on('error', (err) => {
          resolve(false);
        }).on('timeout', function() {
          this.destroy();
          resolve(false);
        });
      });

      if (result) return true;
      if (attempt < retries) await sleep(500);
    } catch (e) {
      if (attempt < retries) await sleep(500);
    }
  }
  return false;
}

async function downloadLogo(symbol) {
  const slug = BIST100_LOGOS[symbol];
  if (!slug) {
    console.log(`⚠️  ${symbol}: slug bilgisi yok, atlanıyor.`);
    stats.skipped++;
    return false;
  }

  // Zaten varsa atla
  const svgPath = path.join(targetDir, `${symbol}.svg`);
  const pngPath = path.join(targetDir, `${symbol}.png`);
  if (fs.existsSync(svgPath) || fs.existsSync(pngPath)) {
    console.log(`⏭️  ${symbol}: zaten mevcut.`);
    stats.skipped++;
    return true;
  }

  // 1. ÖNCE: TradingView SVG (birincil kaynak)
  const tvUrl = `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
  let downloaded = await downloadFromUrl(tvUrl, svgPath);

  if (downloaded) {
    // SVG boyutunu kontrol et (geçersiz SVG'leri ayıkla)
    try {
      const content = fs.readFileSync(svgPath, 'utf8');
      if (content.includes('<svg') || content.includes('<?xml')) {
        console.log(`✅ ${symbol}.svg indirildi (TradingView).`);
        stats.success++;
        return true;
      } else {
        fs.unlinkSync(svgPath); // Geçersiz SVG'yi sil
        downloaded = false;
      }
    } catch (e) {
      fs.unlinkSync(svgPath);
      downloaded = false;
    }
  }

  // 2. TradingView --big versiyonunu dene
  if (!downloaded) {
    const tvBigUrl = `https://s3-symbol-logo.tradingview.com/${slug}--big.svg`;
    downloaded = await downloadFromUrl(tvBigUrl, svgPath);

    if (downloaded) {
      try {
        const content = fs.readFileSync(svgPath, 'utf8');
        if (content.includes('<svg') || content.includes('<?xml')) {
          console.log(`✅ ${symbol}.svg indirildi (TradingView --big).`);
          stats.success++;
          return true;
        } else {
          fs.unlinkSync(svgPath);
          downloaded = false;
        }
      } catch (e) {
        fs.unlinkSync(svgPath);
        downloaded = false;
      }
    }
  }

  // 3. TradingView PNG denemesi (bazı logolar PNG olarak var)
  if (!downloaded) {
    const tvPngUrl = `https://s3-symbol-logo.tradingview.com/${slug}.png`;
    downloaded = await downloadFromUrl(tvPngUrl, pngPath);

    if (downloaded) {
      console.log(`✅ ${symbol}.png indirildi (TradingView PNG).`);
      stats.success++;
      return true;
    }
  }

  // 4. FALLBACK: Finansonline PNG
  if (!downloaded) {
    const foUrl = `https://static2.finansonline.com/logos/${symbol}.png`;
    downloaded = await downloadFromUrl(foUrl, pngPath);

    if (downloaded) {
      console.log(`✅ ${symbol}.png indirildi (Finansonline).`);
      stats.success++;
      return true;
    }
  }

  // 5. FALLBACK: Investing.com logosu
  if (!downloaded) {
    const invUrl = `https://i-invdn-com.investing.com/logos/${symbol}_60x60.png`;
    downloaded = await downloadFromUrl(invUrl, pngPath);

    if (downloaded) {
      console.log(`✅ ${symbol}.png indirildi (Investing.com).`);
      stats.success++;
      return true;
    }
  }

  console.log(`❌ ${symbol}: hiçbir kaynaktan indirilemedi.`);
  stats.failed++;
  return false;
}

async function start() {
  console.log('🚀 BIST 100 Logoları indiriliyor...\n');

  // Klasörü kontrol et
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Klasör oluşturuldu: ${targetDir}\n`);
  }

  const symbols = Object.keys(BIST100_LOGOS);
  console.log(`📊 Toplam ${symbols.length} hisse kontrol edilecek.\n`);

  let count = 0;
  for (const symbol of symbols) {
    count++;
    process.stdout.write(`[${count}/${symbols.length}] `);
    await downloadLogo(symbol);
    // Rate limiting - TradingView'e fazla yüklenmemek için
    await sleep(100);
  }

  console.log('\n═══════════════════════════════════');
  console.log('📊 İSTATİSTİK');
  console.log(`✅ Başarılı: ${stats.success}`);
  console.log(`⏭️  Atlanan: ${stats.skipped}`);
  console.log(`❌ Başarısız: ${stats.failed}`);
  console.log('═══════════════════════════════════\n');

  if (stats.failed > 0) {
    console.log('⚠️  İndirilemeyen hisseler için frontend fallback (baş harf) gösterilecek.');
  }
  console.log('✨ İşlem tamamlandı.');
}

start();
