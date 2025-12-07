import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { GoogleGenerativeAI } from '@google/generative-ai';

async function testGeminiDirect() {
    console.log('🧪 Testing Gemini API directly...\n');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('❌ GEMINI_API_KEY is not set!');
        return;
    }

    console.log(`API Key present: Yes (starts with ${apiKey.substring(0, 10)}...)`);

    const genAI = new GoogleGenerativeAI(apiKey);

    // Try the simplest possible request
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
        console.log('\n📤 Sending simple test prompt...');
        const result = await model.generateContent('Say "Hello World" in JSON format: { "message": "..." }');
        const text = result.response.text();
        console.log('✅ Response:', text);
    } catch (error: any) {
        console.log('❌ FAILED!');
        console.log('Error Type:', error.constructor.name);
        console.log('Error Message:', error.message);
        if (error.response) {
            console.log('Response Status:', error.response.status);
            console.log('Response Text:', await error.response.text?.());
        }
    }
}

testGeminiDirect().catch(console.error);
