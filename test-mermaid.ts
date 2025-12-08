import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MERMAID_BASE_URL = 'https://www.mermaidchart.com/rest-api';

async function testMermaidAPI() {
    const token = process.env.MERMAID_ACCESS_TOKEN;
    if (!token) {
        console.error('❌ MERMAID_ACCESS_TOKEN is missing');
        return;
    }

    console.log('🧪 Testing Mermaid Chart API...');
    console.log(`🔑 Token: ${token.substring(0, 10)}...`);

    try {
        // Test Authentication by getting current user info (if possible, or just list users)
        // Note: The search results showed GET /rest-api/users
        console.log('\n👤 Fetching Users...');
        const response = await fetch(`${MERMAID_BASE_URL}/users`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            console.error('Error Body:', await response.text());
        } else {
            const data = await response.json();
            console.log('✅ Success! Data:', JSON.stringify(data, null, 2));
        }

    } catch (error: any) {
        console.error('❌ Failed:', error.message);
    }
}

testMermaidAPI().catch(console.error);
