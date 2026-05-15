const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Intercept ALL request details for byCriteria
  page.on('request', function(req) {
    var url = req.url();
    if (url.includes('byCriteria') || url.includes('serverAction') || url.includes('4d769c')) {
      console.log('\n=== REQUEST ===');
      console.log('URL: ' + url);
      console.log('Method: ' + req.method());
      console.log('Headers: ' + JSON.stringify(req.headers()));
      console.log('PostData: ' + (req.postData() || '').substring(0, 2000));
    }
  });

  page.on('response', function(res) {
    var url = res.url();
    if (url.includes('byCriteria') || url.includes('4d769c')) {
      console.log('\n=== RESPONSE ===');
      console.log('URL: ' + url);
      console.log('Status: ' + res.status());
      console.log('Headers: ' + JSON.stringify(res.headers()));
    }
  });

  try {
    console.log('=== Loading bildirim-sorgu ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Let the page settle and trigger any auto-loading
    for (var i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      console.log('Waited ' + (i + 1) + 's...');
    }

    // Check page state
    var state = await page.evaluate(function() {
      return {
        url: window.location.href,
        readyState: document.readyState,
        scriptsLoaded: document.querySelectorAll('script').length
      };
    });
    console.log('\nPage state: ' + JSON.stringify(state));

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
