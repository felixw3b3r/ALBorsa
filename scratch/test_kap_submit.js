const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Capture ALL fetch/XHR
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('favicon') && !url.includes('google-analytics') && !url.includes('doubleclick')) {
      apiCalls.push({
        type: 'REQ',
        method: req.method(),
        url: url.substring(0, 300),
        postData: req.postData()?.substring(0, 2000)
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/tr/api/') || url.includes('__next') || res.status() >= 400) {
      try {
        const text = await res.text();
        apiCalls.push({
          type: 'RES',
          url: url.substring(0, 300),
          status: res.status(),
          contentType: (res.headers()['content-type'] || '').substring(0, 100),
          size: text.length,
          snippet: text.substring(0, 2000)
        });
      } catch (e) {
        apiCalls.push({
          type: 'RES',
          url: url.substring(0, 300),
          status: res.status(),
          error: e.message
        });
      }
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

    // Take a screenshot to see the page state
    await page.screenshot({ path: '/tmp/kap_page.png' });

    // Try to find and click "Detaylı Sorgulama" tab if it exists
    const tabs = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, [role="tab"], [role="button"]');
      return Array.from(buttons).map(b => ({
        text: b.textContent?.trim().substring(0, 50),
        class: b.className?.substring(0, 80),
        id: b.id,
        href: b.getAttribute('href')?.substring(0, 100),
        onclick: b.getAttribute('onclick')?.substring(0, 100)
      })).filter(b => b.text && b.text.length > 0).slice(0, 30);
    });
    console.log(`\n=== Interactive Elements ===\n${JSON.stringify(tabs, null, 2)}`);

    // Check if there's a detalı sorgulama link
    // From the body text earlier, we saw "Detaylı Sorgulama" as a link
    const detayliLink = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent?.includes('Detaylı Sorgulama')) {
          return { href: link.href, text: link.textContent?.trim() };
        }
      }
      return null;
    });
    console.log(`\n=== Detaylı Sorgulama link: ${JSON.stringify(detayliLink)}`);

    // Check the current URL
    console.log(`Current URL: ${page.url()}`);

    // The page shows tabs: Bugün Gelen Bildirimler, Beklenen Bildirimler, Detaylı Sorgulama
    // These tabs might load data when clicked. Let's click "Bugün Gelen Bildirimler"
    // Or try to click "Detaylı Sorgulama" which has the form with company search

    // Let's try clicking links by their text
    const clickTab = async (text) => {
      const links = await page.evaluate((searchText) => {
        const allElements = document.querySelectorAll('a, button, span, div[role="tab"]');
        for (const el of allElements) {
          if (el.textContent?.trim().includes(searchText)) {
            return { success: true, tag: el.tagName, text: el.textContent?.trim().substring(0, 50), id: el.id };
          }
        }
        return null;
      }, text);
      console.log(`Found "${text}": ${JSON.stringify(links)}`);

      if (links) {
        // Try clicking using Playwright
        try {
          await page.click(`text="${text}"`, { timeout: 5000 }).catch(() => {
            return page.click(`text=${text}`, { timeout: 5000 });
          });
          console.log(`Clicked "${text}"`);
          await page.waitForTimeout(2000);
          return true;
        } catch (e) {
          console.log(`Could not click "${text}": ${e.message}`);
          return false;
        }
      }
      return false;
    };

    // First try to click "Detaylı Sorgulama"
    await clickTab('Detaylı Sorgulama');
    await page.waitForTimeout(1000);

    // Now check the page structure after clicking
    const afterClick = await page.evaluate(() => {
      // Check current URL
      const url = window.location.href;
      return { url };
    });
    console.log(`After click URL: ${afterClick.url}`);

    // Check if there are any search/ara buttons now
    const araButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons).map(b => ({
        text: b.textContent?.trim().substring(0, 30),
        type: b.type,
        disabled: b.disabled,
        class: b.className?.substring(0, 50)
      }));
    });
    console.log(`\n=== All buttons ===\n${JSON.stringify(araButtons, null, 2)}`);

    // Check if there's a visible form
    const formHTML = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      return Array.from(forms).map(f => ({
        id: f.id,
        innerHTML: f.innerHTML.substring(0, 1000)
      }));
    });
    console.log(`\n=== Forms after click ===\n${JSON.stringify(formHTML, null, 2).substring(0, 3000)}`);

    // Look for any search/filter button and click it
    for (const btn of araButtons) {
      if (btn.text?.includes('Ara')) {
        console.log(`\nFound "Ara" button, clicking...`);
        try {
          const buttons = page.locator('button');
          const count = await buttons.count();
          for (let i = 0; i < count; i++) {
            const text = await buttons.nth(i).textContent();
            if (text?.includes('Ara')) {
              await buttons.nth(i).click();
              console.log('Clicked Ara button');
              await page.waitForTimeout(3000);
              break;
            }
          }
        } catch (e) {
          console.log(`Error clicking Ara: ${e.message}`);
        }
      }
    }

    // Wait a bit and check for any new data
    await page.waitForTimeout(2000);

    // Check page content for any notification data
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 5000) || '');
    console.log(`\n=== Page text after interactions ===\n${pageText}`);

  } catch (e) {
    console.error('Hata:', e.message);
  }

  // Print API calls
  console.log(`\n\n=== CAPTURED REQUESTS (${apiCalls.length}) ===`);
  apiCalls.forEach((r, i) => {
    if (r.type === 'REQ') {
      if (r.postData) {
        console.log(`[REQ ${i}] ${r.method} ${r.url}\n  Body: ${r.postData}`);
      } else {
        console.log(`[REQ ${i}] ${r.method} ${r.url}`);
      }
    } else {
      if (r.status >= 400 || r.url.includes('/tr/api/') || r.url.includes('__next')) {
        console.log(`[RES ${i}] ${r.status} ${r.url} (${r.size || 0}b, ${r.contentType})`);
        if (r.snippet && r.snippet.length > 0) {
          console.log(`  ${r.snippet.substring(0, 500)}`);
        }
      }
    }
  });

  await browser.close();
})();
