import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { generateTweetVariations } from './lib/ai';

async function testAI() {
    console.log('🧪 Testing Gemini AI response...\n');

    const testInput = `
    Here are the latest engineering updates for aattaran/ghost-trifid (Build in Public update):

    - feat: introduce core autopilot system for repository monitoring and automated social media posting.
    - feat: Introduce an autopilot system with tweet generation, code screenshot capabilities, and Twitter API integration.

    **Viral Inspiration:**
    - "Stop overthinking. Start shipping. The market doesn't care about your clean code, it cares about your product. 🚀"
    
    Task: Write an engaging 'Build in Public' update about this progress.
    `;

    console.log('Input (first 200 chars):', testInput.substring(0, 200) + '...\n');

    const result = await generateTweetVariations(testInput);

    console.log('\n📊 RESULT:');
    console.log('Hook:', result.hook ? `"${result.hook}"` : '(EMPTY)');
    console.log('Value:', result.value ? `"${result.value}"` : '(EMPTY)');
    console.log('Thread:', result.thread && result.thread.length > 0 ? result.thread : '(EMPTY)');
}

testAI().catch(console.error);
