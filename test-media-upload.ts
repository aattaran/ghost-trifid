import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function testMediaUpload() {
    console.log("🔍 Testing Media Upload...");

    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    try {
        // Use an existing screenshot file
        const testImagePath = './test-screenshot-1.png';
        if (!fs.existsSync(testImagePath)) {
            console.log("❌ Test image not found at:", testImagePath);
            return;
        }

        const imageBuffer = fs.readFileSync(testImagePath);
        console.log(`📸 Read image: ${imageBuffer.length} bytes`);

        // Test v1.1 media upload
        console.log("⬆️ Uploading to Twitter v1.1 media API...");
        const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: 'image/png' });
        console.log("✅ Media uploaded! Media ID:", mediaId);

        // Test posting tweet with media
        console.log("📝 Posting tweet with media...");
        const tweet = await client.v2.tweet({
            text: `Testing media upload at ${new Date().toISOString().slice(0, 19)}`,
            media: { media_ids: [mediaId] }
        });
        console.log("✅ Tweet with media posted! ID:", tweet.data.id);

        // Cleanup
        console.log("🧹 Cleaning up...");
        await client.v2.deleteTweet(tweet.data.id);
        console.log("✅ Cleanup done.");

    } catch (error: any) {
        console.error("❌ Media Test Failed:", error);
        if (error.code) console.error("Error code:", error.code);
        if (error.data) console.error("Error data:", JSON.stringify(error.data, null, 2));
    }
}

testMediaUpload();
