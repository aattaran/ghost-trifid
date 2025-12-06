'use server'

import { generateImage } from "@/lib/image-gen";
import { postThread, uploadMedia, postToTwitter } from "@/lib/twitter";

// Mock function (Reused from previous step)
async function getPromptById(promptId: string) {
    // Simulate DB delay
    const mockPrompts: Record<string, { id: string, title: string; content: string; tags: string[] }> = {
        'mock-id-1': {
            id: 'mock-id-1',
            title: 'The Creative Spark',
            content: 'Creativity is seeing what others see and thinking what no one else has thought. Unlock your potential by embracing the unknown. Limits are often just illusions we create for ourselves.',
            tags: ['Creativity', 'Innovation', 'Mindset']
        },
        'mock-id-2': {
            id: 'mock-id-2',
            title: 'Code Poetry',
            content: 'Good code is like a poem: concise, expressive, and moving. Write code that future you will enjoy reading. Clean code is not just about function, it is about communication.',
            tags: ['CleanCode', 'DevLife', 'Art']
        }
    };
    return mockPrompts[promptId] || mockPrompts['mock-id-1'];
}

// Single Tweet Action
export async function sharePromptOnTwitter(promptId: string) {
    const prompt = await getPromptById(promptId);
    const content = `${prompt.title} 🚀\n\n${prompt.content.slice(0, 150)}...\n\n#Antigravity`;
    return await postToTwitter(content);
}

// Viral Thread Action
export async function publishThread(promptId: string) {
    const prompt = await getPromptById(promptId);

    if (!prompt) return { success: false, error: "Prompt not found" };

    // 1. Generate & Upload Image
    console.log("🎨 Generating Image for:", prompt.title);

    // Note: generateImage might fail if key works but model access is restricted, handled in lib/image-gen
    const imgBuffer = await generateImage(prompt.title);
    let mediaId: string | null | undefined = undefined;

    if (imgBuffer) {
        console.log("⬆️ Uploading Image to X...");
        mediaId = await uploadMedia(imgBuffer, 'image/png'); // Protocol used UploadMedia(buffer), added mimeType param match
    }

    // 2. Construct Thread
    const thread = [
        {
            text: `🚀 ${prompt.title}\n\nA powerful system prompt in our library.\n\n#Antigravity #AI`,
            media: mediaId ? { media_ids: [mediaId] } : undefined
        },
        {
            text: `🛠️ The Stack:\n\n${(prompt.tags || []).map((t: string) => `#${t}`).join(' ')}\n\n(See next tweet for details 👇)`
        },
        {
            text: `📋 Core Logic:\n\n${prompt.content.slice(0, 200).replace(/`/g, '')}...\n\n(Thread continues)`
        },
        {
            text: `🔗 View full prompt here: https://antigravity.dev/prompts/${prompt.id}`
        }
    ];

    return await postThread(thread);
}
