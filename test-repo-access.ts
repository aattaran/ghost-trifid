// Test accessing the tiktok repo directly
import { config } from 'dotenv';
config({ path: '.env.local' });

const token = process.env.GITHUB_TOKEN;

async function testRepo() {
    console.log('Testing repo access...\n');

    // Test 1: Get repo info
    const res1 = await fetch('https://api.github.com/repos/aattaran/tiktok', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Test',
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    console.log('Repo info status:', res1.status);
    if (res1.ok) {
        const data = await res1.json();
        console.log('✅ Repo accessible:', data.full_name);
        console.log('Private:', data.private);
    } else {
        console.log('❌ Error:', await res1.text());
    }

    console.log('\n---\n');

    // Test 2: Get commits
    const res2 = await fetch('https://api.github.com/repos/aattaran/tiktok/commits?per_page=1', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Test',
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    console.log('Commits status:', res2.status);
    if (res2.ok) {
        const data = await res2.json();
        console.log('✅ Commits accessible:', data[0]?.sha);
    } else {
        console.log('❌ Error:', await res2.text());
    }
}

testRepo();
