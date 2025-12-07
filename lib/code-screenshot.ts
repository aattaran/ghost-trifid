/**
 * Code Screenshot Generator using Carbonara API
 * 
 * Carbonara is an unofficial API that wraps carbon.now.sh
 * It uses Puppeteer to generate beautiful code screenshots
 * 
 * API: https://carbonara.solopov.dev/api/cook
 */

const CARBONARA_API = 'https://carbonara.solopov.dev/api/cook';

// Available themes (most popular ones)
export type CarbonTheme =
    | 'monokai'
    | 'dracula'
    | 'night-owl'
    | 'one-dark'
    | 'seti'
    | 'synthwave-84'
    | 'material';

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
    | 'html';

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

/**
 * Generates a beautiful code screenshot using the Carbonara API
 * @param options Code and styling options
 * @returns Buffer of the PNG image, or null if failed
 */
export async function generateCodeScreenshot(options: CodeScreenshotOptions): Promise<Buffer | null> {
    const {
        code,
        language = 'typescript',
        theme = 'dracula',
        backgroundColor = 'rgba(0,0,0,0)', // Transparent
        dropShadow = true,
        windowControls = true,
        paddingVertical = '40px',
        paddingHorizontal = '40px'
    } = options;

    // Skip if code is too short or empty
    if (!code || code.trim().length < 10) {
        console.log('⚠️ Code too short for screenshot, skipping...');
        return null;
    }

    try {
        console.log(`📸 Generating code screenshot (${code.length} chars, theme: ${theme})...`);

        const response = await fetch(CARBONARA_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code,
                language,
                theme,
                backgroundColor,
                dropShadow,
                windowControls,
                paddingVertical,
                paddingHorizontal,
                // Additional styling
                fontFamily: 'JetBrains Mono',
                fontSize: '14px',
                lineNumbers: true,
                watermark: false
            }),
            signal: AbortSignal.timeout(30000) // 30s timeout (screenshots can be slow)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Carbonara API error: ${response.status} - ${errorText}`);
            return null;
        }

        // Response is the PNG image directly
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`✅ Code screenshot generated (${buffer.length} bytes)`);
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
