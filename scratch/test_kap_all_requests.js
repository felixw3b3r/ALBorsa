const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var allUrls = [];
  var allFetchPostData = [];

  page.on('request', function(req) {
    var url = req.url();
    var method = req.method();
    allUrls.push(method + ' ' + url);

    // Capture POST request body
    if (method === 'POST' && !url.includes('google') && !url.includes('gtag')) {
      try {
        var postData = req.postData();
        if (postData) {
          allFetchPostData.push({ url: url.substring(0, 300), body: postData.substring(0, 2000) });
        }
      } catch(e) {}
    }
  });

  try {
    console.log('=== Loading bildirim-sorgu ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    console.log('\n=== Clicking Ara ===');
    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      // Wait longer for client-side rendering
      await page.waitForTimeout(15000);
    }

    console.log('\n=== All POST requests during session:');
    for (var i = 0; i < allFetchPostData.length; i++) {
      console.log('URL: ' + allFetchPostData[i].url);
      console.log('Body: ' + allFetchPostData[i].body);
      console.log('---');
    }

    console.log('\n=== All unique API requests:');
    var unique = {};
    for (var i = 0; i < allUrls.length; i++) {
      var u = allUrls[i];
      // Filter out static assets
      if (u.includes('/_next/') || u.includes('/api/') || u.includes('/tr/')) {
        // Group similar URLs
        var key = u.replace(/\?.*/, '').replace(/\/\d+/g, '/{id}').substring(0, 200);
        if (!unique[key]) {
          unique[key] = 0;
        }
        unique[key]++;
      }
    }

    var sorted = Object.keys(unique).sort();
    for (var s = 0; s < sorted.length; s++) {
      console.log('[' + unique[sorted[s]] + 'x] ' + sorted[s]);
    }

    // Now check the page content after long wait
    var pageContent = await page.evaluate(function() {
      var text = document.body.innerText;
      var tables = document.querySelectorAll('table');
      var resultDivs = [];
      var divs = document.querySelectorAll('div');
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        var t = d.textContent || '';
        // Look for disclosure-related content (disclosure index numbers are 7+ digits)
        if (t.match(/\d{7}/)) {
          resultDivs.push({
            class: (d.className || '').substring(0, 80),
            text: t.substring(0, 200)
          });
        }
      }
      return {
        textLength: text.length,
        textPreview: text.substring(0, 2000),
        tableCount: tables.length,
        disclosureContentDivs: resultDivs.slice(0, 10)
      };
    });

    console.log('\n=== Page content after 15s wait:');
    console.log('Text length: ' + pageContent.textLength);
    console.log('Table count: ' + pageContent.tableCount);
    console.log('Divs with 7+ digit numbers: ' + pageContent.disclosureContentDivs.length);
    if (pageContent.disclosureContentDivs.length > 0) {
      for (var d = 0; d < pageContent.disclosureContentDivs.length; d++) {
        console.log('[' + d + '] class=' + pageContent.disclosureContentDivs[d].class);
        console.log('  text: ' + pageContent.disclosureContentDivs[d].text);
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
