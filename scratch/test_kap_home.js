const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  // Capture API responses for analysis
  var apiData = {};
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/disclosure/members/byCriteria')) {
      try {
        apiData['byCriteria'] = await res.json();
        console.log('CAPTURED byCriteria data: ' + apiData['byCriteria'].length + ' items');
      } catch(e) {}
    }
  });

  try {
    // Step 1: Go to KAP homepage - this loads today's disclosures
    console.log('=== Step 1: Loading KAP homepage ===');
    await page.goto('https://www.kap.org.tr/tr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    console.log('Title: ' + await page.title());
    console.log('URL: ' + page.url());

    // Step 2: Check if API data was captured
    if (apiData['byCriteria']) {
      var allData = apiData['byCriteria'];
      console.log('\nTotal disclosures: ' + allData.length);

      // Filter for THYAO
      var thyaoData = allData.filter(function(d) {
        return d.stockCodes && d.stockCodes.includes('THYAO');
      });
      console.log('THYAO disclosures: ' + thyaoData.length);

      var firstThyao = thyaoData[0];
      if (firstThyao) {
        console.log('\nFirst THYAO disclosure:');
        console.log(JSON.stringify(firstThyao, null, 2));
      }

      // Show all stock codes found in first few items
      console.log('\nSample stock codes:');
      for (var i = 0; i < Math.min(5, allData.length); i++) {
        console.log('  ' + allData[i].stockCodes + ' - ' + allData[i].summary);
      }
    } else {
      console.log('No API data captured');
    }

    // Step 3: Extract disclosure links from page
    console.log('\n=== Step 3: Page content analysis ===');
    var pageContent = await page.evaluate(function() {
      // Find all links that look like disclosure links
      var links = document.querySelectorAll('a[href*="bildirim"]');
      var disclosures = [];
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        var text = links[i].textContent.trim().substring(0, 100);
        if (href && href.match(/\/bildirim\/\d+/)) {
          disclosures.push({ href: href, text: text });
        }
      }
      // Also look for a disclosure list section
      var sections = document.querySelectorAll('section, div[class*="liste"], div[class*="list"], div[class*="bildirim"], div[class*="notification"]');
      var sectionInfo = [];
      for (var s = 0; s < sections.length; s++) {
        sectionInfo.push({
          class: sections[s].className?.substring(0, 100),
          children: sections[s].children.length,
          text: sections[s].innerText.substring(0, 100)
        });
      }
      return { disclosureLinks: disclosures.slice(0, 10), sections: sectionInfo.slice(0, 5) };
    });
    console.log('Disclosure links: ' + JSON.stringify(pageContent.disclosureLinks, null, 2));
    console.log('Sections: ' + JSON.stringify(pageContent.sections, null, 2));

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
