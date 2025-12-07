'use server'

import fs from 'fs/promises';
import path from 'path';
import { getCurrentCommitHash, getNewCommits, getProjectContextSummary } from "@/lib/git";
import { getLatestRemoteCommitHash, getRemoteCommits, fetchAndSummarizeRepo } from "./github";
import { generateOptionsAction, postCreativeTweet } from "./thread";

const STATE_FILE = path.join(process.cwd(), '.autopilot.json');

interface AutoPilotState {
    lastCommitHash: string;
    lastRunTime: number;
    isActive: boolean;
    monitoredRepo?: string; // owner/repo
    monitoringMode?: 'local' | 'remote';
}

export async function getAutoPilotState(): Promise<AutoPilotState> {
    try {
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return { lastCommitHash: '', lastRunTime: 0, isActive: false, monitoringMode: 'local' };
    }
}

export async function toggleAutoPilot(isActive: boolean, repoUrl?: string): Promise<AutoPilotState> {
    const currentState = await getAutoPilotState();
    let monitoredRepo = currentState.monitoredRepo;
    let monitoringMode = currentState.monitoringMode || 'local';

    // Parse Repo URL if provided
    if (repoUrl && repoUrl.trim().length > 0) {
        // Support full URL or owner/repo format
        const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/) || repoUrl.match(/^([^\/]+\/[^\/]+)$/);
        if (match) {
            monitoredRepo = match[1].replace('.git', ''); // clean up
            monitoringMode = 'remote';
        }
    } else {
        // If no URL provided (empty input), explicit fallback to LOCAL
        // This prevents stuck "remote" state if user clears the box.
        monitoringMode = 'local';
        monitoredRepo = undefined; // Clear the tracked repo
    }

    // Initialize Hash if turning ON
    if (isActive) {
        if (monitoringMode === 'remote' && monitoredRepo) {
            const [owner, repo] = monitoredRepo.split('/');
            // Verify and get hash
            const remoteHash = await getLatestRemoteCommitHash(owner, repo);
            if (remoteHash) {
                // Only update if we don't have one or if we are switching modes/repos
                // Actually, if we are turning it on, we might want to start "fresh" from NOW
                // or pick up from where we left off. 
                // Let's assume enabling = start monitoring from NOW (reset hash to current HEAD)
                if (!currentState.isActive || currentState.monitoredRepo !== monitoredRepo) {
                    currentState.lastCommitHash = remoteHash;
                }
            } else {
                console.error("Could not verify remote repo");
                // Fallback to local? Or keep off?
                // For now, let it proceed but it will fail next check
            }
        } else {
            // Local Mode
            if (!currentState.lastCommitHash || monitoringMode !== 'local') {
                currentState.lastCommitHash = await getCurrentCommitHash();
            }
            monitoringMode = 'local'; // Ensure mode is set if no repo provided
        }
    }

    const newState: AutoPilotState = {
        ...currentState,
        isActive,
        monitoredRepo,
        monitoringMode
    };

    await fs.writeFile(STATE_FILE, JSON.stringify(newState, null, 2));
    return newState;
}


interface AutoPilotConfig {
    significanceThreshold: number;
    timezoneOffset: number;
}

// ------------------------------------------------------------------
// 1. Scoring Logic
// ------------------------------------------------------------------
function calculateSignificance(commits: string[]): number {
    let score = 0;
    for (const commit of commits) {
        const lower = commit.toLowerCase();
        if (lower.includes('feat:')) score += 3;
        else if (lower.includes('perf:')) score += 2;
        else if (lower.includes('fix:') || lower.includes('refactor:')) score += 1;
    }
    return score;
}

// ------------------------------------------------------------------
// 2. Scheduling Logic (PST-based approximation)
// ------------------------------------------------------------------
function getPostTypeForTime(): { allowed: boolean; type: 'hook' | 'value' | 'thread'; tone: string } {
    const now = new Date();
    const pstDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const hour = pstDate.getHours();

    // Morning: 9-11
    if (hour >= 9 && hour < 11) return { allowed: true, type: 'hook', tone: "High energy, hype, 'Shipping mode ON'" };
    // Mid-day: 13-15 (1 PM - 3 PM)
    if (hour >= 13 && hour < 15) return { allowed: true, type: 'value', tone: "Insightful, technical deep dive, 'Problem -> Solution'" };
    // Evening: 17-19 (5 PM - 7 PM)
    if (hour >= 17 && hour < 19) return { allowed: true, type: 'thread', tone: "Reflective, 'Daily Ship Log', summary of progress" };

    return { allowed: false, type: 'value', tone: "Neutral" };
}

export async function checkAndRunAutoPilot() {
    console.log("AutoPilot: Checking...");
    const state = await getAutoPilotState();

    if (!state.isActive) {
        return { success: false, reason: 'inactive' };
    }

    // -----------------------------------------
    // 1. Check for new commits (Local vs Remote)
    // -----------------------------------------
    let currentHash = "";
    let newCommits: string[] = [];
    let contextSummary = "";

    if (state.monitoringMode === 'remote' && state.monitoredRepo) {
        const [owner, repo] = state.monitoredRepo.split('/');
        const hash = await getLatestRemoteCommitHash(owner, repo);
        if (!hash) return { success: false, error: 'no_remote_git' };
        currentHash = hash;

        if (currentHash !== state.lastCommitHash) {
            // For remote, we just fetch recent commits. we don't have strict "sinceHash" diffing easily available in our lightweight action
            // So we fetch last 10.
            const remoteCommits = await getRemoteCommits(owner, repo, 10);
            newCommits = remoteCommits.map((c: any) => c.message);
            // For MVP, we pass the batch.
            const summaryRes = await fetchAndSummarizeRepo(`${owner}/${repo}`);

            let summary = (summaryRes.success && summaryRes.summary) ? summaryRes.summary : "Could not fetch summary.";

            // Re-attach viral tweets context for the backend Auto Pilot
            if (summaryRes.success && summaryRes.viralTweets && summaryRes.viralTweets.length > 0) {
                const viralSection = `\n\n**Viral Inspiration (Style References):**\nUse the tone and hook style of these high-performing tweets as a guide:\n${summaryRes.viralTweets.slice(0, 3).map((t: string) => `- "${t.replace(/\n/g, ' ')}"`).join('\n')}`;
                summary += viralSection;
            }

            contextSummary = summary;
        }

    } else {
        // Local Mode
        currentHash = await getCurrentCommitHash();
        if (!currentHash) return { success: false, error: 'no_git' };

        if (currentHash !== state.lastCommitHash) {
            newCommits = await getNewCommits(state.lastCommitHash);
            contextSummary = await getProjectContextSummary();
        }
    }

    if (currentHash === state.lastCommitHash) {
        return { success: true, changes: 0, message: 'No new commits' };
    }


    // Safety check
    if (newCommits.length === 0) {
        state.lastCommitHash = currentHash;
        await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        return { success: true, changes: 0, message: 'Hash changed but no commits retrieved.' };
    }

    // ------------------------------------------------------------------
    // Phase 3 Upgrade: Smart Filtering & Batching
    // ------------------------------------------------------------------
    console.log(`AutoPilot: Raw commits found: ${newCommits.length}`);

    // 1. Filter Noise
    const importantCommits = newCommits.filter(msg => {
        const lower = msg.toLowerCase();
        return !lower.startsWith('chore:') && !lower.startsWith('wip:') && !lower.startsWith('merge');
    });

    if (importantCommits.length === 0) {
        console.log("AutoPilot: Skipped noise commits (chore/wip).");
        state.lastCommitHash = currentHash; // Advance hash so we don't re-process noise
        await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        return { success: true, changes: 0, message: 'Skipped noise commits.' };
    }

    // 2. Check for "Golden Triggers" (Immediate high value)
    const hasGoldenTrigger = importantCommits.some(msg => {
        const lower = msg.toLowerCase();
        return lower.includes('feat:') || lower.includes('fix:') || lower.includes('major:');
    });

    // 3. Batching Logic
    if (!hasGoldenTrigger && importantCommits.length < 3) {
        // Too few updates. Wait.
        // IMPORTANT: Do NOT update lastCommitHash so we fetch these again + new ones next time.
        return { success: true, changes: importantCommits.length, message: `Batching: ${importantCommits.length}/3 commits (No major triggers).` };
    }

    console.log(`AutoPilot: Processing ${importantCommits.length} important commits.`);

    // Update list for downstream logic
    newCommits = importantCommits;


    // -----------------------------------------
    // 3. Significance Check
    // -----------------------------------------
    const score = calculateSignificance(newCommits);
    console.log(`AutoPilot: Significance Score = ${score}`);

    if (score < 3) {
        return { success: true, changes: newCommits.length, message: `Score ${score}/3 (Too low). Batching updates.` };
    }

    // -----------------------------------------
    // 4. Time Window Check
    // -----------------------------------------
    const schedule = getPostTypeForTime();
    if (!schedule.allowed) {
        return { success: true, changes: newCommits.length, message: `Score ${score} (Good), but outside active hours. Waiting.` };
    }

    // -----------------------------------------
    // 5. Generate Content
    // -----------------------------------------
    const prompt = `
    You are the dev-marketing engine for 'Antigravity'.
    Your goal: Turn raw git commits into engaging "Build in Public" content.
    ${state.monitoringMode === 'remote' ? `(Monitoring Remote Repo: ${state.monitoredRepo})` : ''}

    **Input Data:**
    - Git Log: 
    ${newCommits.map(c => `- ${c}`).join('\n')}
    
    - Project Context:
    ${contextSummary}

    **Style Guide:**
    - Tone: ${schedule.tone}
    - Format: ${schedule.type} (Create content suitable for this format)

    **Instructions:**
    1.  **Don't list commits.** Synthesize them into a narrative.
    2.  If it's a **Feature**: Focus on the *user benefit* or the *cool tech factor*.
    3.  If it's a **Fix**: Explain the *problem* and the *aha moment* of the solution.
    4.  If it's a **Refactor**: Talk about *paying down debt* and *clean code principles*.
    5.  **No hashtags** except #BuildInPublic and #Antigravity.
    6.  **Visuals**: Describe a cyberpunk/tech schematic of the updates for the image generator.
    `;

    console.log(`AutoPilot: Generating ${schedule.type} post...`);

    const optionsRes = await generateOptionsAction(prompt);
    if (!optionsRes.success || !optionsRes.data) {
        return { success: false, error: 'gen_failed' };
    }

    const options = optionsRes.data;

    // -----------------------------------------
    // 6. Post
    // -----------------------------------------
    console.log("AutoPilot: Posting update...");

    let contentToPost: string | string[] = options.value;
    if (schedule.type === 'hook') contentToPost = options.hook;
    if (schedule.type === 'thread') contentToPost = options.thread;

    const postRes = await postCreativeTweet(contentToPost, schedule.type, options.imagePrompts);

    if (postRes.success) {
        // 7. Update State
        state.lastCommitHash = currentHash;
        state.lastRunTime = Date.now();
        await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        return { success: true, posted: true, changes: newCommits.length, type: schedule.type };
    } else {
        return { success: false, error: 'post_failed', details: postRes.error };
    }
}
