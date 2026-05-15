const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(15000);
    }

    // Full page analysis
    var pageContent = await page.evaluate(function() {
      var result = {
        fullText: document.body.innerText,
        tables: [],
        disclosureItems: [],
        disclosureIndexes: []
      };

      // Find all tables
      var tables = document.querySelectorAll('table');
      for (var i = 0; i < tables.length; i++) {
        result.tables.push({
          html: tables[i].outerHTML.substring(0, 5000),
          text: tables[i].textContent.substring(0, 1000)
        });
      }

      // Find all elements with disclosure index pattern (7+ digit numbers after bildirim/)
      var links = document.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && href.match(/\/bildirim\/\d{7}/)) {
          var match = href.match(/\/bildirim\/(\d{7})/);
          result.disclosureIndexes.push(match[1]);
          result.disclosureItems.push({
            href: href,
            text: links[i].textContent.trim().substring(0, 100),
            index: match[1]
          });
        }
      }

      // Also search all text for 7+ digit numbers that could be disclosure indexes
      var text = document.body.innerText;
      var nums = text.match(/\b\d{7}\b/g);
      result.allSevenDigitNums = nums ? nums.slice(0, 20) : [];

      return result;
    });

    console.log('Full text length: ' + pageContent.fullText.length);
    console.log('Tables found: ' + pageContent.tables.length);
    console.log('Disclosure links: ' + pageContent.disclosureItems.length);
    console.log('7-digit numbers in text: ' + JSON.stringify(pageContent.allSevenDigitNums));

    if (pageContent.disclosureItems.length > 0) {
      console.log('\n=== Disclosure items:');
      for (var i = 0; i < Math.min(pageContent.disclosureItems.length, 10); i++) {
        console.log('[' + i + '] index=' + pageContent.disclosureItems[i].index + ' ' + pageContent.disclosureItems[i].href);
        console.log('  text: ' + pageContent.disclosureItems[i].text);
      }
    }

    if (pageContent.tables.length > 0) {
      console.log('\n=== Table content:');
      for (var i = 0; i < pageContent.tables.length; i++) {
        console.log('Table ' + i + ':');
        console.log(pageContent.tables[i].text.substring(0, 1000));
      }
    }

    // Print the last 2000 chars (might contain disclosure results section)
    console.log('\n=== Last 2000 chars of page text:');
    console.log(pageContent.fullText.substring(pageContent.fullText.length - 2000));

    // Print middle section
    var midStart = Math.floor(pageContent.fullText.length / 2);
    console.log('\n=== Middle 2000 chars:');
    console.log(pageContent.fullText.substring(midStart, midStart + 2000));

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
