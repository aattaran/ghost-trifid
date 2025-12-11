import { generateTweetVariations } from "@/lib/ai";
// import { generateImage } from "@/lib/image-gen"; // DISABLED: Using code screenshots instead
import { generateCodeScreenshot } from "@/lib/code-screenshot";
import { postThread, postToTwitter, uploadMedia } from "@/lib/twitter";
import fs from 'fs/promises';

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
// NOTE: This function still uses Imagen for UI previews, not for autopilot posts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateImagePreview(_prompt: string): Promise<{ success: boolean; error?: string; image?: string }> {
    // DISABLED: Return error since we're using code screenshots now
    return { success: false, error: "Image generation disabled. Using code screenshots instead.", image: undefined };
    /* Original Imagen code:
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
    */
}

// Action to Post the chosen version
export async function postCreativeTweet(
    content: string | string[],
    type: 'hook' | 'value' | 'thread',
    imagePrompts?: string | string[] // Should be "CODE:actual_code_here" for code screenshots
) {

    try {
        // Helper to generate and upload CODE SCREENSHOTS or DIAGRAM files
        // Gemini image generation is DISABLED
        const uploadPrompt = async (p: string) => {
            let imgBuffer: Buffer | null = null;

            // Check if this is a diagram file request (starts with "DIAGRAM:")
            if (p.startsWith('DIAGRAM:')) {
                const filepath = p.substring(8).trim();
                try {
                    imgBuffer = await fs.readFile(filepath);
                    console.log('📊 Loaded diagram from:', filepath);
                } catch (error) {
                    console.error('❌ Failed to load diagram:', filepath, error);
                    return undefined;
                }
            }
            // Check if this is a code screenshot request (starts with "CODE:")
            else if (p.startsWith('CODE:')) {
                const code = p.substring(5).trim();
                imgBuffer = await generateCodeScreenshot({ code, theme: 'dracula' });
            } else {
                // DISABLED: Gemini image generation
                // imgBuffer = await generateImage(p);
                console.log('⚠️ Skipping non-CODE/DIAGRAM image prompt (Imagen disabled):', p.substring(0, 50) + '...');
                return undefined;
            }

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

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown Server Action Error";
        console.error("Server Action Failed:", error);
        return { success: false, error: errMsg };
    }
}
