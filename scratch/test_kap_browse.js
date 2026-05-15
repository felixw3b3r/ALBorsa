const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var responses = {};

  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/disclosure') || url.includes('bildirim-sorgu')) {
      try {
        var text = await res.text();
        responses[url] = { status: res.status(), size: text.length, snippet: text.substring(0, 2000) };
      } catch(e) {}
    }
  });

  try {
    // Step 1: Go to bildirim-sorgu page
    console.log('=== Loading bildirim-sorgu ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Step 2: Try to find notification link with correct URL pattern
    // Click "Bugün Gelen Bildirimler" tab - it's an <a> tag
    var tabs = await page.locator('a:has-text("Bugün Gelen Bildirimler")');
    if (await tabs.count() > 0) {
      console.log('Clicking "Bugün Gelen Bildirimler" tab...');
      await tabs.first().click();
      await page.waitForTimeout(3000);
    }

    // Try to click Ara with default settings (no filters = all)
    console.log('\nClicking Ara button...');
    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(5000);
    }

    // Check responses
    console.log('\n=== Captured responses:');
    for (var url in responses) {
      var r = responses[url];
      console.log('[' + r.status + '] ' + url.substring(0, 200));
      if (r.snippet) {
        console.log('  Snippet: ' + r.snippet.substring(0, 500));
      }
    }

    // After clicking Ara, page should show results with links
    var pageState = await page.evaluate(function() {
      // Find ALL links that look like disclosure links
      var links = document.querySelectorAll('a');
      var disclosures = [];
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        var text = links[i].textContent.trim().substring(0, 100);
        if (href && (href.includes('bildirim') || href.includes('disclosure')) && !href.includes('bildirim-sorgu')) {
          disclosures.push({ href: href, text: text, hasDisclosureIndex: href.match(/\d{5,}/) ? href.match(/\d{5,}/)[0] : null });
        }
      }
      // Get page text
      return {
        disclosureLinks: disclosures.slice(0, 20),
        bodyText: document.body.innerText.substring(0, 3000),
        url: window.location.href
      };
    });
    console.log('\n=== Page after Ara click ===');
    console.log('URL: ' + pageState.url);
    console.log('\nDisclosure links found: ' + pageState.disclosureLinks.length);
    for (var l = 0; l < pageState.disclosureLinks.length; l++) {
      console.log('  [' + l + '] ' + pageState.disclosureLinks[l].href + ' -> ' + pageState.disclosureLinks[l].text.substring(0, 60));
    }
    console.log('\nBody text:');
    console.log(pageState.bodyText);

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
