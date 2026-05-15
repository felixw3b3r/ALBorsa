const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Capture ALL responses during initial load
  var initialResponses = {};
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          var json = await res.json();
          initialResponses[url] = { status: res.status(), json: JSON.stringify(json).substring(0, 2000) };
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

    console.log('=== Known API endpoints from page load:');
    for (var url in initialResponses) {
      console.log('[' + initialResponses[url].status + '] ' + url);
    }

    // Now try fetching detail endpoints from the browser context
    var disclosureIndex = 1607605; // KIMMR disclosure
    var endpoints = [
      '/tr/api/disclosure/detail?disclosureIndex=' + disclosureIndex,
      '/tr/api/disclosure/' + disclosureIndex,
      '/tr/api/disclosure/' + disclosureIndex + '/detail',
      '/tr/api/disclosure/content/' + disclosureIndex,
      '/tr/api/disclosure/getDetail?disclosureIndex=' + disclosureIndex,
      '/tr/api/disclosure/members/' + disclosureIndex,
      '/tr/api/disclosure/byId?id=' + disclosureIndex,
      '/tr/api/public/disclosure/' + disclosureIndex,
      '/tr/api/disclosure/oncekihale/' + disclosureIndex,
      '/tr/api/disclosure/attachment/list/' + disclosureIndex,
      '/tr/api/disclosure/document/' + disclosureIndex,
      '/tr/api/disclosure/disclosure/' + disclosureIndex,
      '/tr/api/disclosure/financialtable/' + disclosureIndex,
      '/tr/api/disclosure/financial/' + disclosureIndex,
    ];

    console.log('\n=== Testing detail endpoints from browser context:');
    for (var i = 0; i < endpoints.length; i++) {
      try {
        var result = await page.evaluate(function(ep) {
          return fetch(ep, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json, text/html, */*' }
          }).then(function(r) {
            return r.text().then(function(t) {
              return { status: r.status, contentType: r.headers.get('content-type') || '', body: t.substring(0, 2000) };
            });
          }).catch(function(e) {
            return { status: 0, error: e.message };
          });
        }, endpoints[i]);
        console.log('[' + result.status + '] ' + endpoints[i]);
        if (result.body) {
          // Check if it's HTML or JSON
          if (result.body.trim().startsWith('{') || result.body.trim().startsWith('[')) {
            try {
              var parsed = JSON.parse(result.body);
              console.log('  JSON: ' + JSON.stringify(parsed).substring(0, 1000));
            } catch(e) {
              console.log('  Body: ' + result.body.substring(0, 500));
            }
          } else if (result.body.includes('<table') || result.body.includes('<div')) {
            console.log('  HTML: ' + result.body.substring(0, 500));
          } else {
            console.log('  Body: ' + result.body.substring(0, 300));
          }
        }
      } catch(e) {
        console.log('[ERR] ' + endpoints[i] + ' - ' + e.message);
      }
    }

    // Also try the 'Bugün Gelen Bildirimler' page which might show disclosures differently
    console.log('\n=== Trying main page for disclosure content ===');
    await page.goto('https://www.kap.org.tr/tr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    var mainPageData = await page.evaluate(function() {
      // Check for any disclosure-related data in the page
      var text = document.body.innerText;
      var nextData = document.getElementById('__NEXT_DATA__');
      var result = {
        textPreview: text.substring(0, 2000),
        hasNextData: !!nextData,
        nextDataPreview: null,
        disclosureLinks: []
      };
      if (nextData) {
        result.nextDataPreview = nextData.textContent.substring(0, 3000);
      }
      var links = document.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && href.includes('/bildirim/')) {
          result.disclosureLinks.push({ href: href, text: links[i].textContent.trim().substring(0, 80) });
        }
      }
      return result;
    });

    console.log('Main page text preview:');
    console.log(mainPageData.textPreview);
    if (mainPageData.hasNextData) {
      console.log('\n__NEXT_DATA__: ' + mainPageData.nextDataPreview);
    }
    if (mainPageData.disclosureLinks.length > 0) {
      console.log('\nDisclosure links:');
      for (var l = 0; l < mainPageData.disclosureLinks.length; l++) {
        console.log('  ' + mainPageData.disclosureLinks[l].href + ' -> ' + mainPageData.disclosureLinks[l].text);
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
