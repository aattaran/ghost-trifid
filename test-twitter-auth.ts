
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function checkTwitterAuth() {
    console.log("🔍 Checking Twitter Credentials...");

    const appKey = process.env.TWITTER_API_KEY;
    const appSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
        console.error("❌ Missing one or more Twitter environment variables.");
        return;
    }

    const client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
    });

    try {
        // 1. Check Read Access (Me)
        const me = await client.v2.me();
        console.log(`✅ Authentication Successful! Logged in as: @${me.data.username} (${me.data.id})`);

        // 2. Check Write Access (Tweet)
        console.log("📝 Attempting to post a test tweet to verify Write permissions...");
        const testTweet = await client.v2.tweet(`Test tweet from Antigravity check script at ${new Date().toISOString()}`);
        console.log("✅ Write Permission Confirmed! Tweet ID:", testTweet.data.id);

        // Optional: Clean up
        console.log("🧹 Deleting test tweet...");
        await client.v2.deleteTweet(testTweet.data.id);
        console.log("✅ Cleanup successful.");

    } catch (error: any) {
        console.error("❌ verification Failed.");
        if (error.code === 403) {
            console.error("⛔ 403 FORBIDDEN: This usually means your App permissions are 'Read Only'.");
            console.error("👉 Solution: Go to Twitter Developer Portal > Settings > User authentication settings > App permissions, and change to 'Read and Write'. Then REGENERATE your Access Token/Secret.");
        } else if (error.code === 401) {
            console.error("⛔ 401 UNAUTHORIZED: Your keys/tokens are likely invalid or expired.");
        } else {
            console.error("Error Details:", JSON.stringify(error, null, 2));
        }
    }
}

checkTwitterAuth();
