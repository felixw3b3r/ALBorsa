const axios = require('axios');

async function testExtraction(url) {
    console.log(`Testing extraction for: ${url}`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        const html = response.data;
        
        console.log(`HTML Length: ${html.length}`);
        
        // Test current regex
        const paragraphs = html.match(/<p>(.*?)<\/p>/g) || [];
        console.log(`Found ${paragraphs.length} paragraphs with simple regex.`);
        
        // Test improved regex (handling attributes)
        const improvedParagraphs = html.match(/<p[^>]*>(.*?)<\/p>/g) || [];
        console.log(`Found ${improvedParagraphs.length} paragraphs with improved regex.`);

        // Search for article content specifically
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
        if (articleMatch) {
            console.log("\nFound <article> tag!");
            const articleContent = articleMatch[1];
            const articleParagraphs = articleContent.match(/<p[^>]*>(.*?)<\/p>/g) || [];
            console.log(`Found ${articleParagraphs.length} paragraphs inside <article>.`);
            articleParagraphs.slice(0, 5).forEach((p, i) => {
                console.log(`${i+1}: ${p.replace(/<[^>]*>/g, '').substring(0, 100)}...`);
            });
        }

        // Search for the JSON blob which often contains the full text
        if (html.includes('root.App.main')) {
            console.log("\nFound 'root.App.main' JSON blob!");
            // This is complex to parse with regex, but we know it's there.
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

const testUrl = process.argv[2] || 'https://finance.yahoo.com/news/deucalion-aviation-arranges-acquisition-two-141800725.html';
testExtraction(testUrl);
