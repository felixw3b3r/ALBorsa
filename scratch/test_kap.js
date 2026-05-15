async function testKAP() {
  try {
    const response = await fetch('https://www.kap.org.tr/tr/api/disclosure/list/main', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.kap.org.tr/tr/',
        'Origin': 'https://www.kap.org.tr'
      },
      body: JSON.stringify({})
    });
    
    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Body Snippet:", text.slice(0, 500));
  } catch(e) {
    console.error("Error:", e.message);
  }
}

testKAP();
