'use server'

import { searchViralTweets } from "@/lib/twitter";

export async function fetchViralTweetsAction(topic: string) {
    if (!topic || !topic.trim()) {
        return { success: false, error: "Topic is required" };
    }

    try {
        const tweets = await searchViralTweets(topic);
        return { success: true, tweets };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to fetch tweets" };
    }
}
