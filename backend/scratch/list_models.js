const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log('Listing models...');
        // Assuming there is a listModels method or similar
        const models = await genAI.models.list(); 
        console.log('Models:', JSON.stringify(models, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

listModels();
