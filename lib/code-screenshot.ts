/**
 * Code Screenshot Generator using Shiki + Canvas (fully local)
 * 
 * Generates beautiful code screenshots locally using:
 * - Shiki: VS Code-quality syntax highlighting
 * - @napi-rs/canvas: Node.js canvas for image generation
 * 
 * No external API calls, no watermarks, works offline
 */

import { createHighlighter, type BundledLanguage, type BundledTheme } from 'shiki';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

// Available themes from Shiki
export type CarbonTheme =
    | 'dracula'
    | 'github-dark'
    | 'one-dark-pro'
    | 'nord'
    | 'material-theme-darker'
    | 'vitesse-dark';

// Language mappings
export type CodeLanguage =
    | 'typescript'
    | 'javascript'
    | 'python'
    | 'rust'
    | 'go'
    | 'bash'
    | 'json'
    | 'css'
    | 'html'
    | 'tsx'
    | 'jsx';

export interface CodeScreenshotOptions {
    code: string;
    language?: CodeLanguage;
    theme?: CarbonTheme;
    backgroundColor?: string;
    dropShadow?: boolean;
    windowControls?: boolean;
    paddingVertical?: string;
    paddingHorizontal?: string;
}

// Cache the highlighter for performance
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

async function getHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['dracula', 'github-dark', 'one-dark-pro', 'nord', 'vitesse-dark'],
            langs: ['typescript', 'javascript', 'python', 'rust', 'go', 'bash', 'json', 'css', 'html', 'tsx', 'jsx']
        });
    }
    return highlighterPromise;
}

/**
 * Generates a beautiful code screenshot locally using Shiki + Canvas
 * @param options Code and styling options
 * @returns Buffer of the PNG image, or null if failed
 */
export async function generateCodeScreenshot(options: CodeScreenshotOptions): Promise<Buffer | null> {
    const {
        code,
        language = 'typescript',
        theme = 'dracula',
    } = options;

    // Skip if code is too short or empty
    if (!code || code.trim().length < 10) {
        console.log('⚠️ Code too short for screenshot, skipping...');
        return null;
    }

    try {
        console.log(`📸 Generating code screenshot locally (${code.length} chars, theme: ${theme})...`);

        const highlighter = await getHighlighter();

        // Get tokens from shiki
        const tokens = highlighter.codeToTokensBase(code, {
            lang: language as BundledLanguage,
            theme: theme as BundledTheme
        });

        // Canvas settings
        const fontSize = 14;
        const lineHeight = 22;
        const padding = 40;
        const charWidth = 8.4; // Approximate monospace char width

        // Calculate dimensions
        const lines = code.split('\n');
        const maxLineLength = Math.max(...lines.map(l => l.length));
        const width = Math.min(Math.max(maxLineLength * charWidth + padding * 2, 400), 1200);
        const height = lines.length * lineHeight + padding * 2;

        // Create canvas
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Code background with rounded corners
        const codeX = 20;
        const codeY = 20;
        const codeWidth = width - 40;
        const codeHeight = height - 40;
        const radius = 12;

        ctx.fillStyle = '#282a36'; // Dracula background
        ctx.beginPath();
        ctx.roundRect(codeX, codeY, codeWidth, codeHeight, radius);
        ctx.fill();

        // Window controls (red, yellow, green dots)
        const dotY = codeY + 15;
        const dotRadius = 6;
        ctx.fillStyle = '#ff5f56';
        ctx.beginPath();
        ctx.arc(codeX + 20, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffbd2e';
        ctx.beginPath();
        ctx.arc(codeX + 40, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#27ca40';
        ctx.beginPath();
        ctx.arc(codeX + 60, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw code with syntax highlighting
        ctx.font = `${fontSize}px "Consolas", "Monaco", monospace`;
        let y = codeY + 45;

        for (const line of tokens) {
            let x = codeX + 20;
            for (const token of line) {
                ctx.fillStyle = token.color || '#f8f8f2';
                ctx.fillText(token.content, x, y);
                x += ctx.measureText(token.content).width;
            }
            y += lineHeight;
        }

        // Convert to PNG buffer
        const buffer = canvas.toBuffer('image/png');

        console.log(`✅ Code screenshot generated locally (${buffer.length} bytes)`);
        return buffer;

    } catch (error: any) {
        console.error('❌ Code screenshot failed:', error.message);
        return null;
    }
}

/**
 * Helper to extract a meaningful code snippet from file content
 * Focuses on functions, classes, or interesting logic
 */
export function extractCodeSnippet(fileContent: string, maxLines: number = 15): string {
    const lines = fileContent.split('\n');

    // Try to find the start of a function or class
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for function/class declarations
        if (line.match(/^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?class\s+\w+|^(export\s+)?const\s+\w+\s*=/)) {
            startIndex = i;
            break;
        }
    }

    // Extract up to maxLines from that point
    const snippet = lines.slice(startIndex, startIndex + maxLines).join('\n');

    return snippet.trim() || lines.slice(0, maxLines).join('\n').trim();
}

/**
 * Fetches code from a GitHub raw URL and generates a screenshot
 * @param owner Repo owner
 * @param repo Repo name  
 * @param filePath Path to file in repo
 * @param branch Branch name (default: main)
 */
export async function screenshotFromGitHub(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'main'
): Promise<Buffer | null> {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

    try {
        console.log(`📥 Fetching code from GitHub: ${filePath}`);

        const response = await fetch(rawUrl, {
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.error(`❌ GitHub fetch failed: ${response.status}`);
            return null;
        }

        const content = await response.text();
        const snippet = extractCodeSnippet(content);

        // Detect language from file extension
        const ext = filePath.split('.').pop() || '';
        const langMap: Record<string, CodeLanguage> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'rs': 'rust',
            'go': 'go',
            'sh': 'bash',
            'json': 'json',
            'css': 'css',
            'html': 'html'
        };

        return await generateCodeScreenshot({
            code: snippet,
            language: langMap[ext] || 'typescript',
            theme: 'dracula'
        });

    } catch (error: any) {
        console.error('❌ GitHub screenshot failed:', error.message);
        return null;
    }
}
