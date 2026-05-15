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
    if (url.includes('/tr/api/')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          var json = await res.json();
          responses[url.substring(0, 250)] = { status: res.status(), body: JSON.stringify(json).substring(0, 5000) };
        }
      } catch(e) {}
    }
  });

  try {
    // Load the main KAP page (which shows "Bugün Gelen Bildirimler")
    console.log('=== Loading KAP main page ===');
    await page.goto('https://www.kap.org.tr/tr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(5000);

    console.log('Title: ' + (await page.title()));
    console.log('URL: ' + page.url());

    var pageState = await page.evaluate(function() {
      var text = document.body.innerText;
      var result = {
        textLength: text.length,
        textPreview: text.substring(0, 4000),
        disclosureLinks: [],
        nextData: null,
        nextDataPreview: null
      };

      var nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        result.nextData = true;
        result.nextDataPreview = nextData.textContent.substring(0, 5000);
      }

      var links = document.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && href.includes('/bildirim/')) {
          var match = href.match(/\/bildirim\/(\d+)/);
          result.disclosureLinks.push({
            href: href,
            text: links[i].textContent.trim().substring(0, 80),
            index: match ? match[1] : null
          });
        }
      }

      return result;
    });

    console.log('\nText length: ' + pageState.textLength);
    console.log('Disclosure links: ' + pageState.disclosureLinks.length);
    if (pageState.disclosureLinks.length > 0) {
      for (var l = 0; l < Math.min(pageState.disclosureLinks.length, 10); l++) {
        console.log('  [' + l + '] index=' + pageState.disclosureLinks[l].index + ' ' + pageState.disclosureLinks[l].href + ' -> ' + pageState.disclosureLinks[l].text);
      }
    } else {
      console.log('  (no disclosure links found)');
    }

    if (pageState.nextData) {
      console.log('\n__NEXT_DATA__: ' + pageState.nextDataPreview);
    }

    console.log('\n=== API responses:');
    for (var url in responses) {
      console.log('[' + responses[url].status + '] ' + url);
      if (responses[url].body) {
        var preview = responses[url].body.substring(0, 1000);
        console.log('  ' + preview);
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
