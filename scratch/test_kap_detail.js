const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var apiCalls = [];
  page.on('request', function(req) {
    var url = req.url();
    if (url.includes('/tr/api/disclosure') || url.includes('/tr/api/bildirim') || url.includes('__next')) {
      apiCalls.push({ type: req.method(), url: url.substring(0, 250), data: (req.postData() || '').substring(0, 500) });
    }
  });
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/disclosure') || url.includes('__next')) {
      try {
        var text = await res.text();
        apiCalls.push({ type: 'RESP', url: url.substring(0, 250), status: res.status(), size: text.length, body: text.substring(0, 2000) });
      } catch(e) {
        apiCalls.push({ type: 'RESP', url: url.substring(0, 250), status: res.status(), error: e.message });
      }
    }
  });

  try {
    // Try different disclosure indices
    var indices = [1607605];  // from today's data

    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      console.log('\n\n=== Detay: ' + idx + ' ===');
      apiCalls = [];

      await page.goto('https://www.kap.org.tr/tr/bildirim/' + idx, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(5000);

      var info = await page.evaluate(function() {
        return {
          url: window.location.href,
          readyState: document.readyState,
          title: document.title,
          bodyLength: document.body?.innerText?.length || 0,
          bodyText: document.body?.innerText?.substring(0, 3000),
          htmlLength: document.body?.innerHTML?.length || 0,
          htmlSnippet: document.body?.innerHTML?.substring(0, 2000),
          scripts: document.querySelectorAll('script').length
        };
      });
      console.log('URL: ' + info.url);
      console.log('Title: ' + info.title);
      console.log('Body length: ' + info.bodyLength);
      console.log('HTML length: ' + info.htmlLength);
      console.log('\nBody text:');
      console.log(info.bodyText);
      console.log('\nHTML snippet:');
      console.log(info.htmlSnippet);

      console.log('\nAPI Calls:');
      for (var a = 0; a < apiCalls.length; a++) {
        var c = apiCalls[a];
        if (c.type === 'RESP') {
          console.log('[' + c.status + '] ' + c.url + ' (' + c.size + 'b)');
          if (c.body && c.body.length > 0) {
            console.log('  ' + c.body.substring(0, 500));
          }
        } else {
          console.log('[REQ] ' + c.url);
          if (c.data) console.log('  Body: ' + c.data);
        }
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
