'use server'

// Define the commit structure we expect from GitHub API
export interface CommitInfo {
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
}

// Function to fetch commits from a remote GitHub repository using the public API
export async function getRemoteCommits(owner: string, repo: string, limit: number = 5): Promise<CommitInfo[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`;

    try {
        const headers: HeadersInit = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Antigravity-Agent'
            // 'Authorization': `token ${process.env.GITHUB_TOKEN}` // Uncomment if you have a token for higher rate limits
        };

        const response = await fetch(url, {
            headers,
            next: { revalidate: 60 } // Cache for 1 minute to avoid hitting rate limits too fast
        });

        if (!response.ok) {
            console.error(`GitHub API Error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();

        // Map the raw GitHub API response to our clean CommitInfo format
        return data.map((item: any) => ({
            sha: item.sha,
            message: item.commit.message,
            author: item.commit.author.name,
            date: item.commit.author.date,
            url: item.html_url
        }));
    } catch (error) {
        console.error("Failed to fetch remote commits:", error);
        return [];
    }
}

export async function getLatestRemoteCommitHash(owner: string, repo: string): Promise<string | null> {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Agent'
            },
            cache: 'no-store' // Don't cache the check for latest hash
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return data[0].sha;
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function fetchAndSummarizeRepo(repoString: string) {
    let owner = '';
    let repo = '';

    try {
        // robust parsing logic for different URL formats
        const cleanString = repoString.replace(/\/$/, ''); // remove trailing slash

        if (cleanString.startsWith('http')) {
            try {
                const url = new URL(cleanString);
                const parts = url.pathname.split('/').filter(Boolean);
                if (parts.length >= 2) {
                    owner = parts[0];
                    repo = parts[1].replace('.git', '');
                }
            } catch (e) {
                // Invalid URL, ignore
            }
        } else {
            // handle "owner/repo" string format
            const parts = cleanString.split('/');
            // Strict check: must have exactly 2 parts or be identifiable
            if (parts.length === 2 && parts[0] && parts[1]) {
                owner = parts[0];
                repo = parts[1];
            }
        }

        if (!owner || !repo) {
            return { success: false, error: "Invalid repository format. Please use 'owner/repo' (e.g. vercel/ai) or a full GitHub URL." };
        }

        if (!owner || !repo) {
            return { success: false, error: "Invalid repository format. Please use 'owner/repo' (e.g. vercel/ai) or a full GitHub URL." };
        }

        console.log(`🔍 Fetching remote commits for: ${owner}/${repo}`);

        // Switch to using the API-based fetcher
        const commits = await getRemoteCommits(owner, repo);

        if (!commits || commits.length === 0) {
            console.warn(`⚠️ No commits found for ${owner}/${repo}`);
            return { success: false, error: "Could not fetch commits. Is the repo private or empty?" };
        }

        console.log(`✅ Found ${commits.length} commits via API. Generating summary...`);

        // Format the commits into a context string for the AI
        const summary = `Here are the latest engineering updates for ${owner}/${repo} (Build in Public update):\n\n` +
            commits.map(c => `- ${c.message} (Date: ${c.date})`).join('\n') +
            `\n\nTask: Write an engaging 'Build in Public' update about this progress. Focus on the value of these changes and the momentum.`;

        // Return summary and repo name. Viral tweets are now fetched by the UI in Step 2.
        return { success: true, summary, repoName: `${owner}/${repo}` };

    } catch (error: any) {
        console.error("❌ GitHub Action Error:", error);
        return { success: false, error: error.message || "Failed to parse repository." };
    }
}
