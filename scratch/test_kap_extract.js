const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var capturedData = null;

  // Intercept the byCriteria API response
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/disclosure/members/byCriteria')) {
      try {
        capturedData = await res.json();
        console.log('API verisi yakalandi: ' + capturedData.length + ' bildirim');
      } catch(e) {
        console.log('API parse hatasi: ' + e.message);
      }
    }
  });

  try {
    // Navigate to bildirim-sorgu page
    console.log('=== Bildirim sorgu sayfasina gidiliyor ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(5000);

    console.log('Sayfa basligi: ' + await page.title());
    console.log('Yakalanan veri: ' + (capturedData ? 'Evet (' + capturedData.length + ' kayit)' : 'Hayir'));

    if (capturedData && capturedData.length > 0) {
      // Filter for THYAO
      var thyaoData = capturedData.filter(function(d) {
        return d.stockCodes && d.stockCodes.includes('THYAO');
      });
      console.log('\nTHYAO bildirim sayisi: ' + thyaoData.length);
      if (thyaoData.length > 0) {
        console.log('Ilk THYAO bildirimi:');
        console.log(JSON.stringify(thyaoData[0], null, 2));
      }

      // Show stock codes distribution
      var stockCounts = {};
      for (var i = 0; i < Math.min(capturedData.length, 50); i++) {
        var codes = capturedData[i].stockCodes;
        if (codes) {
          if (!stockCounts[codes]) stockCounts[codes] = 0;
          stockCounts[codes]++;
        }
      }
      console.log('\nStock codes (first 50 items):');
      var codes = Object.keys(stockCounts).slice(0, 15);
      for (var c = 0; c < codes.length; c++) {
        console.log('  ' + codes[c] + ': ' + stockCounts[codes[c]]);
      }

      // Now try to get a detail page
      if (thyaoData.length > 0) {
        var idx = thyaoData[0].disclosureIndex;
        console.log('\n\n=== THYAO bildirim detayina gidiliyor: ' + idx + ' ===');
        await page.goto('https://www.kap.org.tr/tr/bildirim/' + idx, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await page.waitForTimeout(5000);

        var detailInfo = await page.evaluate(function() {
          var tables = document.querySelectorAll('table');
          var tableHtmls = [];
          for (var i = 0; i < tables.length; i++) {
            tableHtmls.push(tables[i].outerHTML);
          }
          return {
            url: window.location.href,
            title: document.title,
            tableCount: tables.length,
            tableHtmls: tableHtmls,
            bodyText: document.body.innerText.substring(0, 3000)
          };
        });
        console.log('Detay sayfa bilgisi:');
        console.log('  URL: ' + detailInfo.url);
        console.log('  Title: ' + detailInfo.title);
        console.log('  Table count: ' + detailInfo.tableCount);
        if (detailInfo.tableHtmls.length > 0) {
          console.log('\n=== TABLO HTML ===');
          console.log(detailInfo.tableHtmls[0].substring(0, 5000));
          if (detailInfo.tableHtmls[0].length > 5000) {
            console.log('... (' + (detailInfo.tableHtmls[0].length - 5000) + ' karakter daha)');
          }
        }
        console.log('\n=== Sayfa Metni ===');
        console.log(detailInfo.bodyText);
      }

      // Try to get the raw API data for all items accessible from page
      var pageApiData = await page.evaluate(function(capturedLength) {
        // Check window for any stored data
        var data = {
          nextData: null,
          localData: null,
          sessionData: null,
          reactData: null
        };
        try {
          var scripts = document.querySelectorAll('script[id*="__NEXT"]');
          data.scriptCount = scripts.length;
          for (var i = 0; i < scripts.length; i++) {
            data['script_' + i] = { id: scripts[i].id, text: scripts[i].textContent.substring(0, 500) };
          }
        } catch(e) { data.error = e.message; }
        return data;
      }, capturedData.length);
      console.log('\n=== Page API Data ===');
      console.log(JSON.stringify(pageApiData, null, 2).substring(0, 3000));
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
