const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function testYahooKAP() {
  try {
    const result = await yahooFinance.search("THYAO KAP", { newsCount: 10 });
    console.log("Found", result.news?.length, "news items.");
    result.news?.forEach(n => {
      console.log("-", n.title, "(", n.publisher, ")");
    });
  } catch(e) {
    console.error(e);
  }
}

testYahooKAP();
