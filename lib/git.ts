import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = util.promisify(exec);

export async function getRecentGitActivity(limit: number = 5): Promise<string> {
    try {
        // 1. Get recent commits
        const { stdout } = await execAsync(`git log -n ${limit} --pretty=format:"%s (%cr)"`);
        const commits = stdout.trim().split('\n').map((line: string) => `- ${line}`).join('\n');

        // 2. Try to read task.md from the known artifacts brain location
        // We'll search for the artifacts folder relative to the project or use the one we know exists
        // Ideally we'd scan for task.md, but let's try a best-effort finding based on the current process CWD
        // or just rely on git for now if looking for a specific file outside the repo is flaky.
        // Actually, the user's task.md is in the artifacts dir `brain/<uuid>/task.md`. 
        // We don't easily know the UUID here without config. 
        // Strategy: "Git Log" is the most reliable source of truth for code.

        return commits;
    } catch (error) {
        console.error("Error reading git logs:", error);
        return "No recent git activity found.";
    }
}

export async function getProjectContextSummary(): Promise<string> {
    const gitLog = await getRecentGitActivity(5);

    return `Here is the recent progress on the project:

Recent Commits:
${gitLog}

Based on this, write a progress update tweet.`;
}
