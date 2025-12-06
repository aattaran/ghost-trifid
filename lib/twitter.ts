import { TwitterApi } from 'twitter-api-v2';

// ENHANCED DEBUGGING: Check for missing keys individually
const requiredEnvVars = [
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET'
];

const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
    // This will show up in your terminal logs so you know exactly what is missing
    console.error(`❌ Missing .env variables: ${missingVars.join(', ')}`);
    throw new Error(`Missing Twitter API Credentials: ${missingVars.join(', ')}`);
}

const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

export const rwClient = client.readWrite;

export async function postToTwitter(content: string) {
    try {
        const tweet = await rwClient.v2.tweet(content);
        console.log("✅ Tweet published:", tweet);
        return { success: true, data: tweet };
    } catch (error: any) {
        // ENHANCED DEBUGGING: Detailed error logging
        console.error("❌ Twitter API Failed.");

        if (error.code) console.error("Error Code:", error.code);
        if (error.data) {
            console.error("Error Details:", JSON.stringify(error.data, null, 2));
        } else {
            console.error("Full Error:", error);
        }

        return { success: false, error: error.data || error.message };
    }
}

/**
 * Uploads media to Twitter (v1.1 API)
 * @param buffer Image buffer
 * @param mimeType Mime type (e.g. 'image/png')
 * @returns Media ID string or null
 */
export async function uploadMedia(buffer: Buffer, mimeType: string) {
    try {
        // v1.1 is required for media upload
        const mediaId = await client.v1.uploadMedia(buffer, { mimeType });
        return mediaId;
    } catch (error) {
        console.error("❌ Media Upload Failed:", error);
        return null;
    }
}

/**
 * Posts a thread of tweets
 * @param tweets Array of tweet objects { text, media?: { media_ids: [] } }
 */
export async function postThread(tweets: { text: string; media?: { media_ids: string[] } }[]) {
    try {
        // Cast to any to avoid strict tuple length checks from the library types
        const result = await rwClient.v2.tweetThread(tweets as any);
        console.log("✅ Thread published. Count:", result.length);
        return { success: true, data: result };
    } catch (error: any) {
        console.error("❌ Thread Failed:", JSON.stringify(error, null, 2));
        return { success: false, error: error.data || error.message };
    }
}

// Alias for compatibility if other files expect 'publishThread'
export const publishThread = postThread;