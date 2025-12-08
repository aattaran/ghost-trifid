import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { MermaidChart } from '@mermaidchart/sdk';

async function testMermaidSDK() {
    const token = process.env.MERMAID_ACCESS_TOKEN;
    if (!token) {
        console.error('❌ MERMAID_ACCESS_TOKEN is missing');
        return;
    }

    console.log('🧪 Testing Mermaid Chart SDK...');

    // clientID is required but irrelevant if we manually set the access token
    const client = new MermaidChart({
        clientID: '00000000-0000-0000-0000-000000000000',
        baseURL: 'https://www.mermaidchart.com'
    });

    try {
        console.log('Validating token...');
        await client.setAccessToken(token);

        console.log('\n👤 Fetching User...');
        const user = await client.getUser();
        console.log('✅ User:', user.fullName, `(${user.email})`);

        console.log('\n📂 Fetching Projects...');
        const projects = await client.getProjects();
        console.log(`✅ Found ${projects.length} projects:`);

        for (const project of projects) {
            console.log(`- ${project.title} (ID: ${project.id})`);

            const docs = await client.getDocuments(project.id);
            console.log(`  📄 ${docs.length} documents:`);
            for (const doc of docs) {
                console.log(`    - ${doc.title} (ID: ${doc.documentID})`);
            }
        }

    } catch (error: any) {
        console.error('❌ SDK Error:', error);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testMermaidSDK().catch(console.error);
