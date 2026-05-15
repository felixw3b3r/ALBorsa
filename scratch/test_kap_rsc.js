const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Capture RSC payloads
  const rscChunks = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('__next_f')) {
      try {
        const text = await response.text();
        rscChunks.push({ url: url.substring(0, 200), size: text.length, text: text.substring(0, 10000) });
      } catch (e) {}
    }
  });

  try {
    // Navigate to the page
    console.log('=== Navigating ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Check RSC chunks
    console.log(`\n=== RSC CHUNKS (${rscChunks.length}) ===`);
    rscChunks.forEach((c, i) => {
      console.log(`\n[Chunk ${i}] Size: ${c.size} bytes`);
      console.log(`URL: ${c.url}`);
      // Try to find company data
      const companyMatch = c.text.match(/companies[^]]*\]/);
      if (companyMatch) {
        console.log(`Has companies data: ${companyMatch[0].substring(0, 500)}`);
      }
      // Try to find THYAO
      if (c.text.includes('THYAO')) {
        const idx = c.text.indexOf('THYAO');
        console.log(`THYAO found at pos ${idx}: ${c.text.substring(Math.max(0, idx - 100), idx + 200)}`);
      }
      // Look for bildirim data
      if (c.text.includes('bildirim') || c.text.includes('Bildirim')) {
        console.log(`Has bildirim reference at: ${c.text.indexOf('bildirim')}`);
      }
      // Look for notification/disclosure data
      if (c.text.includes('notification') || c.text.includes('disclosure') || c.text.includes('Disclosure')) {
        console.log(`Has notification/disclosure reference`);
      }
    });

    // Now let's try to use page.evaluate to extract the RSC state
    const rscState = await page.evaluate(() => {
      // __next_f is a global array
      const f = (window as any).__next_f;
      if (!f) return 'NO __NEXT_F';
      return `__next_f length: ${f.length}, first element type: ${typeof f[0]}`;
    });
    console.log(`\n=== RSC State: ${rscState}`);

    // Extract rendered HTML - look for the bildirim table/content area
    const content = await page.evaluate(() => {
      // Look for any element containing bildirim data
      const possibleContainers = document.querySelectorAll('[class*="bildirim"], [class*="notification"], [class*="table"], [class*="Table"], table, [role="table"]');
      const containers = Array.from(possibleContainers).map(el => ({
        class: el.className?.substring(0, 100),
        id: el.id,
        tag: el.tagName,
        html: el.innerHTML?.substring(0, 500)
      }));
      return containers;
    });
    console.log(`\n=== Possible bildirim containers: ${JSON.stringify(content, null, 2).substring(0, 3000)}`);

    // Check the main content area
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector('main, [role="main"], #main, .main-content, .content');
      if (!main) return 'No main element found';
      return {
        tag: main.tagName,
        class: main.className?.substring(0, 200),
        html: main.innerHTML?.substring(0, 3000)
      };
    });
    console.log(`\n=== Main content: ${JSON.stringify(mainContent, null, 2).substring(0, 3000)}`);

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
