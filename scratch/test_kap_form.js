const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Intercept all requests
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/tr/api/') || url.includes('bildirim') || url.includes('__next')) {
      requests.push({
        type: 'REQ',
        method: req.method(),
        url: url.replace('https://www.kap.org.tr', ''),
        headers: JSON.stringify(req.headers()).substring(0, 300),
        postData: req.postData()?.substring(0, 1000)
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/tr/api/') || url.includes('bildirim') || url.includes('__next')) {
      try {
        const text = await res.text();
        requests.push({
          type: 'RES',
          method: 'GET',
          url: url.replace('https://www.kap.org.tr', ''),
          status: res.status(),
          contentType: res.headers()['content-type'] || '',
          size: text.length,
          body: text.substring(0, 3000)
        });
      } catch (e) {
        requests.push({
          type: 'RES',
          url: url.replace('https://www.kap.org.tr', ''),
          status: res.status(),
          error: e.message
        });
      }
    }
  });

  try {
    // Navigate to the page
    console.log('=== Navigating to bildirim-sorgu ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Find input fields
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])');
      return Array.from(inputs).map(el => ({
        id: el.id,
        name: el.getAttribute('name'),
        type: el.type,
        placeholder: el.placeholder,
        className: el.className?.substring(0, 80),
        role: el.getAttribute('role'),
        'aria-label': el.getAttribute('aria-label')
      }));
    });
    console.log(`\n=== Text Inputs ===\n${JSON.stringify(inputInfo, null, 2)}`);

    // Try clicking the company select/autocomplete
    // Look for the first major combobox/autocomplete
    const clickResult = await page.evaluate(() => {
      // Try various selectors for the company search/autocomplete
      const selectors = [
        '[class*="sirket"] input', '[class*="company"] input',
        '[class*="autocomplete"] input', '[role="combobox"]',
        '.MuiAutocomplete-root input', 'input[placeholder*="Şirket"]',
        'input[placeholder*="sirket"]', 'input[placeholder*="ara"]',
        'input[placeholder*="Ara"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          return { found: true, selector: sel, tag: el.tagName, id: el.id, class: el.className?.substring(0, 100) };
        }
      }
      return { found: false, selectors: selectors };
    });
    console.log(`\n=== Company Input Search: ${JSON.stringify(clickResult, null, 2)}`);

    // The page uses a complex autocomplete - let's try to find it by looking at all divs with input descendants
    const allInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).map(el => ({
        id: el.id,
        outerHTML: el.outerHTML?.substring(0, 300)
      }));
    });
    console.log(`\n=== ALL INPUTS ===`);
    allInputs.forEach((inp, i) => console.log(`[${i}] ${inp.outerHTML}`));

    // Let's also check if the URL param approach works - try RSC action
    // Next.js App Router uses server actions. Let's see if we can find the action ID
    const actionInfo = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      return Array.from(forms).map(f => ({
        action: f.action,
        method: f.method,
        id: f.id,
        innerHTML: f.innerHTML?.substring(0, 500)
      }));
    });
    console.log(`\n=== Forms: ${JSON.stringify(actionInfo, null, 2).substring(0, 2000)}`);

  } catch (e) {
    console.error('Hata:', e.message);
  }

  // Print all captured requests/responses
  console.log(`\n\n=== ALL REQUESTS (${requests.length}) ===`);
  requests.forEach((r, i) => {
    if (r.type === 'REQ') {
      console.log(`\n[REQ ${i}] ${r.method} ${r.url}`);
    } else {
      console.log(`\n[RES ${i}] ${r.status} ${r.url} (${r.size || 0} bytes, ${r.contentType})`);
      if (r.body && r.body.length > 0) {
        console.log(`  Body: ${r.body.substring(0, 1000)}`);
      }
    }
  });

  await browser.close();
})();
