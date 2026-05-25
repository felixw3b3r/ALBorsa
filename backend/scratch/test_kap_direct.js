const axios = require('axios');

async function testKap() {
  try {
    console.log('Testing KAP API...');
    const response = await axios.post(
      'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
      {
        pageSize: 100,
        pageIndex: 0,
        disclosureClass: "ALL",
        disclosureType: "ALL",
        stockCodes: "",
        memberType: "ALL",
        subject: "",
        orderByField: "publishDate",
        orderByType: "desc"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.kap.org.tr/tr/bildirim-sorgu',
          'Origin': 'https://www.kap.org.tr',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 20000
      }
    );

    console.log('Response status:', response.status);
    console.log('Data type:', typeof response.data);
    console.log('Data is array:', Array.isArray(response.data));
    
    if (Array.isArray(response.data)) {
      console.log('Number of items:', response.data.length);
      if (response.data.length > 0) {
        console.log('First item:', JSON.stringify(response.data[0], null, 2));
      }
    } else {
      console.log('Data sample:', JSON.stringify(response.data).substring(0, 500));
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
  }
}

testKap();
