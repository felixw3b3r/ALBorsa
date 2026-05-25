const YahooFinanceModule = require('yahoo-finance2');
// In some environments, require('yahoo-finance2') might be the class itself or have a default property
const YahooFinance = YahooFinanceModule.default || YahooFinanceModule;
const yahooFinance = new YahooFinance();

async function testSearch() {
  try {
    const symbol = 'THYAO.IS';
    console.log(`Searching news for: ${symbol}`);
    
    const quote = await yahooFinance.quote(symbol);
    const searchQuery = quote.shortName || quote.longName || symbol;
    console.log(`Search query: ${searchQuery}`);

    const result = await yahooFinance.search(searchQuery, { newsCount: 10 });
    console.log(`Found ${result.news ? result.news.length : 0} news items.`);
    
    if (result.news) {
      result.news.forEach((item, i) => {
        console.log(`${i+1}: ${item.title} (${item.publisher})`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

testSearch();
