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
    await page.waitForTimeout(3000);

    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(8000);
    }

    // Full body text
    var fullText = await page.evaluate(function() {
      return document.body.innerText;
    });
    console.log('Full page text length: ' + fullText.length);
    // Check if any disclosure content exists
    var searchTerms = ['Bağımsız', 'Denetim', 'KIMMR', 'bildirim', 'Bildirim'];
    for (var s = 0; s < searchTerms.length; s++) {
      var idx = fullText.indexOf(searchTerms[s]);
      if (idx >= 0) {
        console.log('Found "' + searchTerms[s] + '" at position ' + idx);
        console.log('  Context: ' + fullText.substring(Math.max(0, idx - 50), idx + 150));
      }
    }

    // Check bottom of page
    console.log('\n=== Last 2000 chars of body text:');
    console.log(fullText.substring(fullText.length - 2000));

    // Check for any "disclosure" divs
    var resultDivs = await page.evaluate(function() {
      // Find the results section specifically
      var divs = document.querySelectorAll('div');
      var disclosureDivs = [];
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        var text = d.textContent || '';
        if (text.includes('disclosureIndex') || text.includes('Özel Durum') || text.includes('Bağımsız Denetim')) {
          disclosureDivs.push({
            id: d.id,
            class: (d.className || '').substring(0, 100),
            innerLength: d.innerHTML.length,
            text: text.substring(0, 300)
          });
        }
      }
      return disclosureDivs;
    });

    if (resultDivs.length > 0) {
      console.log('\n=== Disclosure-related divs found: ' + resultDivs.length);
      for (var d = 0; d < resultDivs.length; d++) {
        console.log('[' + d + '] id=' + resultDivs[d].id + ' class=' + resultDivs[d].class);
        console.log('  text: ' + resultDivs[d].text);
      }
    } else {
      console.log('\n=== NO disclosure-related divs found in DOM');
    }

    // Check window height and scroll
    var scrollInfo = await page.evaluate(function() {
      return {
        scrollHeight: document.body.scrollHeight,
        clientHeight: document.body.clientHeight,
        scrollY: window.scrollY
      };
    });
    console.log('\n=== Scroll info: ' + JSON.stringify(scrollInfo));

    // Try scrolling to bottom
    await page.evaluate(function() {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    var bottomText = await page.evaluate(function() {
      var allText = document.body.innerText;
      return allText.substring(Math.max(0, allText.length - 3000));
    });
    console.log('\n=== Bottom text after scroll:');
    console.log(bottomText);

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
