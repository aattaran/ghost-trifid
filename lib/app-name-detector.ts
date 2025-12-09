// New function to detect app name from repository
import { getRepoFileContentRaw } from './github-api';

export async function detectAppName(owner: string, repo: string): Promise<string> {
    // Try multiple sources in order of preference

    // 1. Try manifest.json (for Chrome extensions)
    try {
        const manifestContent = await getRepoFileContentRaw(owner, repo, 'manifest.json');
        if (manifestContent) {
            const manifest = JSON.parse(manifestContent);
            if (manifest.name) {
                console.log(`📦 App name from manifest.json: ${manifest.name}`);
                return manifest.name;
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
                console.log(`📦 App name from package.json: ${pkg.name}`);
                return pkg.name;
            }
        }
    } catch (e) {
        // Ignore, try next source
    }

    // 3. Try README.md - look for # Title
    try {
        const readmeContent = await getRepoFileContentRaw(owner, repo, 'README.md');
        if (readmeContent) {
            const match = readmeContent.match(/^#\s+(.+)$/m);
            if (match && match[1]) {
                const title = match[1].trim();
                console.log(`📦 App name from README.md: ${title}`);
                return title;
            }
        }
    } catch (e) {
        // Ignore
    }

    // 4. Fallback to repo name (capitalize first letter)
    const fallback = repo.charAt(0).toUpperCase() + repo.slice(1);
    console.log(`📦 Using fallback app name: ${fallback}`);
    return fallback;
}
