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
    // Step 1: Go to bildirim-sorgu
    console.log('=== Loading bildirim-sorgu ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Step 2: Click Ara
    console.log('\n=== Clicking Ara ===');
    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(5000);
    }

    // Check page content after Ara
    var pageState = await page.evaluate(function() {
      var result = {
        bodyText: document.body.innerText.substring(0, 3000),
        tables: [],
        clickableRows: [],
        nextData: null
      };

      // Check for tables
      var tables = document.querySelectorAll('table');
      result.tableCount = tables.length;
      for (var i = 0; i < Math.min(tables.length, 3); i++) {
        result.tables.push(tables[i].outerHTML.substring(0, 2000));
      }

      // Check for clickable rows or items
      var clickableItems = document.querySelectorAll('[role="button"], .cursor-pointer, tr, .row, [onclick]');
      for (var i = 0; i < Math.min(clickableItems.length, 20); i++) {
        var el = clickableItems[i];
        var text = el.textContent.trim().substring(0, 80);
        var html = el.innerHTML.substring(0, 300);
        if (text.length > 5) {
          result.clickableRows.push({
            tag: el.tagName,
            class: (el.className || '').substring(0, 80),
            text: text,
            html: html
          });
        }
      }

      // Find __NEXT_DATA__
      var nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        try {
          var parsed = JSON.parse(nextData.textContent);
          result.nextData = {
            hasProps: !!parsed.props,
            pageProps: parsed.props && parsed.props.pageProps ? Object.keys(parsed.props.pageProps) : [],
            query: parsed.query
          };
        } catch(e) {
          result.nextData = { error: e.message };
        }
      }

      return result;
    });

    console.log('\n=== Table count: ' + pageState.tableCount);
    console.log('=== Clickable rows found: ' + pageState.clickableRows.length);
    console.log('\nBody text (first 1500):');
    console.log(pageState.bodyText);

    if (pageState.tables.length > 0) {
      console.log('\n=== First table HTML:');
      console.log(pageState.tables[0]);
    }

    if (pageState.clickableRows.length > 0) {
      console.log('\n=== First 5 clickable items:');
      for (var i = 0; i < Math.min(pageState.clickableRows.length, 5); i++) {
        console.log('[' + i + '] ' + pageState.clickableRows[i].tag + ' class=' + pageState.clickableRows[i].class);
        console.log('  text: ' + pageState.clickableRows[i].text);
        console.log('  html: ' + pageState.clickableRows[i].html);
      }
    }

    console.log('\n=== Next data: ' + JSON.stringify(pageState.nextData));

    // Show byCriteria data summary
    if (byCriteriaData && Array.isArray(byCriteriaData)) {
      console.log('\n=== byCriteria data count: ' + byCriteriaData.length);
      console.log('First item keys: ' + Object.keys(byCriteriaData[0]).join(', '));
      console.log('First item: ' + JSON.stringify(byCriteriaData[0]).substring(0, 1000));
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
