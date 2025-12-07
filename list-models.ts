import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;

    console.log('📋 Listing available Gemini models...\n');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (data.models) {
        console.log('Available models:');
        for (const model of data.models) {
            if (model.supportedGenerationMethods?.includes('generateContent')) {
                console.log(`  ✅ ${model.name} - supports generateContent`);
            }
        }
    } else {
        console.log('Error:', data);
    }
}

listModels().catch(console.error);
