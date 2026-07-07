const YahooFinanceModule = require('yahoo-finance2');
const YahooFinance = YahooFinanceModule.default || YahooFinanceModule;
const yahooFinance = new YahooFinance();

async function testUsdRate() {
  try {
    const symbol = 'USDTRY=X';
    console.log(`Fetching quote for: ${symbol}`);
    
    const quote = await yahooFinance.quote(symbol);
    console.log('\n--- Full Quote Object ---');
    console.log(JSON.stringify(quote, null, 2));
    
    console.log('\n--- Exchange Rate Summary ---');
    console.log(`Symbol: ${quote.symbol}`);
    console.log(`Name: ${quote.shortName || quote.longName || quote.symbol}`);
    console.log(`Price (regularMarketPrice): ${quote.regularMarketPrice}`);
    console.log(`Previous Close: ${quote.regularMarketPreviousClose}`);
    console.log(`Bid: ${quote.bid}`);
    console.log(`Ask: ${quote.ask}`);
    console.log(`Price source/fallback price: ${quote.regularMarketPrice || quote.price || quote.bid || quote.ask || quote.regularMarketPreviousClose || 0}`);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

testUsdRate();
