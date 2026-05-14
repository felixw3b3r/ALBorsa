async function testBackend() {
  try {
    const res = await fetch('http://localhost:5000/api/market-summary');
    const data = await res.json();
    console.log('✅ Backend is UP. Response length:', JSON.stringify(data).length);
  } catch (err) {
    console.error('❌ Backend is DOWN or Error:', err.message);
  }
}

testBackend();
