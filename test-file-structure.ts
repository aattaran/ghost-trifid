// Test script for the new getRepoFileStructure function
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRepoFileStructure } from './lib/github-api';

async function testFileStructure() {
    console.log('🧪 Testing getRepoFileStructure...\n');

    // Test with a public repo first
    const publicOwner = 'vercel';
    const publicRepo = 'next.js';

    console.log(`📦 Testing public repo: ${publicOwner}/${publicRepo}`);
    const publicFiles = await getRepoFileStructure(publicOwner, publicRepo);

    if (publicFiles) {
        console.log(`✅ Found ${publicFiles.length} files`);
        console.log('📄 Sample files:', publicFiles.slice(0, 10));
    } else {
        console.log('❌ Failed to fetch public repo structure');
    }

    console.log('\n---\n');

    // Test with the target private repo
    const privateOwner = 'aattaran';
    const privateRepo = 'tiktok';

    console.log(`📦 Testing private repo: ${privateOwner}/${privateRepo}`);
    const privateFiles = await getRepoFileStructure(privateOwner, privateRepo);

    if (privateFiles) {
        console.log(`✅ Found ${privateFiles.length} files`);
        console.log('📄 Sample files:', privateFiles.slice(0, 10));
    } else {
        console.log('❌ Could not access private repo (expected if token lacks access)');
        console.log('💡 Use the local fallback: copy code files to test-code-samples/');
    }
}

testFileStructure().catch(console.error);
