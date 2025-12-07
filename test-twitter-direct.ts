import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { TwitterApi, ApiResponseError } from 'twitter-api-v2';

async function testTwitterDirectly() {
    console.log('🧪 Testing Twitter API directly...\n');

    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    const rwClient = client.readWrite;

    const testContent = `🧪 Autopilot test ${Date.now()} - If you see this, the API works!`;
    console.log('Posting:', testContent);
    console.log('Length:', testContent.length, 'chars\n');

    try {
        const tweet = await rwClient.v2.tweet(testContent);
        console.log('✅ SUCCESS! Tweet posted:', tweet);

        // Delete it immediately
        console.log('\n🗑️ Deleting test tweet...');
        await rwClient.v2.deleteTweet(tweet.data.id);
        console.log('✅ Tweet deleted.');

    } catch (error: any) {
        console.log('❌ FAILED!');
        console.log('Error Type:', error.constructor.name);
        console.log('Error Code:', error.code);
        console.log('Error Message:', error.message);

        if (error instanceof ApiResponseError) {
            console.log('\n📋 API Response Error Details:');
            console.log('Rate Limit Info:', error.rateLimit);
            console.log('Error Data:', JSON.stringify(error.data, null, 2));
            console.log('Response Headers:', error.headers);
        }
    }
}

testTwitterDirectly().catch(console.error);
