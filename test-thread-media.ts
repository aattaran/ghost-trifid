import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function testThreadWithMedia() {
    console.log("🔍 Testing Thread with Media...");

    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    try {
        // Upload test image
        const imageBuffer = fs.readFileSync('./test-screenshot-1.png');
        console.log("⬆️ Uploading media...");
        const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: 'image/png' });
        console.log("✅ Media ID:", mediaId);

        // Create thread with media
        const threadTweets = [
            { text: `Test thread tweet 1 - ${Date.now()}`, media: { media_ids: [mediaId] } },
            { text: `Test thread tweet 2 - continuation` }
        ];

        console.log("📝 Posting thread...");
        const result = await client.v2.tweetThread(threadTweets);
        console.log("✅ Thread posted! Count:", result.length);
        result.forEach((t, i) => console.log(`  Tweet ${i + 1}: ${t.data?.id}`));

        // Cleanup
        console.log("🧹 Cleaning up...");
        for (const t of result) {
            if (t.data?.id) await client.v2.deleteTweet(t.data.id);
        }
        console.log("✅ Done.");

    } catch (error: any) {
        console.error("❌ Thread Test Failed:", error);
    }
}

testThreadWithMedia();
