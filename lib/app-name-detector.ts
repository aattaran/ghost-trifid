// New function to detect app name and description from repository
import { getRepoFileContentRaw } from './github-api';

export interface AppInfo {
    name: string;
    description?: string;
}

export async function detectAppInfo(owner: string, repo: string): Promise<AppInfo> {
    let name = '';
    let description = '';

    // 1. Try manifest.json (for Chrome extensions)
    try {
        const manifestContent = await getRepoFileContentRaw(owner, repo, 'manifest.json');
        if (manifestContent) {
            const manifest = JSON.parse(manifestContent);
            if (manifest.name) {
                name = manifest.name;
                description = manifest.description || '';
                console.log(`📦 App info from manifest.json: ${name} - ${description}`);
                return { name, description };
            }
        }
    } catch (e) {
        // Ignore, try next source
    }

    // 2. Try package.json
    try {
        const packageContent = await getRepoFileContentRaw(owner, repo, 'package.json');
        if (packageContent) {
            const pkg = JSON.parse(packageContent);
            if (pkg.name && !pkg.name.startsWith('@')) {
                name = pkg.name;
                description = pkg.description || '';
                console.log(`📦 App info from package.json: ${name} - ${description}`);
                return { name, description };
            }
        }
    } catch (e) {
        // Ignore, try next source
    }

    // 3. Try README.md - look for # Title and first paragraph
    try {
        const readmeContent = await getRepoFileContentRaw(owner, repo, 'README.md');
        if (readmeContent) {
            const titleMatch = readmeContent.match(/^#\s+(.+)$/m);
            if (titleMatch && titleMatch[1]) {
                name = titleMatch[1].trim();

                // Try to get description from first paragraph after title
                const descMatch = readmeContent.match(/^#\s+.+\n+(.+?)(\n|$)/m);
                if (descMatch && descMatch[1]) {
                    description = descMatch[1].trim();
                }

                console.log(`📦 App info from README.md: ${name} - ${description}`);
                return { name, description };
            }
        }
    } catch (e) {
        // Ignore
    }

    // 4. Fallback to repo name (capitalize first letter)
    const fallback = repo.charAt(0).toUpperCase() + repo.slice(1);
    console.log(`📦 Using fallback app name: ${fallback}`);
    return { name: fallback };
}

// Legacy function for backward compatibility
export async function detectAppName(owner: string, repo: string): Promise<string> {
    const info = await detectAppInfo(owner, repo);
    return info.name;
}
