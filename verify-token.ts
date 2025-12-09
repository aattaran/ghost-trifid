// Simple token verification
import { config } from 'dotenv';
config({ path: '.env.local' });

const token = process.env.GITHUB_TOKEN;

async function verify() {
    console.log('Token length:', token?.length);
    console.log('Token preview:', token?.substring(0, 40) + '...' + token?.substring(token.length - 10));

    // Test 1: Get authenticated user
    const res = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${token}`,  // Try Bearer instead of token
            'User-Agent': 'Test'
        }
    });

    console.log('\nBearer auth status:', res.status);
    if (res.ok) {
        const data = await res.json();
        console.log('User:', data.login);
        return;
    }

    // Test 2: Try with 'token' prefix
    const res2 = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `token ${token}`,
            'User-Agent': 'Test'
        }
    });

    console.log('Token auth status:', res2.status);
    if (res2.ok) {
        const data = await res2.json();
        console.log('✅ Authenticated as:', data.login);
        console.log('Scopes:', res2.headers.get('x-oauth-scopes'));
    } else {
        console.log('❌ Error:', await res2.text());
    }
}

verify();
