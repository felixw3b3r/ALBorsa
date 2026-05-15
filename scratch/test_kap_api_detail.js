const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var byCriteriaData = null;
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/disclosure/members/byCriteria')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          byCriteriaData = await res.json();
        }
      } catch(e) {}
    }
  });

  try {
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(5000);
    }

    if (byCriteriaData && Array.isArray(byCriteriaData)) {
      console.log('Total disclosures: ' + byCriteriaData.length);
      for (var i = 0; i < Math.min(byCriteriaData.length, 3); i++) {
        var d = byCriteriaData[i];
        console.log('\n=== Disclosure ' + i + ' (index: ' + d.disclosureIndex + ') ===');
        console.log('publishDate: ' + d.publishDate);
        console.log('kapTitle: ' + d.kapTitle);
        console.log('subject: ' + d.subject);
        console.log('summary: ' + (d.summary || '').substring(0, 1000));
        console.log('disclosureCategory: ' + d.disclosureCategory);
        console.log('disclosureClass: ' + d.disclosureClass);
        console.log('disclosureType: ' + d.disclosureType);
        console.log('stockCodes: ' + d.stockCodes);
        console.log('relatedStocks: ' + JSON.stringify(d.relatedStocks));
        console.log('attachmentCount: ' + d.attachmentCount);
        console.log('isOldKap: ' + d.isOldKap);
        console.log('year: ' + d.year);
        console.log('period: ' + d.period);
        console.log('ruleType: ' + d.ruleType);
        console.log('hasMultiLanguageSupport: ' + d.hasMultiLanguageSupport);
        console.log('modifyStatus: ' + d.modifyStatus);
        if (d.isLate !== undefined) console.log('isLate: ' + d.isLate);
      }
    } else {
      console.log('No byCriteria data received');
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
