'use server'

import { generateTweetVariations, TweetOption } from "@/lib/ai";
import { postThread, postToTwitter, uploadMedia } from "@/lib/twitter";
import { generateImage } from "@/lib/image-gen";

export async function generateOptionsAction(input: string) {
    if (!input || input.length < 3) return { success: false, error: "Input too short" };

    const options = await generateTweetVariations(input);
    return { success: true, data: options };
}

export async function publishVariationAction(option: TweetOption) {
    try {
        let mediaId: string | undefined = undefined;

        // 1. Generate Image if prompt exists
        if (option.imagePrompt) {
            console.log("🎨 Generating Image for Variation:", option.imagePrompt);
            const imgBuffer = await generateImage(option.imagePrompt);
            if (imgBuffer) {
                mediaId = await uploadMedia(imgBuffer, 'image/png') || undefined;
            }
        }

        // 2. Publish
        if (option.type === 'thread' && option.content.length > 1) {
            // Thread Logic: Attach image to FIRST tweet only for now
            const threadPayload = option.content.map((text, i) => ({
                text,
                media: (i === 0 && mediaId) ? { media_ids: [mediaId!] } : undefined
            }));
            const res = await postThread(threadPayload);
            return res;
        } else {
            // Single Tweet Logic
            // Note: postToTwitter doesn't natively support media_ids in our current simple wrapper
            // We need to use rwClient directly or update postToTwitter. 
            // Let's use postThread for single tweets too (it works as a thread of 1)
            const payload = [{
                text: option.content[0],
                media: mediaId ? { media_ids: [mediaId] } : undefined
            }];
            const res = await postThread(payload);
            return res;
        }

    } catch (e: any) {
        console.error("Publish Variation Failed", e);
        return { success: false, error: e.message };
    }
}
