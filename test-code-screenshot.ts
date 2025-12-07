import dotenv from 'dotenv';
import { generateCodeScreenshot, screenshotFromGitHub } from './lib/code-screenshot';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function testCodeScreenshot() {
    console.log('🧪 Testing Carbonara API (code screenshots)...\n');

    // Test 1: Simple code snippet
    console.log('Test 1: Simple TypeScript snippet');
    const buffer1 = await generateCodeScreenshot({
        code: `export async function checkAndRunAutoPilot() {
    console.log("🤖 AutoPilot: Starting check...");
    const state = await getAutoPilotState();
    
    if (!state.isActive) {
        return { success: false, reason: 'inactive' };
    }
    
    // Run the autopilot logic...
    return { success: true };
}`,
        language: 'typescript',
        theme: 'dracula'
    });

    if (buffer1) {
        fs.writeFileSync('test-screenshot-1.png', buffer1);
        console.log('✅ Saved to test-screenshot-1.png\n');
    } else {
        console.log('❌ Failed\n');
    }

    // Test 2: From GitHub
    console.log('Test 2: Screenshot from GitHub repo');
    const buffer2 = await screenshotFromGitHub(
        'aattaran',
        'ghost-trifid',
        'lib/autopilot-core.ts'
    );

    if (buffer2) {
        fs.writeFileSync('test-screenshot-2.png', buffer2);
        console.log('✅ Saved to test-screenshot-2.png\n');
    } else {
        console.log('❌ Failed\n');
    }

    console.log('🏁 Done!');
}

testCodeScreenshot().catch(console.error);
