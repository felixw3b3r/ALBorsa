const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var apiCalls = [];
  page.on('request', function(req) {
    var url = req.url();
    if (url.includes('/tr/api/')) {
      apiCalls.push({ url: url.substring(0, 300), method: req.method(), type: 'request' });
    }
  });

  var responses = {};
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          var json = await res.json();
          responses[url] = { status: res.status(), body: JSON.stringify(json).substring(0, 5000) };
        }
      } catch(e) {
        responses[url] = { status: res.status(), error: e.message };
      }
    }
  });

  try {
    // Step 1: Go to bildirim-sorgu
    console.log('=== Step 1: Loading bildirim-sorgu ===');
    await page.goto('https://www.kap.org.tr/tr/bildirim-sorgu', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Step 2: Click Ara
    console.log('\n=== Step 2: Clicking Ara ===');
    var araBtn = page.locator('button:has-text("Ara")');
    if (await araBtn.count() > 0) {
      await araBtn.first().click();
      await page.waitForTimeout(5000);
    }

    console.log('\n=== API calls so far:');
    for (var i = 0; i < apiCalls.length; i++) {
      console.log('[' + apiCalls[i].method + '] ' + apiCalls[i].url);
    }

    // Step 3: Find disclosure links in results
    console.log('\n=== Step 3: Looking for disclosure links ===');
    var disclosureLinks = await page.evaluate(function() {
      var links = document.querySelectorAll('a');
      var result = [];
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        var text = links[i].textContent.trim().substring(0, 80);
        if (href && href.match(/\/bildirim\/(\d+)/)) {
          var match = href.match(/\/bildirim\/(\d+)/);
          result.push({ href: href, text: text, index: match[1] });
        }
      }
      return result;
    });

    console.log('Found ' + disclosureLinks.length + ' disclosure links');
    for (var l = 0; l < Math.min(disclosureLinks.length, 5); l++) {
      console.log('  [' + l + '] ' + disclosureLinks[l].href + ' -> ' + disclosureLinks[l].text.substring(0, 60));
    }

    if (disclosureLinks.length > 0) {
      // Step 4: Click the first disclosure link
      var targetIdx = disclosureLinks[0].index;
      console.log('\n=== Step 4: Clicking disclosure ' + targetIdx + ' ===');

      // Clear previous API call tracking
      apiCalls = [];

      // Click via JavaScript to avoid navigation
      var clickResult = await page.evaluate(function(idx) {
        var links = document.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href');
          if (href && href.includes('/bildirim/' + idx)) {
            // Try clicking it
            links[i].click();
            return { clicked: true, href: href, text: links[i].textContent.trim().substring(0, 80) };
          }
        }
        return { clicked: false };
      }, targetIdx);

      console.log('Click result: ' + JSON.stringify(clickResult));
      await page.waitForTimeout(6000);

      // Check if URL changed
      console.log('Current URL: ' + page.url());

      // Step 5: Check for modal content
      console.log('\n=== Step 5: Checking for modal content ===');
      var modalContent = await page.evaluate(function() {
        var result = {
          modalHtml: '',
          overlayDivs: [],
          apiResponses: []
        };

        // Check for overlay/modal elements
        var allDivs = document.querySelectorAll('div');
        for (var i = 0; i < allDivs.length; i++) {
          var d = allDivs[i];
          var classes = d.className || '';
          var style = d.getAttribute('style') || '';
          var html = d.innerHTML;

          if (classes.toLowerCase().includes('modal') || classes.toLowerCase().includes('overlay') ||
              style.includes('fixed') || style.includes('absolute') || style.includes('z-index')) {
            if (html.length > 50 && html.length < 50000) {
              result.overlayDivs.push({
                class: classes.substring(0, 100),
                style: style.substring(0, 100),
                html: html.substring(0, 3000)
              });
            }
          }
        }

        return result;
      });

      if (modalContent.overlayDivs.length > 0) {
        console.log('Found ' + modalContent.overlayDivs.length + ' overlay/modal divs:');
        for (var m = 0; m < modalContent.overlayDivs.length; m++) {
          console.log('[' + m + '] class=' + modalContent.overlayDivs[m].class);
          console.log('  style=' + modalContent.overlayDivs[m].style);
          console.log('  HTML: ' + modalContent.overlayDivs[m].html);
        }
      } else {
        console.log('No modal/overlay divs found');

        // Try to check if we navigated to a new page
        var bodyText = await page.evaluate(function() {
          return document.body.innerText.substring(0, 500);
        });
        console.log('Body text: ' + bodyText);
      }
    }

    // Step 6: Check API responses for detail endpoints
    console.log('\n=== All captured API responses ===');
    for (var url in responses) {
      var r = responses[url];
      console.log('\n[' + r.status + '] ' + url);
      if (r.body) {
        var preview = r.body.substring(0, 800);
        if (url.includes('byCriteria')) {
          // Parse and show just count
          try {
            var data = JSON.parse(r.body);
            if (Array.isArray(data)) {
              console.log('  Array length: ' + data.length);
              if (data.length > 0) {
                console.log('  First item keys: ' + Object.keys(data[0]).join(', '));
              }
            }
          } catch(e) {
            console.log('  ' + preview);
          }
        } else if (url.includes('detail') || url.includes('Detail') || url.includes('content') || url.includes('Content')) {
          console.log('  DETAIL CONTENT: ' + preview);
        } else {
          console.log('  ' + preview);
        }
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
