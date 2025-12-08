// Test with explicit dotenv path
import { config } from 'dotenv';
import path from 'path';

// Load .env.local explicitly
const result = config({ path: path.join(process.cwd(), '.env.local') });

console.log('Dotenv loaded:', !result.error);
if (result.error) {
    console.error('Dotenv error:', result.error);
}

console.log('\n=== Environment Variables ===');
console.log('GITHUB_TOKEN present:', !!process.env.GITHUB_TOKEN);
console.log('GITHUB_TOKEN length:', process.env.GITHUB_TOKEN?.length);
console.log('GITHUB_TOKEN value:', process.env.GITHUB_TOKEN?.substring(0, 30) + '...');
console.log('\nTWITTER_API_KEY present:', !!process.env.TWITTER_API_KEY);
console.log('GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);

// Now test GitHub API
if (process.env.GITHUB_TOKEN) {
    console.log('\n=== Testing GitHub API ===');
    const res = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'User-Agent': 'Antigravity-Agent'
        }
    });

    console.log('Status:', res.status);
    if (res.ok) {
        const data = await res.json();
        console.log('✅ Authenticated as:', data.login);
    } else {
        const text = await res.text();
        console.log('❌ Error:', text);
    }
}
