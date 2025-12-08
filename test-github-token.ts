// Test if GitHub token is valid at all
import 'dotenv/config';

async function testToken() {
    const token = process.env.GITHUB_TOKEN;

    console.log('Token present:', !!token);
    console.log('Token length:', token?.length);
    console.log('Token starts with:', token?.substring(0, 15));

    // Test 1: Get authenticated user
    console.log('\n=== Test 1: Get authenticated user ===');
    try {
        const res1 = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Agent'
            }
        });
        console.log('Status:', res1.status);
        if (res1.ok) {
            const data = await res1.json();
            console.log('✅ Authenticated as:', data.login);
            console.log('Scopes:', res1.headers.get('x-oauth-scopes'));
        } else {
            console.log('❌ Failed:', await res1.text());
        }
    } catch (e) {
        console.error('Error:', e);
    }

    // Test 2: List user's repos
    console.log('\n=== Test 2: List your repositories ===');
    try {
        const res2 = await fetch('https://api.github.com/user/repos?per_page=5', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Agent'
            }
        });
        console.log('Status:', res2.status);
        if (res2.ok) {
            const repos = await res2.json();
            console.log('✅ Found', repos.length, 'repos:');
            repos.forEach((r: any) => console.log(`  - ${r.full_name} (${r.private ? 'private' : 'public'})`));
        } else {
            console.log('❌ Failed:', await res2.text());
        }
    } catch (e) {
        console.error('Error:', e);
    }

    // Test 3: Access specific repo
    console.log('\n=== Test 3: Access aattaran/tiktok ===');
    try {
        const res3 = await fetch('https://api.github.com/repos/aattaran/tiktok', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Agent'
            }
        });
        console.log('Status:', res3.status);
        if (res3.ok) {
            const repo = await res3.json();
            console.log('✅ Repo accessible:', repo.full_name);
            console.log('Private:', repo.private);
        } else {
            console.log('❌ Failed:', await res3.text());
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

testToken();
