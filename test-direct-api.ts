import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testDirectAPI() {
    const apiKey = process.env.GEMINI_API_KEY;

    console.log('🧪 Testing DIRECT Gemini API (no SDK)...\n');

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Say hello in JSON: {"greeting": "..."}' }] }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        }
    );

    console.log('Status:', response.status, response.statusText);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
}

testDirectAPI().catch(console.error);
