const axios = require('axios');

async function testKapGet() {
  try {
    console.log('Testing KAP API (GET)...');
    const response = await axios.get(
      'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
      {
        params: { pageSize: 100, pageIndex: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
        },
        timeout: 15000
      }
    );

    console.log('Response status:', response.status);
    console.log('Number of items:', Array.isArray(response.data) ? response.data.length : 'not an array');
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log('First item:', JSON.stringify(response.data[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testKapGet();
