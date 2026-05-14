async function testSymbol() {
  const symbol = 'GC=F';
  const url = `http://localhost:5000/api/stocks/${symbol}?range=1g&interval=15m`;
  console.log(`🔍 Testing URL: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Request failed with status: ${res.status}`);
      const text = await res.text();
      console.error(`Response text: ${text}`);
      return;
    }
    const data = await res.json();
    console.log('✅ Success! Data received. History length:', data.history?.length);
  } catch (err) {
    console.error('❌ Connection Error:', err.message);
  }
}

testSymbol();
