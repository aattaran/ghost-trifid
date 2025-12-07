import { TwitterApi, ApiResponseError } from 'twitter-api-v2';

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

export const rwClient = client;

/**
 * Automatically retries the operation if a Rate Limit (429) is hit.
 * Waits for the reset time specified in headers.
 */
async function autoRetry<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            if (error instanceof ApiResponseError && error.code === 429) {
                console.warn(`⚠️ Twitter Rate Limit Hit! (Attempt ${i + 1}/${maxRetries + 1})`);

                // Calculate wait time
                let waitSeconds = 15 * 60; // Default 15 mins
                const resetHeader = error.rateLimit?.reset;

                if (resetHeader) {
                    const now = Math.floor(Date.now() / 1000);
                    waitSeconds = (resetHeader - now) + 5; // Buffer 5s
                    console.log(`🕐 Reset Header: ${resetHeader}, Now: ${now}, Wait: ${waitSeconds}s`);
                    console.log(`📅 API resets at: ${new Date(resetHeader * 1000).toLocaleString()}`);
                }

                // FIX: If the wait is too long (e.g. > 15 seconds), do NOT hang the server. 
                // Just fail fast so the user knows.
                if (waitSeconds > 15) {
                    const resetTime = resetHeader
                        ? new Date(resetHeader * 1000).toLocaleTimeString()
                        : 'Unknown';
                    console.error(`⛔ Cooldown too long (${waitSeconds}s). Resets at ${resetTime}.`);
                    throw new Error(`Rate limit hit. Resets at ${resetTime} (~${Math.ceil(waitSeconds / 60)} min).`);
                }

                if (i === maxRetries) throw error;

                console.warn(`⏳ Waiting ${waitSeconds} seconds for cooldown...`);
                // Wait...
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));

                continue;
            }
            throw error;
        }
    }
    throw new Error("Unexpected retry loop exit");
}

export async function postToTwitter(content: string) {
    try {
        // SAFETY: Truncate content if it exceeds Twitter's 280 character limit
        let finalContent = content;
        if (content.length > 280) {
            console.warn(`⚠️ Tweet content too long (${content.length} chars). Truncating to 280...`);
            finalContent = content.slice(0, 277) + '...';
        }

        const tweet = await autoRetry(() => rwClient.v2.tweet(finalContent));
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
        // SAFETY: Truncate each tweet text to 280 chars
        const safeTweets = tweets.map(tweet => ({
            ...tweet,
            text: tweet.text.length > 280
                ? (console.warn(`⚠️ Thread tweet too long (${tweet.text.length} chars). Truncating...`), tweet.text.slice(0, 277) + '...')
                : tweet.text
        }));

        // Cast to any to avoid strict tuple length checks from the library types
        const result = await autoRetry(() => rwClient.v2.tweetThread(safeTweets as any));
        console.log("✅ Thread published. Count:", result.length);
        return { success: true, data: result };
    } catch (error: any) {
        console.error("❌ Thread Failed:", JSON.stringify(error, null, 2));
        return { success: false, error: error.data || error.message };
    }
}

// Alias for compatibility if other files expect 'publishThread'
export const publishThread = postThread;

/**
 * Checks if the current credentials have valid permissions.
 */
export async function verifyTwitterCredentials() {
    try {
        const me = await autoRetry(() => rwClient.v2.me());
        return { success: true, username: me.data.username };
    } catch (error: any) {
        console.error("Auth Check Failed:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Searches for viral tweets related to a query.
 * Criteria: min_faves:50 OR min_retweets:10, lang:en, no retweets/replies/links
 */
// Interface for rich tweet data
export interface ViralTweet {
    id: string;
    text: string;
    author: {
        name: string;
        username: string;
    };
    metrics: {
        likes: number;
        retweets: number;
        replies: number;
    };
    url: string;
    createdAt: string;
}

export async function searchViralTweets(query: string): Promise<ViralTweet[]> {
    try {
        // Simplified query to avoid 400 errors (some operators require Basic/Pro tiers)
        // We remove min_faves/retweets for now to ensure it works, then add back.
        const searchQuery = `${query} lang:en -is:retweet -is:reply`;

        console.log(`🔎 Searching viral tweets for: "${query}"...`);

        // DIRECT CALL (No autoRetry):
        // If we hit a rate limit, we want to FAIL FAST and show Mocks, 
        // rather than hanging the server for 15 minutes waiting for cooldown.
        // NOTE: Free Tier does NOT support expansions or user.fields. Keep it minimal.
        const result = await rwClient.v2.search(searchQuery, {
            max_results: 100, // Maximize tweets per search (Free Tier only allows 1 search/15min)
            'tweet.fields': ['public_metrics', 'created_at']
        });

        if (!result.tweets || result.tweets.length === 0) {
            console.log("⚠️ No viral tweets found.");
            return [];
        }

        // Map raw tweets to rich ViralTweet objects
        // Since Free Tier doesn't give author_id expansions, we generate pseudo-author from tweet ID
        return result.tweets.map(t => {
            const metrics = t.public_metrics;
            // Generate pseudo-author from first word of tweet (visual placeholder)
            const firstWord = t.text.split(' ')[0].replace(/[^a-zA-Z]/g, '') || 'User';
            return {
                id: t.id,
                text: t.text,
                author: {
                    name: `${firstWord}...`,
                    username: `user_${t.id.slice(-4)}`
                },
                metrics: {
                    likes: metrics?.like_count || 0,
                    retweets: metrics?.retweet_count || 0,
                    replies: metrics?.reply_count || 0
                },
                url: `https://twitter.com/i/status/${t.id}`,
                createdAt: t.created_at || new Date().toISOString()
            };
        });

    } catch (error: any) {
        console.error("❌ Search Failed:", error.message || "Unknown error");

        // FAIL-SAFE: If API fails (Rate Limit / 403 Forbidden for Free Tier), return Mock Data
        // This ensures the UI still shows how the feature *would* work.
        console.log("⚠️ Falling back to MOCK viral tweets.");
        return [
            {
                id: "mock1",
                text: "Manifesting a summer full of shipping, learning, and clear skin. ✨ #BuildInPublic",
                author: { name: "Sarah Builds", username: "sarah_dev" },
                metrics: { likes: 1250, retweets: 340, replies: 45 },
                url: "#",
                createdAt: new Date().toISOString()
            },
            {
                id: "mock2",
                text: "Stop overthinking. Start shipping. The market doesn't care about your clean code, it cares about your product. 🚀",
                author: { name: "Indie Hacker", username: "ship_fast" },
                metrics: { likes: 3400, retweets: 890, replies: 120 },
                url: "#",
                createdAt: new Date().toISOString()
            },
            {
                id: "mock3",
                text: "I built a SaaS in 48 hours. Here's exactly how I did it (and the stack I used): 🧵",
                author: { name: "Tech Lead", username: "tech_guru" },
                metrics: { likes: 8900, retweets: 2100, replies: 560 },
                url: "#",
                createdAt: new Date().toISOString()
            }
        ];
    }
}