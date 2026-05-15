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
    if (url.includes('/tr/api/') || url.includes('/_next/data')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          var json = await res.json();
          responses[url.substring(0, 250)] = { status: res.status(), json: JSON.stringify(json).substring(0, 3000) };
        } else {
          var text = await res.text();
          responses[url.substring(0, 250)] = { status: res.status(), text: text.substring(0, 1000) };
        }
      } catch(e) {
        responses[url.substring(0, 250)] = { status: res.status(), error: e.message };
      }
    }
  });

  // Capture all requests for analysis
  var requests = [];
  page.on('request', function(req) {
    var url = req.url();
    if (url.includes('/tr/api/') || url.includes('/_next/data') || url.includes('/bildirim/')) {
      requests.push({ url: url.substring(0, 300), method: req.method(), headers: JSON.stringify(req.headers()).substring(0, 500) });
    }
  });

  try {
    // Test with first disclosure index from the working endpoint
    var disclosureIndex = 1607605;
    console.log('=== Navigating to disclosure detail: ' + disclosureIndex + ' ===');

    await page.goto('https://www.kap.org.tr/tr/bildirim/' + disclosureIndex, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(5000);

    console.log('\n=== Page URL: ' + page.url());
    console.log('=== Page title: ' + (await page.title()));

    // Get page content summary
    var pageContent = await page.evaluate(function() {
      var result = {
        bodyClasses: document.body.className,
        bodyHtml: document.body.innerHTML.substring(0, 5000),
        textContent: document.body.innerText.substring(0, 3000),
        scripts: [],
        nextData: null,
        modals: []
      };

      // Get __NEXT_DATA__
      var nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        try {
          result.nextData = JSON.parse(nextData.textContent);
          // Extract relevant parts
          var nd = result.nextData;
          result.nextDataSummary = {
            page: nd.page,
            props: nd.props ? Object.keys(nd.props) : [],
            buildId: nd.buildId,
            isFallback: nd.isFallback,
            dynamicIds: nd.dynamicIds ? nd.dynamicIds.length : 0
          };
        } catch(e) {
          result.nextData = nextData.textContent.substring(0, 1000);
        }
      }

      // Find disclosure content specific elements
      var allDivs = document.querySelectorAll('div');
      for (var i = 0; i < allDivs.length; i++) {
        var d = allDivs[i];
        var html = d.innerHTML;
        if (html.includes('DisclosureInformation') || html.includes('bildirim') || html.includes('Bildirim')) {
          result.modals.push({
            id: d.id,
            class: d.className.substring(0, 100),
            html: html.substring(0, 2000)
          });
        }
      }

      return result;
    });

    console.log('\n=== Page Analysis ===');
    console.log('Body classes: ' + pageContent.bodyClasses);
    console.log('Next data: ' + JSON.stringify(pageContent.nextDataSummary));
    console.log('\nBody text (first 2000):');
    console.log(pageContent.textContent);

    if (pageContent.modals.length > 0) {
      console.log('\n=== Disclosure-like elements found:');
      for (var m = 0; m < pageContent.modals.length; m++) {
        console.log('[' + m + '] id=' + pageContent.modals[m].id + ' class=' + pageContent.modals[m].class);
        console.log('  HTML: ' + pageContent.modals[m].html);
      }
    }

    console.log('\n=== Captured requests:');
    for (var r = 0; r < requests.length; r++) {
      console.log('[' + requests[r].method + '] ' + requests[r].url);
    }

    console.log('\n=== Captured API responses:');
    for (var url in responses) {
      var r = responses[url];
      console.log('\n[' + r.status + '] ' + url);
      if (r.json) {
        console.log('  JSON: ' + r.json.substring(0, 1000));
      } else if (r.text) {
        console.log('  Text: ' + r.text.substring(0, 500));
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
