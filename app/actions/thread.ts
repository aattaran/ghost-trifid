'use server'

import * as ThreadLib from "@/lib/thread-api";

export async function generateOptionsAction(input: string) {
    return await ThreadLib.generateOptionsAction(input);
}

export async function generateImagePreview(prompt: string) {
    return await ThreadLib.generateImagePreview(prompt);
}

export async function postCreativeTweet(
    content: string | string[],
    type: 'hook' | 'value' | 'thread',
    imagePrompts?: string | string[]
) {
    return await ThreadLib.postCreativeTweet(content, type, imagePrompts);
}