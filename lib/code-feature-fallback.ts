import { getRepoFileContentRaw, fetchAndSummarizeRepo, getRepoFileStructure } from './github-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { postCreativeTweet, generateOptionsAction } from './thread-api';
import { logAutoPilotAction } from './supabase';
import fs from 'fs/promises';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const STATE_FILE = path.join(process.cwd(), '.autopilot.json');
const DAILY_POST_LIMIT = 17;

// Import types from autopilot-core
interface AutoPilotState {
    lastCommitHash: string;
    lastRunTime: number;
    isActive: boolean;
    monitoredRepo?: string;
    monitoringMode?: 'local' | 'remote';
    postsToday: number;
    lastPostDate: string;
    postedCommits?: string[];
    lastPostContent?: string;
    lastPostTimestamp?: number;
    analyzedFeatures?: CodeFeature[];
    postedFeatures?: string[];
}

/**
 * CODE-BASED CONTENT GENERATION MODULE
 * 
 * This module enables AutoPilot to generate posts about code features
 * when commit history is exhausted. It analyzes the repository structure
 * and generates educational content about the codebase.
 * 
 * TO DISABLE: Remove the import call in autopilot-core.ts (line ~517)
 */

export interface CodeFeature {
    name: string;
    description: string;
    files: string[];
    relevance: number; // 1-10 score
}

async function saveState(state: AutoPilotState) {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function getPostTypeForTime(): { allowed: boolean; type: 'hook' | 'value' | 'thread'; tone: string } {
    const now = new Date();
    const cstDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const hour = cstDate.getHours();

    // Active hours: 9am-8pm CST - always prefer threads
    if (hour >= 9 && hour < 20) {
        return { allowed: true, type: 'thread', tone: "Technical deep-dive with story progression" };
    }

    return { allowed: false, type: 'thread', tone: "Neutral" };
}

/**
 * Analyzes repository to extract interesting features worth posting about
 */
export async function analyzeRepositoryFeatures(
    owner: string,
    repo: string
): Promise<CodeFeature[]> {
    console.log('🔍 Analyzing codebase for features...');

    // Get key files to analyze
    const keyFiles = await getKeyCodeFiles(owner, repo);

    if (keyFiles.length === 0) {
        console.log('⚠️ No analyzable files found in repository');
        return [];
    }

    // Use AI to extract features from code
    const features = await extractFeaturesWithAI(keyFiles, repo);

    return features;
}

/**
 * Fetches key code files from repository dynamically
 * Falls back to local test-code-samples folder if remote fails
 */
async function getKeyCodeFiles(
    owner: string,
    repo: string
): Promise<{ path: string; content: string }[]> {
    const files: { path: string; content: string }[] = [];

    // Try remote first
    const repoFiles = await getRepoFileStructure(owner, repo);

    if (repoFiles && repoFiles.length > 0) {
        console.log(`📂 Found ${repoFiles.length} files in remote repo`);

        // Prioritize interesting files (match anywhere in path)
        const priorityPatterns = [
            /package\.json$/,
            /README\.md$/i,
            /manifest\.json$/,
            /\.(ts|tsx|js|jsx)$/,  // Any source file
            /\.(config|setup)\.(ts|js|mjs)$/
        ];

        const excludePatterns = [
            /node_modules/,
            /\.test\.|\.spec\./,
            /\.d\.ts$/,
            /\.min\.js$/,
            /\.lock$/,
            /\.zip$/,
            /\.DS_Store/
        ];

        // Score and sort files
        const scoredFiles = repoFiles
            .filter(f => !excludePatterns.some(p => p.test(f)))
            .map(f => {
                let score = 0;
                priorityPatterns.forEach((p, i) => {
                    if (p.test(f)) score += 10 - i;
                });
                // Prefer shorter paths (top-level)
                if (f.split('/').length <= 2) score += 2;
                return { path: f, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 10); // Limit to 10 files

        console.log(`🎯 Selected ${scoredFiles.length} key files for analysis`);

        // Fetch content for each selected file
        for (const { path } of scoredFiles) {
            const content = await getRepoFileContentRaw(owner, repo, path);
            if (content) {
                files.push({ path, content: content.substring(0, 3000) }); // Limit size
            }
        }
    }

    // Fallback to local folder if no remote files found
    if (files.length === 0) {
        console.log('📁 Using local fallback: test-code-samples/');
        const localPath = path.join(process.cwd(), 'test-code-samples');

        try {
            const localFiles = await fs.readdir(localPath);
            console.log(`📂 Found ${localFiles.length} local sample files`);

            for (const fileName of localFiles.slice(0, 10)) {
                const filePath = path.join(localPath, fileName);
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    files.push({ path: fileName, content: content.substring(0, 3000) });
                }
            }
        } catch (err) {
            console.log('⚠️ No local test-code-samples folder found. Create it and add code files.');
        }
    }

    return files;
}

/**
 * Uses AI to extract meaningful features from code files
 */
async function extractFeaturesWithAI(
    files: { path: string; content: string }[],
    repoName: string
): Promise<CodeFeature[]> {
    const prompt = `
    Analyze these code files from the "${repoName}" repository.
    Extract 3-5 interesting technical features worth posting about on Twitter.
    
    Focus on:
    - APIs/integrations used
    - Architecture patterns
    - Tech stack choices
    - Unique implementations
    
    FILES:
    ${files.map(f => `\n--- ${f.path} ---\n${f.content}\n`).join('\n')}
    
    Return JSON array of features:
    [
        {
            "name": "Feature name",
            "description": "Technical description (2-3 sentences)",
            "files": ["relevant file paths"],
            "relevance": 1-10 score
        }
    ]
    
    Return ONLY valid JSON, no markdown formatting.
    `;

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        const result = await model.generateContent(prompt);
        let response = result.response.text().trim();

        // Clean up markdown formatting if present
        response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const features = JSON.parse(response);

        // Sort by relevance
        return features.sort((a: CodeFeature, b: CodeFeature) => b.relevance - a.relevance);

    } catch (error) {
        console.error('❌ Failed to extract features:', error);
        return [];
    }
}

/**
 * Generates a Twitter THREAD about a specific code feature
 * Returns an array of 3 tweets for thread posting
 */
export async function generateFeaturePost(
    feature: CodeFeature,
    repoContext: string,
    previousPost?: string
): Promise<string[]> {
    const previousContext = previousPost
        ? `\n**Previous Post:**\n${previousPost}\n`
        : '';

    const prompt = `
    You're a software engineer sharing a technical deep-dive on Twitter.
    Write like you're explaining something cool you built to a fellow developer.
    
    **Repository Context:**
    ${repoContext}
    
    **Feature to Post About:**
    Name: ${feature.name}
    Description: ${feature.description}
    Files: ${feature.files.join(', ')}
    ${previousContext}
    
    **Tone:** Casual but technical
    
    **Guidelines:**
    - Share the technical implementation detail naturally
    - Explain WHY you chose this approach
    - Be authentic - "Built X using Y because Z"
    - Use technical terms without over-explaining
    - Only use #BuildInPublic hashtag (in first tweet only)
    
    **FORMAT: Generate a 3-tweet thread:**
    Tweet 1: Hook - grab attention with the main insight (280 chars max)
    Tweet 2: Details - dive into the implementation specifics
    Tweet 3: Takeaway - what you learned or would do differently
    
    Return ONLY a JSON array with exactly 3 strings, no markdown:
    ["tweet 1 text", "tweet 2 text", "tweet 3 text"]
    `;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(prompt);
    let response = result.response.text().trim();

    // Clean up markdown if present
    response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    try {
        const thread = JSON.parse(response);
        if (Array.isArray(thread) && thread.length >= 2) {
            return thread.slice(0, 3); // Ensure max 3 tweets
        }
    } catch {
        // If parsing fails, split into thread manually
        console.log('⚠️ Could not parse thread JSON, creating single tweet');
    }

    // Fallback: return as single-item array
    return [response.substring(0, 280)];
}

/**
 * Main function: Posts about a code feature when commits are exhausted
 * Called from autopilot-core.ts backfill function
 */
export async function postAboutCodeFeature(
    state: AutoPilotState,
    logs: string[],
    repoName: string
): Promise<any> {
    logs.push('📝 No historical commits available. Analyzing codebase for features...');

    if (state.monitoringMode !== 'remote' || !state.monitoredRepo) {
        logs.push('⚠️ Code analysis only works for remote repos');
        return { success: false, error: 'local_repo', logs };
    }

    const [owner, repo] = state.monitoredRepo.split('/');

    // Analyze repository if not done yet
    if (!state.analyzedFeatures || state.analyzedFeatures.length === 0) {
        logs.push('🔍 First time - analyzing repository structure...');
        state.analyzedFeatures = await analyzeRepositoryFeatures(owner, repo);
        if (state.analyzedFeatures.length === 0) {
            logs.push('⚠️ No code features could be extracted');
            return { success: false, error: 'no_features', logs };
        }
        logs.push(`Found ${state.analyzedFeatures.length} features to post about`);
    }

    // Initialize postedFeatures if needed
    if (!state.postedFeatures) state.postedFeatures = [];

    // Find next unposted feature
    const unpostedFeatures = state.analyzedFeatures.filter(
        f => !state.postedFeatures!.includes(f.name)
    );

    if (unpostedFeatures.length === 0) {
        logs.push('💤 All code features have been posted about');
        return { success: false, error: 'no_more_features', logs };
    }

    // Get the highest relevance unposted feature
    const feature = unpostedFeatures[0];
    logs.push(`📦 Posting about feature: ${feature.name} (relevance: ${feature.relevance}/10)`);

    // Check posting window
    const schedule = getPostTypeForTime();
    if (!schedule.allowed) {
        logs.push(`Outside posting window. Skipping.`);
        return { success: false, error: 'outside_window', logs };
    }

    // Get context
    const summaryRes = await fetchAndSummarizeRepo(state.monitoredRepo);
    const contextSummary = (summaryRes.success && summaryRes.summary) ? summaryRes.summary : "";

    // Build prompt for existing generateOptionsAction (same as main autopilot)
    const prompt = `
    You're a software engineer sharing your development journey on Twitter.
    Write like you're texting a fellow developer friend - casual but technical.
    
    **Feature to Post About:**
    Name: ${feature.name}
    Description: ${feature.description}
    Files: ${feature.files.join(', ')}
    
    **Project Context:**
    ${contextSummary}
    
    **Previous Post (for story continuity):**
    ${state.lastPostContent || 'None'}
    
    **Tone:** Technical deep-dive with story progression
    **Format:** thread
    
    **Voice Guidelines:**
    - Sound human, not a marketing bot
    - Use technical terms naturally (no explaining basics)
    - Be honest about challenges, not just wins
    - Skip the hype - just facts about what you built
    - Only use #BuildInPublic hashtag
    `;

    console.log(`🧠 Generating thread content for feature: ${feature.name}...`);
    logs.push(`Generating thread content...`);

    const optionsRes = await generateOptionsAction(prompt);

    if (!optionsRes.success || !optionsRes.data) {
        logs.push('Generation failed.');
        return { success: false, error: 'gen_failed', logs };
    }

    const thread = optionsRes.data.thread; // This is the string[] for thread

    // Generate code screenshots for EACH tweet from monitored repo
    let imagePrompts: string[] = [];
    // owner, repo already declared above at line 304

    for (let i = 0; i < thread.length; i++) {
        // Use different files from the feature for variety
        const fileIndex = i % feature.files.length;
        const fileToUse = feature.files[fileIndex];
        const codeContent = await getRepoFileContentRaw(owner, repo, fileToUse);

        if (codeContent) {
            // Use different line ranges for variety across tweets
            const lines = codeContent.split('\n');
            const startLine = Math.min(i * 20, Math.max(0, lines.length - 25));
            const snippet = lines.slice(startLine, startLine + 25).join('\n');
            imagePrompts.push(`CODE:${snippet}`);
            logs.push(`📸 Tweet ${i + 1}: code from ${fileToUse.split('/').pop()} (lines ${startLine}-${startLine + 25})`);
        } else {
            logs.push(`⚠️ Tweet ${i + 1}: no image (code fetch failed for ${fileToUse})`);
        }
    }

    // Post to Twitter as a thread with code screenshots
    logs.push(`📤 Posting ${thread.length}-tweet thread with ${imagePrompts.length} images...`);
    const postRes = await postCreativeTweet(thread, 'thread', imagePrompts);

    if (postRes.success) {
        // Update state
        const today = new Date().toISOString().split('T')[0];
        state.postsToday = (state.postsToday || 0) + 1;
        state.lastPostDate = today;
        state.postedFeatures!.push(feature.name);
        state.lastPostContent = thread[0].substring(0, 200); // Store first tweet
        state.lastPostTimestamp = Date.now();
        await saveState(state);

        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: state.lastCommitHash,
            action_type: 'post_success',
            content: {
                feature: feature.name,
                generated_thread: thread,
                code_based: true
            } as any,
            status: 'published'
        });

        logs.push(`✅ Feature post successful! (${state.postsToday}/${DAILY_POST_LIMIT} today)`);
        logs.push(`Remaining features: ${unpostedFeatures.length - 1}`);
        return { success: true, posted: true, code_based: true, changes: 1, logs };
    } else {
        logs.push(`Feature post failed: ${postRes.error}`);
        return { success: false, error: 'post_failed', details: postRes.error, logs };
    }
}
