const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var responses = {};
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          var json = await res.json();
          responses[url.substring(0, 250)] = { status: res.status(), json: JSON.stringify(json).substring(0, 3000) };
        } else {
          var text = await res.text();
          responses[url.substring(0, 250)] = { status: res.status(), text: text.substring(0, 1000) };
        }
      } catch(e) {
        responses[url.substring(0, 250)] = { status: res.status(), error: e.message };
      }
    }
  });

  try {
    // First load the site to get cookies
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Click Ara
    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(5000);
    }

    // Get the first disclosureIndex from the response
    var apiInfo = await page.evaluate(function() {
      // Try to find disclosure data in the page state
      var result = {
        possibleData: null,
        disclosureIndex: null,
        nextData: null
      };

      // Check for __NEXT_DATA__
      var nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) result.nextData = nextData.textContent.substring(0, 1000);

      // Try window.__NEXT__
      if (window.__NEXT__) {
        result.nextInfo = 'Has __NEXT__';
      }

      return result;
    });
    console.log('Page data: ' + JSON.stringify(apiInfo));

    // Now with the captured responses, find disclosure indices
    console.log('\n=== API Responses ===');
    for (var url in responses) {
      var r = responses[url];
      console.log('\n[' + r.status + '] ' + url);
      if (r.json) {
        var jsonPreview = r.json.substring(0, 500);
        console.log('  JSON: ' + jsonPreview);
      } else if (r.text) {
        console.log('  Text: ' + r.text.substring(0, 300));
      }
    }

    // The byCriteria response should have the data. Let me extract disclosure indices
    // and test the detail API
    var dataByCriteria = null;
    for (var url in responses) {
      if (url.includes('byCriteria') && responses[url].json) {
        try {
          dataByCriteria = JSON.parse(responses[url].json);
          break;
        } catch(e) {}
      }
    }

    if (dataByCriteria && Array.isArray(dataByCriteria) && dataByCriteria.length > 0) {
      var firstIdx = dataByCriteria[0].disclosureIndex;
      console.log('\n\n=== Testing detail endpoints with index: ' + firstIdx + ' ===');

      // Test various detail API endpoints
      var testEndpoints = [
        '/tr/api/disclosure/detail?disclosureIndex=' + firstIdx,
        '/tr/api/disclosure/' + firstIdx,
        '/tr/api/disclosure/getDetail?disclosureIndex=' + firstIdx,
        '/tr/api/disclosure/content/' + firstIdx,
        '/tr/api/bildirim/' + firstIdx,
        '/tr/api/bildirim/detail/' + firstIdx,
        '/tr/api/disclosure/members/' + firstIdx,
        '/tr/api/disclosure/byId?id=' + firstIdx,
        '/tr/api/public/disclosure/' + firstIdx,
      ];

      responses = {};
      for (var i = 0; i < testEndpoints.length; i++) {
        var ep = testEndpoints[i];
        try {
          await page.evaluate(function(url) {
            return fetch(url).then(function(r) {
              return r.text().then(function(t) { return { status: r.status, text: t.substring(0, 2000) }; });
            });
          }, ep).then(function(r) {
            console.log('[' + r.status + '] ' + ep);
            if (r.text) console.log('  ' + r.text.substring(0, 500));
          }).catch(function(e) {
            console.log('[ERR] ' + ep + ' - ' + e.message);
          });
        } catch(e) {
          console.log('[ERR] ' + ep + ' - ' + e.message);
        }
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
