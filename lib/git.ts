import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = util.promisify(exec);
const TIMEOUT_OPTS = { timeout: 5000 };

// Wrapper to ensure timeouts
const runGit = async (command: string) => {
    return execAsync(command, TIMEOUT_OPTS);
};

export async function getRecentGitActivity(limit: number = 5): Promise<string> {
    try {
        // 1. Get recent commits
        const { stdout } = await runGit(`git log -n ${limit} --pretty=format:"%s (%cr)"`);
        const commits = stdout.trim().split('\n').map((line: string) => `- ${line}`).join('\n');
        return commits;
    } catch (error) {
        console.warn("Git log failed, falling back to Task History:", error);
        return "";
    }
}

export async function getCurrentCommitHash(): Promise<string> {
    try {
        const { stdout } = await runGit('git rev-parse HEAD');
        return stdout.trim();
    } catch (error) {
        console.error("Failed to get current commit hash:", error);
        return "";
    }
}

export async function getNewCommits(sinceHash: string): Promise<string[]> {
    try {
        if (!sinceHash) return [];
        // Get commits between sinceHash and HEAD
        const { stdout } = await runGit(`git log ${sinceHash}..HEAD --pretty=format:"%s"`);
        return stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
        // If the range fails (e.g. sinceHash is invalid/force pushed away), return empty or handle gracefully
        console.warn("Failed to get range of commits:", error);
        return [];
    }
}

export async function getProjectContextSummary(): Promise<string> {
    const gitLog = await getRecentGitActivity(5);

    // Fallback/Enhancement: Read Task.md
    let taskStatus = "";
    try {
        // Fix: Use relative path instead of brittle absolute path
        // We assume the brain folder is relative to the CWD in a standard way, or we search for it.
        // Given the user's specific path structure, we'll try to reconstruct it dynamically or use a known relative path.
        // Sinc we are running in 'ghost-trifid', the brain is up 3 levels and into 'brain/...'.
        // SAFE BET: Try absolute first (legacy support) then relative.
        // Actually, user requested relative.

        // Constructing path relative to the NEXT.js app root:
        // C:\Users\AATTARAN\.gemini\antigravity\playground\ghost-trifid
        // vs
        // C:\Users\AATTARAN\.gemini\antigravity\brain\ab04d1bb-7418-4576-bd45-32165e93ebcc\task.md

        // It's a sibling folder "brain" in ".gemini/antigravity"? 
        // No, "playground" and "brain" seem to be siblings inside "antigravity".
        // ..\..\brain\ab04d1bb-7418-4576-bd45-32165e93ebcc\task.md

        const taskPath = path.resolve(process.cwd(), '../../brain/ab04d1bb-7418-4576-bd45-32165e93ebcc/task.md');

        await fs.access(taskPath); // Check existence
        const fileContent = await fs.readFile(taskPath, 'utf-8');

        // Extract recent completed tasks (lines starting with - [x])
        const completed = fileContent
            .split('\n')
            .filter(line => line.includes('- [x]'))
            .slice(-5) // Last 5 completed
            .join('\n');

        taskStatus = completed ? `\nRecent Completed Tasks:\n${completed}` : "";
    } catch (e) {
        console.warn("Could not read task.md (ignoring)");
    }

    // Combine them
    const sourceData = (gitLog + taskStatus).trim() || "No recent updates found. (Check git or task.md)";

    return `Here is the recent progress on the project:

${sourceData}

Based on this, write a progress update tweet.`;
}
