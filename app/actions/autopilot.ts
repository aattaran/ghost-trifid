'use server'

import fs from 'fs/promises';
import path from 'path';
import { getCurrentCommitHash, getNewCommits, getProjectContextSummary } from "@/lib/git";
import { generateOptionsAction, postCreativeTweet } from "./thread";

const STATE_FILE = path.join(process.cwd(), '.autopilot.json');

interface AutoPilotState {
    lastCommitHash: string;
    lastRunTime: number;
    isActive: boolean;
}

export async function getAutoPilotState(): Promise<AutoPilotState> {
    try {
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return { lastCommitHash: '', lastRunTime: 0, isActive: false };
    }
}

export async function toggleAutoPilot(isActive: boolean): Promise<AutoPilotState> {
    const currentState = await getAutoPilotState();
    // If turning ON, update the last commit hash to NOW so we don't spam old commits immediately
    // unless commit hash is empty
    if (isActive && !currentState.lastCommitHash) {
        currentState.lastCommitHash = await getCurrentCommitHash();
    }

    const newState = { ...currentState, isActive };
    await fs.writeFile(STATE_FILE, JSON.stringify(newState, null, 2));
    return newState;
}

export async function checkAndRunAutoPilot() {
    console.log("AutoPilot: Checking...");
    const state = await getAutoPilotState();

    if (!state.isActive) {
        return { success: false, reason: 'inactive' };
    }

    // 1. Check for new commits
    const currentHash = await getCurrentCommitHash();
    if (!currentHash) return { success: false, error: 'no_git' };

    if (currentHash === state.lastCommitHash) {
        return { success: true, changes: 0, message: 'No new commits' };
    }

    // 2. We have a difference, let's see how many
    const newCommits = await getNewCommits(state.lastCommitHash);
    console.log(`AutoPilot: Found ${newCommits.length} new commits.`);

    // Threshold: Let's trigger on EVERY commit for now (or > 0) as per request "every time a milestone is reached... like 5 or 10" 
    // BUT user also said "automatically fetches... several times per day... OR every time a milestone...".
    // For this MVP, let's trigger if there is ANY new commit, but batch them if they came in fast.

    if (newCommits.length > 0) {
        // 3. Generate Content
        // We'll use the generic project summary for context
        const contextSummary = await getProjectContextSummary();

        // We can append specific info about the new commits
        const prompt = `
        New updates found in the project:
        ${newCommits.map(c => `- ${c}`).join('\n')}

        Context:
        ${contextSummary}

        Generate a tweet about these recent updates.
        `;

        const optionsRes = await generateOptionsAction(prompt);
        if (!optionsRes.success || !optionsRes.data) {
            return { success: false, error: 'gen_failed' };
        }

        const options = optionsRes.data;

        // 4. Decide what to post
        // If many commits (>= 3), maybe a thread? 
        // For now, let's stick to "value" type update which tends to be a solid single tweet/short paragraph.
        // Or "hook" if it's very punchy. 
        // Let's use 'value' as the safe default for updates.

        // However, if the user wants "host, value, and threads several times per day", we might want to vary it.
        // Let's just pick 'value' for stability first.

        console.log("AutoPilot: Posting update...");
        const postRes = await postCreativeTweet(options.value, 'value');

        if (postRes.success) {
            // 5. Update State
            state.lastCommitHash = currentHash;
            state.lastRunTime = Date.now();
            await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
            return { success: true, posted: true, commits: newCommits.length };
        } else {
            return { success: false, error: 'post_failed', details: postRes.error };
        }
    }

    // Update the hash anyway if we want to skip these commits? 
    // No, if we failed to post, we might want to retry? 
    // Actually, if we just checked and found nothing, we shouldn't change hash.
    // If we found commits but decided not to post (e.g. threshold), we might keep old hash?
    // For now, if we found commits and printed them, we should probably update hash ONLY if we successfully posted 
    // OR if we decided they were ignorable. 
    // But here we try to post every time.

    return { success: true, changes: newCommits.length, message: 'Changes found but processing logic finished.' };
}
