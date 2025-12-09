import { getRepoFileContentRaw, fetchAndSummarizeRepo } from './github-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { postCreativeTweet } from './thread-api';
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

    if (hour >= 9 && hour < 13) return { allowed: true, type: 'hook', tone: "High energy, hype, 'Shipping mode ON'" };
    if (hour >= 11 && hour < 16) return { allowed: true, type: 'value', tone: "Insightful, technical deep dive" };
    if (hour >= 16 && hour < 20) return { allowed: true, type: 'thread', tone: "Reflective, summary of progress" };

    return { allowed: false, type: 'value', tone: "Neutral" };
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
 * Fetches key code files from repository
 */
async function getKeyCodeFiles(
    owner: string,
    repo: string
): Promise<{ path: string; content: string }[]> {
    const filesToCheck = [
        // Common important files
        'package.json',
        'README.md',
        'tsconfig.json',
        // Code directories - check index files
        'src/index.ts',
        'src/index.js',
        'lib/index.ts',
        'app/page.tsx',
        'pages/index.tsx',
        // Config files
        'next.config.js',
        'vite.config.ts',
        'manifest.json'
    ];

    const files: { path: string; content: string }[] = [];

    for (const filePath of filesToCheck) {
        const content = await getRepoFileContentRaw(owner, repo, filePath);
        if (content) {
            files.push({ path: filePath, content: content.substring(0, 2000) }); // Limit size
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
 * Generates a Twitter post about a specific code feature
 */
export async function generateFeaturePost(
    feature: CodeFeature,
    repoContext: string,
    previousPost?: string
): Promise<string> {
    const previousContext = previousPost
        ? `\n**Previous Post:**\n${previousPost}\n`
        : '';

    const prompt = `
    You're a software engineer sharing a technical insight from your codebase on Twitter.
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
    - Explain WHY you chose this approach (if you can infer)
    - Keep it authentic - "Built X using Y because Z"
    - Use technical terms without over-explaining
    - Frame as: "Used X for Y" or "Implemented Z with A"
    - Only use #BuildInPublic hashtag
    - No emojis unless genuinely excited about the tech
    
    Generate a single tweet (280 chars max):
    `;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
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

    // Generate post
    const post = await generateFeaturePost(feature, contextSummary, state.lastPostContent);

    // Post to Twitter
    logs.push('📤 Posting feature content to Twitter...');
    const postRes = await postCreativeTweet(post, 'value', []);

    if (postRes.success) {
        // Update state
        const today = new Date().toISOString().split('T')[0];
        state.postsToday = (state.postsToday || 0) + 1;
        state.lastPostDate = today;
        state.postedFeatures!.push(feature.name);
        state.lastPostContent = post.substring(0, 200);
        state.lastPostTimestamp = Date.now();
        await saveState(state);

        await logAutoPilotAction({
            repo_name: repoName,
            commit_hash: state.lastCommitHash,
            action_type: 'post_success',
            content: {
                feature: feature.name,
                generated_value: post,
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
