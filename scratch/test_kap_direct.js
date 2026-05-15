const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  try {
    // First navigate to the main page to get cookies
    console.log('=== Loading page for cookies ===');
    await page.goto('https://www.kap.org.tr/tr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // Now try the API directly from within the browser context
    console.log('\n=== Test 1: byCriteria API ===');
    var test1 = await page.evaluate(function() {
      return fetch('/tr/api/disclosure/members/byCriteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate: new Date().toISOString().split('T')[0],
          toDate: new Date().toISOString().split('T')[0],
          memberType: 'IGS',
          mkkMemberOidList: [],
          inactiveMkkMemberOidList: [],
          disclosureClass: '',
          subjectList: [],
          isLate: '',
          mainSector: '',
          sector: '',
          subSector: '',
          marketOid: '',
          index: '',
          bdkReview: '',
          bdkMemberOidList: [],
          year: '',
          term: '',
          ruleType: '',
          period: '',
          fromSrc: false,
          srcCategory: '',
          disclosureIndexList: []
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var thyao = data.filter(function(d) {
          return (d.stockCodes && d.stockCodes.includes('THYAO'));
        });
        return {
          totalCount: data.length,
          thyaoCount: thyao.length,
          thyaoData: thyao.slice(0, 5),
          sampleKeys: data[0] ? Object.keys(data[0]) : [],
          allSample: data.slice(0, 2)
        };
      })
      .catch(function(e) { return { error: e.message }; });
    });
    console.log(JSON.stringify(test1, null, 2).substring(0, 4000));

    // Test 2: Stock-specific endpoints
    console.log('\n=== Test 2: Stock-specific endpoints ===');
    var endpoints = [
      '/tr/api/disclosure/search?stockCode=THYAO',
      '/tr/api/disclosure/byStockCode?stockCode=THYAO',
      '/tr/api/disclosure/byStock?stockCode=THYAO',
      '/tr/api/disclosure?stockCode=THYAO',
      '/tr/api/bildirim-sorgula?sembol=THYAO',
      '/tr/api/disclosure/query?stockCode=THYAO',
      '/tr/api/disclosure/list?stockCode=THYAO'
    ];
    var test2 = [];
    for (var i = 0; i < endpoints.length; i++) {
      try {
        var res = await page.evaluate(function(url) {
          return fetch(url).then(function(r) {
            return r.text().then(function(text) {
              return { status: r.status, size: text.length, snippet: text.substring(0, 500) };
            });
          });
        }, endpoints[i]);
        test2.push({ url: endpoints[i], status: res.status, size: res.size, snippet: res.snippet });
      } catch (e) {
        test2.push({ url: endpoints[i], error: e.message });
      }
    }
    for (var t = 0; t < test2.length; t++) {
      console.log('[' + test2[t].status + '] ' + test2[t].url + ' (' + test2[t].size + 'b)');
      if (test2[t].snippet) console.log('  ' + test2[t].snippet.substring(0, 300));
    }

    // Test 3: Get a disclosure detail via API
    console.log('\n=== Test 3: Disclosure Detail API ===');
    var test3 = await page.evaluate(function() {
      return fetch('/tr/api/disclosure/members/byCriteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate: new Date().toISOString().split('T')[0],
          toDate: new Date().toISOString().split('T')[0],
          memberType: 'IGS',
          mkkMemberOidList: [],
          inactiveMkkMemberOidList: [],
          disclosureClass: '',
          subjectList: [],
          isLate: '',
          mainSector: '',
          sector: '',
          subSector: '',
          marketOid: '',
          index: '',
          bdkReview: '',
          bdkMemberOidList: [],
          year: '',
          term: '',
          ruleType: '',
          period: '',
          fromSrc: false,
          srcCategory: '',
          disclosureIndexList: []
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || data.length === 0) return { error: 'No data' };
        var item = data[0];
        var idx = item.disclosureIndex;
        // Try to get detail from the detail page or API
        return fetch('/tr/api/disclosure/detail?disclosureIndex=' + idx)
          .then(function(r2) {
            return r2.text().then(function(text) {
              return {
                firstDisclosure: item,
                detailStatus: r2.status,
                detailSize: text.length,
                detailContentType: r2.headers.get('content-type'),
                detailSnippet: text.substring(0, 2000)
              };
            });
          })
          .catch(function(e2) {
            return { firstDisclosure: item, error: e2.message };
          });
      })
      .catch(function(e) { return { error: e.message }; });
    });
    console.log(JSON.stringify(test3, null, 2).substring(0, 4000));

    // Test 4: Navigate to a detail page and extract table
    console.log('\n=== Test 4: Detail page HTML ===');
    if (test3 && test3.firstDisclosure && test3.firstDisclosure.disclosureIndex) {
      var idx = test3.firstDisclosure.disclosureIndex;
      console.log('Navigating to disclosure: ' + idx);
      await page.goto('https://www.kap.org.tr/tr/bildirim/' + idx, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(5000);

      var tableHtml = await page.evaluate(function() {
        // Look for the main content table
        var tables = document.querySelectorAll('table');
        var tableData = [];
        for (var i = 0; i < tables.length; i++) {
          tableData.push({
            index: i,
            html: tables[i].outerHTML.substring(0, 1000),
            text: tables[i].innerText.substring(0, 300)
          });
        }
        return {
          url: window.location.href,
          title: document.title,
          tableCount: tables.length,
          tables: tableData,
          bodySnippet: document.body.innerText.substring(0, 2000)
        };
      });
      console.log(JSON.stringify(tableHtml, null, 2).substring(0, 3000));
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
