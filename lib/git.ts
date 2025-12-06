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
        return commits;
    } catch (error) {
        console.warn("Git log failed, falling back to Task History:", error);
        return "";
    }
}

export async function getCurrentCommitHash(): Promise<string> {
    try {
        const { stdout } = await execAsync('git rev-parse HEAD');
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
        const { stdout } = await execAsync(`git log ${sinceHash}..HEAD --pretty=format:"%s"`);
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
        const taskPath = String.raw`C:\Users\AATTARAN\.gemini\antigravity\brain\ab04d1bb-7418-4576-bd45-32165e93ebcc\task.md`;
        const fileContent = await fs.readFile(taskPath, 'utf-8');
        // Extract recent completed tasks (lines starting with - [x])
        const completed = fileContent
            .split('\n')
            .filter(line => line.includes('- [x]'))
            .slice(-5) // Last 5 completed
            .join('\n');

        taskStatus = completed ? `\nRecent Completed Tasks:\n${completed}` : "";
    } catch (e) {
        console.warn("Could not read task.md", e);
    }

    // Combine them
    const sourceData = (gitLog + taskStatus).trim() || "No recent updates found. (Check git or task.md)";

    return `Here is the recent progress on the project:

${sourceData}

Based on this, write a progress update tweet.`;
}
