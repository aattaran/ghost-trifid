import { getCurrentCommitHash, getNewCommits, getProjectContextSummary } from "./git";
import { getLatestRemoteCommitHash, getRemoteCommits, fetchAndSummarizeRepo } from "./github-api";
import { generateOptionsAction, postCreativeTweet } from "./thread-api";
import { searchViralTweets } from "./twitter";
import { logAutoPilotAction, getLastPostedCommit } from "./supabase";
import fs from 'fs/promises';
import path from 'path';

// Config
const STATE_FILE = path.join(process.cwd(), '.autopilot.json');
const DAILY_POST_LIMIT = 15;

export interface AutoPilotState {
    lastCommitHash: string;
    lastRunTime: number;
    isActive: boolean;
    monitoredRepo?: string;
    monitoringMode?: 'local' | 'remote';
    postsToday: number;
    lastPostDate: string;
}

// ------------------------------------------------------------------
// State Management (Hybrid: Local JSON + Supabase)
// ------------------------------------------------------------------
export async function getAutoPilotState(): Promise<AutoPilotState> {
    try {
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {
            lastCommitHash: '',
            lastRunTime: 0,
            isActive: false,
            monitoringMode: 'local',
            postsToday: 0,
            lastPostDate: ''
        };
    }
}

async function saveState(state: AutoPilotState) {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function toggleAutoPilot(isActive: boolean, repoUrl?: string): Promise<AutoPilotState> {
    const currentState = await getAutoPilotState();
    let monitoredRepo = currentState.monitoredRepo;
    let monitoringMode = currentState.monitoringMode || 'local';

    if (repoUrl && repoUrl.trim().length > 0) {
        const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/) || repoUrl.match(/^([^\/]+\/[^\/]+)$/);
        if (match) {
            monitoredRepo = match[1].replace('.git', '');
            monitoringMode = 'remote';
        }
    } else {
        monitoringMode = 'local';
        monitoredRepo = undefined;
    }

    if (isActive) {
        if (monitoringMode === 'remote' && monitoredRepo) {
            const [owner, repo] = monitoredRepo.split('/');
            const remoteHash = await getLatestRemoteCommitHash(owner, repo);
            if (remoteHash && (!currentState.isActive || currentState.monitoredRepo !== monitoredRepo)) {
                currentState.lastCommitHash = remoteHash;
            }
        } else {
            if (!currentState.lastCommitHash || monitoringMode !== 'local') {
                currentState.lastCommitHash = await getCurrentCommitHash();
            }
            monitoringMode = 'local';
        }
    }

    const newState: AutoPilotState = {
        ...currentState,
        isActive,
        monitoredRepo,
        monitoringMode
    };

    await saveState(newState);
    return newState;
}

// ------------------------------------------------------------------
// Scoring & Scheduling
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

function getPostTypeForTime(): { allowed: boolean; type: 'hook' | 'value' | 'thread'; tone: string } {
    const now = new Date();
    const pstDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const hour = pstDate.getHours();

    if (hour >= 9 && hour < 11) return { allowed: true, type: 'hook', tone: "High energy, hype, 'Shipping mode ON'" };
    if (hour >= 13 && hour < 15) return { allowed: true, type: 'value', tone: "Insightful, technical deep dive" };
    if (hour >= 17 && hour < 19) return { allowed: true, type: 'thread', tone: "Reflective, summary of progress" };

    return { allowed: false, type: 'value', tone: "Neutral" };
}

function extractKeywords(commits: string[]): string[] {
    const keywords: string[] = [];
    const techPattern = /\b(API|auth|database|UI|component|feature|fix|bug|deploy|build|test|refactor|AI|ML)\b/gi;

    for (const commit of commits) {
        const matches = commit.match(techPattern);
        if (matches) keywords.push(...matches);
    }

    return Array.from(new Set(keywords.map(k => k.toLowerCase()))).slice(0, 3);
}

// ------------------------------------------------------------------
// MAIN AUTONOMOUS LOOP
// ------------------------------------------------------------------
export async function checkAndRunAutoPilot() {
    console.log("🤖 AutoPilot: Starting check...");
    const state = await getAutoPilotState();
    const repoName = state.monitoredRepo || 'local';

    const logs: string[] = [];

    if (!state.isActive) {
        return { success: false, reason: 'inactive', logs: ['Autopilot is disabled'] };
    }

    logs.push("Starting check cycle...");

    // -----------------------------------------
    // STEP 1: Check for new commits
    // -----------------------------------------
    let currentHash = "";
    let newCommits: string[] = [];
    let contextSummary = "";

    if (state.monitoringMode === 'remote' && state.monitoredRepo) {
        const [owner, repo] = state.monitoredRepo.split('/');
        const hash = await getLatestRemoteCommitHash(owner, repo);
        if (!hash) return { success: false, error: 'no_remote_git', logs: [...logs, "Failed to fetch remote hash"] };
        currentHash = hash;
        logs.push(`Remote HEAD: ${hash.substring(0, 7)}`);

        // Check Supabase for last posted commit (fallback to local state)
        const dbLastHash = await getLastPostedCommit(state.monitoredRepo);
        const lastHash = dbLastHash || state.lastCommitHash;

        logs.push(`Last processed: ${lastHash?.substring(0, 7) || 'None'}`);

        if (currentHash !== lastHash) {
            const remoteCommits = await getRemoteCommits(owner, repo, 10);
            newCommits = remoteCommits.map((c: any) => c.message);
            const summaryRes = await fetchAndSummarizeRepo(`${owner}/${repo}`);
            contextSummary = (summaryRes.success && summaryRes.summary) ? summaryRes.summary : "No summary available.";
        }
    } else {
        currentHash = await getCurrentCommitHash();
        if (!currentHash) return { success: false, error: 'no_git', logs: [...logs, "Failed to get local hash"] };

        if (currentHash !== state.lastCommitHash) {
            newCommits = await getNewCommits(state.lastCommitHash);
            contextSummary = await getProjectContextSummary();
        }
    }

    if (newCommits.length > 0) {
        logs.push(`Found ${newCommits.length} new commits.`);
    }

    // No new commits
    if (currentHash === state.lastCommitHash || newCommits.length === 0) {
        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: currentHash,
            action_type: 'check',
            content: { reason: 'No new commits' },
            status: 'ok'
        });
        logs.push("No new commits found since last check.");
        return { success: true, changes: 0, message: 'No new commits', logs, foundCommits: [] };
    }

    // -----------------------------------------
    // STEP 2: Filter noise commits
    // -----------------------------------------
    const importantCommits = newCommits.filter(msg => {
        const lower = msg.toLowerCase();
        return !lower.startsWith('chore:') && !lower.startsWith('wip:') && !lower.startsWith('merge');
    });

    if (importantCommits.length === 0) {
        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: currentHash,
            action_type: 'skip',
            content: { commits: newCommits, reason: 'All noise commits' },
            status: 'skipped'
        });
        state.lastCommitHash = currentHash;
        await saveState(state);
        logs.push("Skipping: Commits detected but they were all noise (chore, wip, merge).");
        return { success: true, changes: 0, message: 'Skipped noise commits', logs, foundCommits: newCommits };
    }

    // -----------------------------------------
    // STEP 3: Significance & Batching
    // -----------------------------------------
    const score = calculateSignificance(importantCommits);
    const hasGoldenTrigger = importantCommits.some(msg =>
        msg.toLowerCase().includes('feat:') || msg.toLowerCase().includes('major:')
    );

    if (!hasGoldenTrigger && importantCommits.length < 3 && score < 3) {
        logs.push(`Accumulating: ${importantCommits.length}/3 commits. Score ${score}/3.`);
        return { success: true, changes: importantCommits.length, message: `Batching: ${importantCommits.length}/3 commits`, logs, foundCommits: importantCommits };
    }

    // -----------------------------------------
    // STEP 4: Rate Limit Check
    // -----------------------------------------
    const today = new Date().toISOString().split('T')[0];
    if (state.lastPostDate !== today) {
        state.postsToday = 0;
        state.lastPostDate = today;
    }

    if (state.postsToday >= DAILY_POST_LIMIT) {
        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: currentHash,
            action_type: 'skip',
            content: { reason: `Daily limit reached (${DAILY_POST_LIMIT})` },
            status: 'rate_limited'
        });
        logs.push(`Daily limit reached (${state.postsToday}/${DAILY_POST_LIMIT}). Pausing.`);
        return { success: true, message: `Daily limit reached`, logs, foundCommits: importantCommits };
    }

    // -----------------------------------------
    // STEP 5: Time Window Check
    // -----------------------------------------
    const schedule = getPostTypeForTime();
    if (!schedule.allowed) {
        logs.push(`Outside posting window (Hour: ${new Date().getHours()}). Standing by.`);
        return { success: true, changes: importantCommits.length, message: `Outside active hours.`, logs, foundCommits: importantCommits, summary: contextSummary };
    }

    // -----------------------------------------
    // STEP 6: Research - Fetch Viral Tweets
    // -----------------------------------------
    const keywords = extractKeywords(importantCommits);
    let viralContext = "";
    let viralRefs: string[] = [];

    if (keywords.length > 0) {
        console.log(`🔎 AutoPilot: Researching viral content for: ${keywords.join(', ')}`);
        logs.push(`Researching viral content for keywords: ${keywords.join(', ')}`);
        const viralTweets = await searchViralTweets(keywords[0]);
        if (viralTweets.length > 0) {
            viralRefs = viralTweets.slice(0, 3).map(t => t.text);
            viralContext = `\n\n**Viral Inspiration:**\n${viralRefs.map(t => `- "${t.substring(0, 100)}..."`).join('\n')}`;
        }
    }

    // -----------------------------------------
    // STEP 7: Generate Content
    // -----------------------------------------
    const prompt = `
    You are the dev-marketing engine for a developer's "Build in Public" Twitter account.
    
    **Git Commits:**
    ${importantCommits.map(c => `- ${c}`).join('\n')}
    
    **Project Context:**
    ${contextSummary}
    ${viralContext}
    
    **Style:** ${schedule.tone}
    **Format:** ${schedule.type}
    
    **Rules:**
    1. Don't list commits verbatim. Synthesize into a narrative.
    2. Focus on user benefit or cool tech factor.
    3. Only use #BuildInPublic hashtag.
    `;

    console.log(`🧠 AutoPilot: Generating ${schedule.type} content...`);
    logs.push(`Generating ${schedule.type} content...`);

    const optionsRes = await generateOptionsAction(prompt);

    if (!optionsRes.success || !optionsRes.data) {
        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: currentHash,
            action_type: 'generate',
            content: { commits: importantCommits, error: 'Generation failed' },
            status: 'failed'
        });
        logs.push("Generation failed.");
        return { success: false, error: 'gen_failed', logs, foundCommits: importantCommits };
    }

    const options = optionsRes.data;

    await logAutoPilotAction({
        repo_name: repoName,
        commit_hash: currentHash,
        action_type: 'generate',
        content: {
            commits: importantCommits,
            viral_refs: viralRefs,
            generated_hook: options.hook,
            generated_value: options.value,
            generated_thread: options.thread
        },
        status: 'success'
    });

    // -----------------------------------------
    // STEP 8: Post to Twitter
    // -----------------------------------------
    let contentToPost: string | string[] = options.value;
    if (schedule.type === 'hook') contentToPost = options.hook;
    if (schedule.type === 'thread') contentToPost = options.thread;

    console.log(`📤 AutoPilot: Posting ${schedule.type}...`);
    logs.push(`Posting ${schedule.type} to Twitter...`);

    const postRes = await postCreativeTweet(contentToPost, schedule.type, options.imagePrompts);

    if (postRes.success) {
        state.lastCommitHash = currentHash;
        state.lastRunTime = Date.now();
        state.postsToday = (state.postsToday || 0) + 1;
        state.lastPostDate = today;
        await saveState(state);


        // Extract ID safely
        let tweetId = 'unknown';
        if (postRes.data) {
            if (Array.isArray(postRes.data)) {
                tweetId = postRes.data[0]?.data?.id || 'unknown';
            } else {
                tweetId = postRes.data.data?.id || 'unknown';
            }
        }

        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: currentHash,
            action_type: 'post_success',
            content: {
                commits: importantCommits,
                viral_refs: viralRefs,
                [`generated_${schedule.type}`]: contentToPost,
                tweet_id: tweetId
            },
            status: 'published'
        });

        console.log(`✅ AutoPilot: Posted successfully! (${state.postsToday}/${DAILY_POST_LIMIT} today)`);
        logs.push(`Successfully posted ${schedule.type}!`);
        return { success: true, posted: true, changes: importantCommits.length, type: schedule.type, logs, foundCommits: importantCommits, summary: contextSummary };
    } else {
        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: currentHash,
            action_type: 'post_fail',
            content: {
                commits: importantCommits,
                error: postRes.error
            },
            status: 'failed'
        });

        logs.push(`Post failed: ${postRes.error}`);
        return { success: false, error: 'post_failed', details: postRes.error, logs, foundCommits: importantCommits };
    }
}
