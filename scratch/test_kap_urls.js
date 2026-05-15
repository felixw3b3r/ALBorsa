const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  async function testUrl(page, url) {
    console.log('\n=== Test: ' + url + ' ===');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
      var info = await page.evaluate(function() {
        var text = document.body?.innerText || '';
        var has404 = text.includes('404') || text.includes('Sayfa Bulunumadı') || text.includes('not found');
        var tables = document.querySelectorAll('table');
        return {
          url: window.location.href,
          title: document.title,
          has404: has404,
          tableCount: tables.length,
          bodyLength: text.length,
          bodySnippet: text.substring(0, 1000)
        };
      });
      console.log('  URL: ' + info.url);
      console.log('  Title: ' + info.title);
      console.log('  404: ' + info.has404);
      console.log('  Tables: ' + info.tableCount);
      console.log('  Body: ' + info.bodySnippet.substring(0, 300));
      return info;
    } catch (e) {
      console.log('  Error: ' + e.message);
      return null;
    }
  }

  try {
    // First load the homepage to get proper cookies
    await page.goto('https://www.kap.org.tr/tr/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Test various URL patterns
    var urls = [
      'https://www.kap.org.tr/tr/bildirim/1607605',
      'https://www.kap.org.tr/tr/disclosure/1607605',
      'https://www.kap.org.tr/tr/bildirim-detay/1607605',
      'https://www.kap.org.tr/tr/bildirim?id=1607605',
      'https://www.kap.org.tr/tr/disclosure?id=1607605',
      // Try some known working pages
      'https://www.kap.org.tr/tr/bist-sirketler',
      // Try a THYAO company page
      'https://www.kap.org.tr/tr/sirket/THYAO',
      'https://www.kap.org.tr/tr/sirket/thyoa',
    ];

    for (var i = 0; i < urls.length; i++) {
      await testUrl(page, urls[i]);
    }

    // Now try to find the company page for THYAO
    console.log('\n\n=== Searching for THYAO company page ===');
    await page.goto('https://www.kap.org.tr/tr/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Use the search
    var searchResult = await page.evaluate(function() {
      var searchInput = document.getElementById('all-search');
      if (searchInput) {
        searchInput.value = 'THYAO';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        return 'Search input found, value set';
      }
      return 'No search input';
    });
    console.log(searchResult);
    await page.waitForTimeout(1000);

    // Check if search suggestions appeared
    var afterSearch = await page.evaluate(function() {
      return {
        url: window.location.href,
        text: document.body.innerText.substring(0, 1000)
      };
    });
    console.log('After search: ' + afterSearch.text.substring(0, 500));

    // Navigate to a known company detail page
    console.log('\n=== Checking company detail pages ===');
    await page.goto('https://www.kap.org.tr/tr/bist-sirketler', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    var companyPage = await page.evaluate(function() {
      // Find company links
      var links = document.querySelectorAll('a[href*="sirket"]');
      var companyLinks = [];
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && !href.includes('sirketler') && !href.includes('javascript')) {
          companyLinks.push({ href: href, text: links[i].textContent.trim().substring(0, 50) });
        }
      }
      return { companyLinks: companyLinks.slice(0, 20), text: document.body.innerText.substring(0, 1000) };
    });
    console.log('Search results page content:');
    console.log(companyPage.text.substring(0, 500));

    // Maybe the company/symbol page is at a different URL
    console.log('\n\n=== Testing stock detail pages ===');
    var stockUrls = [
      'https://www.kap.org.tr/tr/hisse/THYAO',
      'https://www.kap.org.tr/tr/hisseler/THYAO',
      'https://www.kap.org.tr/tr/stock/THYAO',
      'https://www.kap.org.tr/tr/sembol/THYAO',
    ];
    for (var s = 0; s < stockUrls.length; s++) {
      await testUrl(page, stockUrls[s]);
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
