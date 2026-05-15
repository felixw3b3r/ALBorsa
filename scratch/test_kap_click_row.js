const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
  });
  const page = await context.newPage();

  var apiResponses = {};
  page.on('response', async function(res) {
    var url = res.url();
    if (url.includes('/tr/api/')) {
      try {
        var ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          var json = await res.json();
          apiResponses[url.substring(0, 300)] = { status: res.status(), body: JSON.stringify(json).substring(0, 3000) };
        }
      } catch(e) {}
    }
  });

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

    // Find the table rows
    var tableInfo = await page.evaluate(function() {
      var tables = document.querySelectorAll('table');
      var rowInfo = [];
      for (var t = 0; t < tables.length; t++) {
        var rows = tables[t].querySelectorAll('tr');
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].querySelectorAll('td');
          if (cells.length > 0) {
            var cellTexts = [];
            for (var c = 0; c < cells.length; c++) {
              cellTexts.push(cells[c].textContent.trim().substring(0, 50));
            }
            var rowHtml = rows[r].innerHTML.substring(0, 500);
            rowInfo.push({
              row: r,
              cells: cellTexts,
              html: rowHtml,
              hasLink: !!rows[r].querySelector('a'),
              hasButton: !!rows[r].querySelector('button'),
              onclick: rows[r].getAttribute('onclick') || null
            });
          }
        }
      }
      return rowInfo;
    });

    console.log('Table rows: ' + tableInfo.length);
    for (var i = 0; i < tableInfo.length; i++) {
      console.log('\nRow ' + i + ':');
      console.log('  cells: ' + JSON.stringify(tableInfo[i].cells));
      console.log('  hasLink: ' + tableInfo[i].hasLink + ', hasButton: ' + tableInfo[i].hasButton + ', onclick: ' + tableInfo[i].onclick);
      console.log('  html: ' + tableInfo[i].html);
    }

    // Try to find any clickable element in the first data row (row index 1, skipping header)
    var clickableElements = await page.evaluate(function() {
      var tables = document.querySelectorAll('table');
      if (tables.length === 0) return [];
      var rows = tables[0].querySelectorAll('tr');
      if (rows.length < 2) return [];

      var firstRow = rows[1]; // First data row
      var elements = firstRow.querySelectorAll('a, button, [onclick], [role="button"], td');
      var result = [];
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        var tag = el.tagName;
        var text = el.textContent.trim().substring(0, 80);
        var classes = (el.className || '').substring(0, 80);
        var onclick = el.getAttribute('onclick') || '';
        var style = el.getAttribute('style') || '';
        var html = el.innerHTML.substring(0, 200);
        result.push({ tag: tag, text: text, class: classes, onclick: onclick, style: style, html: html });
      }
      return result;
    });

    console.log('\n=== Clickable elements in first data row:');
    for (var i = 0; i < clickableElements.length; i++) {
      console.log('[' + i + '] <' + clickableElements[i].tag + '> class=' + clickableElements[i].class);
      console.log('  text: ' + clickableElements[i].text);
      console.log('  onclick: ' + clickableElements[i].onclick);
      console.log('  html: ' + clickableElements[i].html);
    }

    // Try clicking a checkbox or cell in the first row and watch for API calls
    console.log('\n=== Clicking first data row ===');

    // Try clicking each td to see if anything happens
    var cells = await page.evaluate(function() {
      var tables = document.querySelectorAll('table');
      if (tables.length === 0) return [];
      var rows = tables[0].querySelectorAll('tr');
      if (rows.length < 2) return [];
      var cells = rows[1].querySelectorAll('td');
      var result = [];
      for (var i = 0; i < cells.length; i++) {
        result.push({
          text: cells[i].textContent.trim().substring(0, 80),
          tag: cells[i].tagName,
          class: (cells[i].className || '').substring(0, 80),
        });
      }
      return result;
    });

    console.log('\n=== First row cells:');
    for (var i = 0; i < cells.length; i++) {
      console.log('[' + i + '] ' + cells[i].tag + ' class=' + cells[i].class + ' text=' + cells[i].text);
    }

    // Now let's click on the 3rd cell (which has KIMMR stock code)
    if (cells.length >= 3) {
      console.log('\n=== Clicking cell with stock code KIMMR ===');
      await page.evaluate(function() {
        var tables = document.querySelectorAll('table');
        var rows = tables[0].querySelectorAll('tr');
        if (rows.length >= 2) {
          var targetCell = rows[1].querySelectorAll('td')[2]; // 3rd cell (0-indexed)
          if (targetCell) {
            targetCell.click();
          }
        }
      });
      await page.waitForTimeout(5000);

      console.log('After click URL: ' + page.url());

      // Check for new API calls
      console.log('\n=== New API responses after click:');
      for (var url in apiResponses) {
        if (url.includes('byCriteria')) continue;
        console.log('[' + apiResponses[url].status + '] ' + url);
        if (apiResponses[url].body) {
          console.log('  ' + apiResponses[url].body.substring(0, 500));
        }
      }

      // Check for any modal/overlay
      var modalCheck = await page.evaluate(function() {
        var divs = document.querySelectorAll('div');
        var modals = [];
        for (var i = 0; i < divs.length; i++) {
          var d = divs[i];
          var style = window.getComputedStyle(d);
          var html = d.innerHTML;
          if ((style.position === 'fixed' || style.position === 'absolute') &&
              html.length > 100 && html.length < 50000 &&
              (html.includes('modal') || html.includes('Modal') || d.className.includes('fixed') || d.className.includes('overlay'))) {
            modals.push({
              class: d.className.substring(0, 100),
              html: html.substring(0, 2000)
            });
          }
        }
        return modals;
      });

      if (modalCheck.length > 0) {
        console.log('\n=== Modal/overlay found:');
        for (var m = 0; m < modalCheck.length; m++) {
          console.log('[' + m + '] ' + modalCheck[m].class);
          console.log(modalCheck[m].html);
        }
      } else {
        console.log('\nNo modal/overlay appeared');
      }
    }

  } catch (e) {
    console.error('Hata:', e.message);
  }

  await browser.close();
})();
