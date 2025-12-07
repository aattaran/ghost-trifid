import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const { postCreativeTweet } = await import('./lib/thread-api');
    const { rwClient } = await import('./lib/twitter');

    // Test different content variants to isolate the issue
    const tests = [
        {
            name: "Plain text with newlines",
            content: `Testing plain text with newlines. ${Date.now()}

This is a second line.
And a third.`
        },
        {
            name: "With bullet points",
            content: `Testing with bullets. ${Date.now()}

• First point
• Second point`
        },
        {
            name: "With markdown bold",
            content: `Testing **bold** text. ${Date.now()}`
        },
        {
            name: "With ampersand",
            content: `Testing local & remote. ${Date.now()}`
        },
        {
            name: "Tweet over 280 chars",
            content: `I turned my Git history into a self-driving marketing engine. Here is what I shipped this weekend with AutoPilot System Monitors local and remote repos for significant changes and AI Analysis reads diffs to generate context-aware tweets. The market cares about consistency. Let the code speak for itself. #BuildInPublic ${Date.now()}`
        }
    ];

    for (const test of tests) {
        console.log(`\n🧪 Testing: ${test.name}`);
        console.log(`   Length: ${test.content.length} chars`);

        const result = await postCreativeTweet(test.content, 'value');

        if (result.success) {
            console.log(`   ✅ SUCCESS`);
            // Cleanup
            const tweetId = result.data?.data?.id;
            if (tweetId) {
                await rwClient.v2.deleteTweet(tweetId);
                console.log(`   🧹 Deleted`);
            }
        } else {
            console.log(`   ❌ FAILED: ${JSON.stringify(result.error)}`);
        }

        // Small delay between tests
        await new Promise(r => setTimeout(r, 1000));
    }
}

main().catch(console.error);
