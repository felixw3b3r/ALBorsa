const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var capturedApiData = null;

  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/api/disclosure')) {
      var ct = res.headers()['content-type'] || '';
      try {
        if (ct.includes('json')) {
          var json = await res.json();
          if (Array.isArray(json)) {
            capturedApiData = json;
            console.log('YAKALANDI: ' + json.length + ' kayit - ' + url.substring(0, 100));
          }
        }
      } catch(e) {}
    }
  });

  try {
    console.log('=== Sayfa yukleniyor ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Find all buttons and click "Ara"
    console.log('\n=== "Ara" butonu araniyor ===');
    var araClicked = false;
    var buttons = await page.locator('button').all();
    for (var i = 0; i < buttons.length; i++) {
      var text = await buttons[i].textContent();
      if (text && text.trim() === 'Ara') {
        console.log('"Ara" butonu bulundu, tiklaniliyor...');
        await buttons[i].click();
        araClicked = true;
        break;
      }
    }

    if (!araClicked) {
      // Try alternative selectors
      console.log('"Ara" butonu text ile bulunamadi, alternatif deneniyor...');
      var araBtn = page.locator('button:has-text("Ara")');
      if (await araBtn.count() > 0) {
        await araBtn.first().click();
        araClicked = true;
      }
    }

    console.log('Ara tiklandi: ' + araClicked);
    await page.waitForTimeout(3000);

    if (capturedApiData) {
      console.log('\n=== API VERISI BASARILI ===');
      console.log('Toplam bildirim: ' + capturedApiData.length);

      if (capturedApiData.length > 0) {
        console.log('\nIlk kayit anahtarlari: ' + Object.keys(capturedApiData[0]).join(', '));
        console.log('\nIlk kayit (ornek):');
        console.log(JSON.stringify(capturedApiData[0], null, 2));

        // THYAO ara
        var thyaoData = capturedApiData.filter(function(d) {
          return d.stockCodes && d.stockCodes.includes('THYAO');
        });
        console.log('\nTHYAO bildirimleri: ' + thyaoData.length);
        if (thyaoData.length > 0) {
          console.log('Ilk THYAO:');
          console.log(JSON.stringify(thyaoData[0], null, 2));
        }
      }
    } else {
      console.log('\nAPI verisi yakalanamadi.');
      // Check what's on the page
      var pageState = await page.evaluate(function() {
        return {
          text: document.body.innerText.substring(0, 2000),
          forms: document.querySelectorAll('button').length
        };
      });
      console.log('Sayfa icerigi: ' + pageState.text.substring(0, 500));
    }

    // Now try getting a detail page
    if (capturedApiData && capturedApiData.length > 0) {
      var item = capturedApiData[0];
      var idx = item.disclosureIndex;
      console.log('\n\n=== Detay sayfasina gidiliyor: ' + idx + ' ===');
      await page.goto('https://www.kap.org.tr/tr/bildirim/' + idx, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(5000);

      var detail = await page.evaluate(function() {
        var tables = document.querySelectorAll('table');
        var result = {
          url: window.location.href,
          title: document.title,
          tableCount: tables.length,
          tables: []
        };
        for (var i = 0; i < tables.length; i++) {
          result.tables.push({
            html: tables[i].outerHTML,
            text: tables[i].innerText.substring(0, 500)
          });
        }
        // Also find the bildirim content
        var contentDiv = document.querySelector('[class*="bildirim"], [class*="Bildirim"], [class*="content"], [class*="detail"]');
        if (contentDiv) {
          result.contentHtml = contentDiv.outerHTML.substring(0, 5000);
          result.contentText = contentDiv.innerText.substring(0, 1000);
        }
        return result;
      });
      console.log('Tablo sayisi: ' + detail.tableCount);
      if (detail.tables.length > 0) {
        console.log('\n=== TABLO HTML (ilk 3000 karakter) ===');
        console.log(detail.tables[0].html.substring(0, 3000));
      }
      console.log('\n=== Sayfa metni (ilk 2000) ===');
      console.log((detail.contentText || detail.tables[0]?.text || '')?.substring(0, 2000));
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
