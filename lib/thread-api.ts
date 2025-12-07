import { generateTweetVariations } from "@/lib/ai";
import { generateImage } from "@/lib/image-gen";
import { postThread, postToTwitter, uploadMedia } from "@/lib/twitter";

// Action to generate text options
export async function generateOptionsAction(input: string) {
    try {
        const variations = await generateTweetVariations(input);

        if (!variations) {
            return { success: false, error: "AI generation failed or was blocked. Check server logs." };
        }

        return { success: true, data: variations };
    } catch (error) {
        console.error("Action Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown server error";
        return { success: false, error: errorMessage };
    }
}

// Action to generate an image preview
export async function generateImagePreview(prompt: string) {
    try {
        const imgBuffer = await generateImage(prompt);
        if (imgBuffer) {
            const base64 = imgBuffer.toString('base64');
            return { success: true, image: `data:image/png;base64,${base64}` };
        }
        return { success: false, error: "Failed to generate image" };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown error generating preview" };
    }
}

// Action to Post the chosen version
export async function postCreativeTweet(
    content: string | string[],
    type: 'hook' | 'value' | 'thread',
    imagePrompts?: string | string[] // Can now be array
) {

    try {
        // Helper to upload single prompt
        const uploadPrompt = async (p: string) => {
            const imgBuffer = await generateImage(p);
            if (imgBuffer) return await uploadMedia(imgBuffer, 'image/png');
            return undefined;
        };

        // 1. Thread Logic with Multi-Image Support
        if (Array.isArray(content) && type === 'thread') {

            // Prepare prompts array (ensure it matches content length roughly)
            const prompts = Array.isArray(imagePrompts) ? imagePrompts : (imagePrompts ? [imagePrompts] : []);

            const threadTweets = await Promise.all(content.map(async (text, index) => {
                let mediaId = undefined;
                // If we have a prompt for this index, generate and upload
                if (prompts[index]) {
                    mediaId = await uploadPrompt(prompts[index]);
                }

                return {
                    text,
                    media: mediaId ? { media_ids: [mediaId] } : undefined
                };
            }));

            return await postThread(threadTweets);

        } else if (typeof content === 'string') {
            // const singlePrompt = Array.isArray(imagePrompts) ? imagePrompts[0] : imagePrompts;

            // Note: postToTwitter currently doesn't support media in this simplified version.
            // We could expand it if needed, but for now focus on Thread images.
            return await postToTwitter(content);
        }

        return { success: false, error: "Invalid content format" };

    } catch (error: any) {
        console.error("Server Action Failed:", error);
        return { success: false, error: error.message || "Unknown Server Action Error" };
    }
}
