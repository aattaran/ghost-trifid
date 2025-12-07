import dotenv from 'dotenv';
import { TwitterApi } from 'twitter-api-v2';

dotenv.config({ path: '.env.local' });

async function testPost() {
    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    const uniqueId = Date.now();
    const content = `Test post from Ghost Trifid - ${uniqueId}. Debugging 403 error. Will delete shortly.`;

    console.log('📤 Attempting to post...');
    console.log(`Content: ${content}`);

    try {
        const result = await client.v2.tweet(content);
        console.log('✅ SUCCESS! Tweet ID:', result.data.id);

        // Cleanup
        console.log('🧹 Deleting test tweet...');
        await client.v2.deleteTweet(result.data.id);
        console.log('✅ Cleanup complete.');

    } catch (error: any) {
        console.log('❌ FAILED');
        console.log('Error Code:', error.code);
        console.log('Error Data:', JSON.stringify(error.data, null, 2));
        console.log('Rate Limit:', JSON.stringify(error.rateLimit, null, 2));
    }
}

testPost();
