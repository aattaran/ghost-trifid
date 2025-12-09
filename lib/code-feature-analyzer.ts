import { getRepoFileContentRaw } from './github-api';
import { genAI } from './thread-api';

/**
 * CODE-BASED CONTENT GENERATION MODULE
 * 
 * This module enables AutoPilot to generate posts about code features
 * when commit history is exhausted. It analyzes the repository structure
 * and generates educational content about the codebase.
 * 
 * TO DISABLE: Remove imports and calls to this module from autopilot-core.ts
 */

export interface CodeFeature {
    name: string;
    description: string;
    files: string[];
    relevance: number; // 1-10 score
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
