const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function testGemini() {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: 'Hello, respond with one word: "Success"'
        });
        console.log('Result structure:', Object.keys(result));
        if (result.text) {
            console.log('result.text type:', typeof result.text);
            console.log('result.text value:', result.text);
        }
        if (result.response) {
            console.log('result.response exists');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testGemini();
