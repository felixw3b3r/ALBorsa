const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testAkbank() {
    try {
        console.log("Searching for AKBNK.IS news...");
        const result = await yahooFinance.search('Akbank', { newsCount: 5 });
        console.log(`Found ${result.news ? result.news.length : 0} news items.`);
        if (result.news) {
            result.news.forEach((n, i) => {
                console.log(`${i+1}: ${n.title}`);
            });
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

testAkbank();
