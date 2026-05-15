const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Intercept byCriteria response
  var byCriteriaData = null;
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/disclosure/members/byCriteria')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          byCriteriaData = await res.json();
        }
      } catch(e) {}
    }
  });

  try {
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Click Ara
    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(5000);
    }

    if (!byCriteriaData || !Array.isArray(byCriteriaData) || byCriteriaData.length === 0) {
      console.log('No byCriteria data received');
      await browser.close();
      return;
    }

    var idx = byCriteriaData[0].disclosureIndex;
    console.log('Testing with disclosureIndex: ' + idx);

    // Get the current page's cookies
    var cookies = await context.cookies();
    var cookieStr = cookies.map(function(c) { return c.name + '=' + c.value; }).join('; ');
    console.log('Cookies: ' + cookieStr);

    // Try multiple endpoint patterns from within the browser context
    // Using absolute URLs to avoid relative path issues
    var endpoints = [
      'https://www.kap.org.tr/tr/api/disclosure/detail?disclosureIndex=' + idx,
      'https://www.kap.org.tr/tr/api/disclosure/' + idx,
      'https://www.kap.org.tr/tr/api/disclosure/' + idx + '/detail',
      'https://www.kap.org.tr/tr/api/disclosure/content/' + idx,
      'https://www.kap.org.tr/tr/api/disclosure/getDetail?disclosureIndex=' + idx,
      'https://www.kap.org.tr/tr/api/disclosure/attachment/list/' + idx,
      'https://www.kap.org.tr/tr/api/disclosure/document/' + idx,
      'https://www.kap.org.tr/tr/api/disclosure/financialtable/' + idx,
    ];

    // We already know POST byCriteria works - let's try POST with detail params
    var detailEndpoints = endpoints.slice(0);

    // Also try POST-based endpoints
    detailEndpoints.push({
      method: 'POST',
      url: 'https://www.kap.org.tr/tr/api/disclosure/detail',
      body: JSON.stringify({ disclosureIndex: idx })
    });
    detailEndpoints.push({
      method: 'POST',
      url: 'https://www.kap.org.tr/tr/api/disclosure/members/detail',
      body: JSON.stringify({ disclosureIndex: idx })
    });

    for (var i = 0; i < detailEndpoints.length; i++) {
      var ep = detailEndpoints[i];
      var method = ep.method || 'GET';
      var url = ep.url || ep;
      var body = ep.body || undefined;

      try {
        var result = await page.evaluate(function(params) {
          return fetch(params.url, {
            method: params.method,
            credentials: 'include',
            headers: {
              'Accept': 'application/json, text/html, */*',
              'Content-Type': 'application/json'
            },
            body: params.body
          }).then(function(r) {
            return r.text().then(function(t) {
              return {
                status: r.status,
                contentType: r.headers.get('content-type') || '',
                body: t.substring(0, 3000)
              };
            });
          }).catch(function(e) {
            return { status: 0, error: e.message };
          });
        }, { method: method, url: url, body: body });
        console.log('\n[' + result.status + '] ' + method + ' ' + url);
        if (result.error) {
          console.log('  ERROR: ' + result.error);
        } else if (result.contentType.includes('json')) {
          console.log('  JSON: ' + result.body.substring(0, 1000));
        } else if (result.body.length > 0) {
          console.log('  Body: ' + result.body.substring(0, 500));
        } else {
          console.log('  (empty)');
        }
      } catch(e) {
        console.log('\n[ERR] ' + url + ' - ' + e.message);
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
