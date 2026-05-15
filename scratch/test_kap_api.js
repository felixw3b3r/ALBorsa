const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Capture ALL API calls
  const apiCalls = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/tr/api/') || url.includes('/api/')) {
      apiCalls.push({
        type: 'REQUEST',
        method: request.method(),
        url: url.replace('https://www.kap.org.tr', ''),
        headers: request.headers(),
        postData: request.postData()?.substring(0, 500)
      });
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/tr/api/') || url.includes('/api/')) {
      try {
        const ct = response.headers()['content-type'] || '';
        let body = '';
        if (ct.includes('json')) {
          const json = await response.json();
          body = JSON.stringify(json).substring(0, 2000);
        } else {
          body = (await response.text()).substring(0, 500);
        }
        apiCalls.push({
          type: 'RESPONSE',
          url: url.replace('https://www.kap.org.tr', ''),
          status: response.status(),
          contentType: ct,
          body
        });
      } catch (e) {
        apiCalls.push({
          type: 'RESPONSE',
          url: url.replace('https://www.kap.org.tr', ''),
          status: response.status(),
          error: e.message
        });
      }
    }
  });

  try {
    // Navigate to KAP bildirim page with THYAO pre-specified
    console.log('=== Navigating to KAP bildirim page ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu?stockCode=THYAO', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for the page to settle
    await page.waitForTimeout(5000);

    // Check page content
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    // Get all text content
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || 'NO BODY');
    console.log(`\n=== BODY TEXT (ilk 3000) ===\n${bodyText}`);

    // Check for any table elements
    const tableCount = await page.evaluate(() => {
      return document.querySelectorAll('table, [role="table"], .MuiTable-root, .bildirim-table').length;
    });
    console.log(`\nTable elements found: ${tableCount}`);

    // Check for error messages
    const errorText = await page.evaluate(() => {
      return document.body?.innerText?.includes('hata') || document.body?.innerText?.includes('Hata') || document.body?.innerText?.includes('error');
    });
    console.log(`Error text found: ${errorText}`);

    // Try to find bildirim data in the page
    const pageHTML = await page.content();
    const hasNextData = pageHTML.includes('__next_f');
    const hasBildirim = pageHTML.includes('bildirim');
    console.log(`Has __next_f: ${hasNextData}, Has bildirim: ${hasBildirim}`);

    // Try to extract __NEXT_DATA__
    const nextData = await page.evaluate(() => {
      try {
        const el = document.getElementById('__NEXT_DATA__');
        return el?.textContent?.substring(0, 5000) || 'NO __NEXT_DATA__';
      } catch (e) { return 'Error: ' + e.message; }
    });
    console.log(`\n=== __NEXT_DATA__ (ilk 5000) ===\n${nextData}`);

    // Check if there's a search form and try to interact with it
    // Look for input fields
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea, [role="combobox"]');
      return Array.from(inputs).map(i => ({
        tag: i.tagName,
        type: i.getAttribute('type'),
        placeholder: i.getAttribute('placeholder'),
        id: i.id,
        class: i.className?.substring(0, 100),
        role: i.getAttribute('role')
      }));
    });
    console.log(`\n=== INPUT FIELDS ===\n${JSON.stringify(inputInfo, null, 2)}`);

    // Print all API calls
    console.log(`\n=== API CALLS (${apiCalls.length}) ===`);
    apiCalls.forEach((call, i) => {
      if (call.type === 'REQUEST') {
        console.log(`[REQ ${i}] ${call.method} ${call.url}`);
      } else {
        console.log(`[RES ${i}] ${call.status} ${call.url}`);
        if (call.body?.length > 300) {
          console.log(`  Body: ${call.body.substring(0, 300)}...`);
        } else {
          console.log(`  Body: ${call.body}`);
        }
      }
    });

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
