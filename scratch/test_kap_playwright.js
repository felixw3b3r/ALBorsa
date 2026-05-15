const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();
  page.on('pageerror', () => {});
  page.on('console', () => {});

  // Tum fetch/XHR cagrilarini yakala
  const apiCalls = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/tr/api/') && !url.includes('menu/') && !url.includes('.js') && !url.includes('.css')) {
      apiCalls.push({ method: request.method(), url: url.replace('https://www.kap.org.tr', '') });
    }
  });

  // Responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/tr/api/') && !url.includes('menu/') && !url.includes('.js')) {
      try {
        const ct = response.headers()['content-type'] || '';
        let body = '';
        if (ct.includes('json')) {
          body = JSON.stringify(await response.json()).substring(0, 500);
        } else {
          body = (await response.text()).substring(0, 200);
        }
        apiCalls.push({ type: 'RESPONSE', url: url.replace('https://www.kap.org.tr', ''), status: response.status(), body });
      } catch(e) {
        apiCalls.push({ type: 'RESPONSE', url: url.replace('https://www.kap.org.tr', ''), status: response.status(), error: e.message });
      }
    }
  });

  try {
    // Once ana sayfaya git (cerezler olussun)
    await page.goto('https://www.kap.org.tr/tr/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Sonra direk API endpoint'ini dene - bildirim sorgulama
    // KAP'in kullandigi API endpoint'ini bul
    const result = await page.evaluate(async () => {
      const endpoints = [
        // Farkli API endpointlerini dene
        { url: '/tr/api/bildirim-sorgula?sembol=THYAO&sayfa=1&sayfaBoyutu=10', method: 'GET' },
        { url: '/tr/api/bildirim-sorgula', method: 'POST', body: JSON.stringify({ sembol: 'THYAO', sayfa: 1, sayfaBoyutu: 10 }) },
        { url: '/tr/api/notification/search?sembol=THYAO', method: 'GET' },
        { url: '/tr/api/notification?sembol=THYAO', method: 'GET' },
        { url: '/tr/api/disclosures?sembol=THYAO', method: 'GET' },
        { url: '/tr/api/disclosure?sembol=THYAO', method: 'GET' },
        { url: '/tr/api/inquiry/disclosure', method: 'POST', body: JSON.stringify({ stockCode: 'THYAO', page: 1, pageSize: 10 }) },
        { url: '/tr/api/inquiry/notification', method: 'POST', body: JSON.stringify({ stockCode: 'THYAO', page: 1, pageSize: 10 }) },
      ];

      const results = [];
      for (const ep of endpoints) {
        try {
          const opts = { method: ep.method, headers: { 'Content-Type': 'application/json' } };
          if (ep.body) opts.body = ep.body;
          const res = await fetch(ep.url, opts);
          const text = await res.text();
          results.push({
            url: ep.url,
            method: ep.method,
            status: res.status,
            length: text.length,
            contentType: res.headers.get('content-type') || '',
            snippet: text.substring(0, 300)
          });
        } catch(e) {
          results.push({ url: ep.url, method: ep.method, error: e.message });
        }
      }
      return results;
    });

    console.log('API TESTLERI:');
    result.forEach(r => {
      console.log(`\n[${r.status || 'ERR'}] ${r.method} ${r.url}`);
      if (r.length) console.log(`  Uzunluk: ${r.length}, Type: ${r.contentType}`);
      if (r.snippet) console.log(`  Icerik: ${r.snippet.substring(0, 200)}`);
      if (r.error) console.log(`  Error: ${r.error}`);
    });

  } catch(e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
