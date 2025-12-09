// Quick test to see what files exist in aattaran/tiktok repo
import { getRepoFileContentRaw } from '../lib/github-api';

const owner = 'aattaran';
const repo = 'tiktok';

const filesToCheck = [
    // Root level
    'README.md',
    'package.json',
    'manifest.json',
    // tikko-ext-main nested structure
    'tikko-ext-main/tikko-ext-main/manifest.json',
    'tikko-ext-main/tikko-ext-main/package.json',
    'tikko-ext-main/tikko-ext-main/background.js',
    'tikko-ext-main/tikko-ext-main/content.js',
    // tikko-main nested structure
    'tikko-main/tikko-main/package.json',
    'tikko-main/tikko-main/src/index.ts',
    'tikko-main/tikko-main/src/index.js',
    // Standard paths
    'src/index.ts',
    'background.js',
    'content.js',
    'index.js'
];

async function testFiles() {
    console.log(`\n🔍 Checking files in ${owner}/${repo}...\n`);

    for (const file of filesToCheck) {
        const content = await getRepoFileContentRaw(owner, repo, file);
        if (content) {
            console.log(`✅ ${file} (${content.length} bytes)`);
        } else {
            console.log(`❌ ${file}`);
        }
    }
}

testFiles().catch(console.error);
