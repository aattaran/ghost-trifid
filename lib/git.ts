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

export async function getProjectContextSummary(): Promise<string> {
    const gitLog = await getRecentGitActivity(5);

    // Fallback/Enhancement: Read Task.md
    let taskStatus = "";
    try {
        const taskPath = String.raw`C:\Users\AATTARAN\.gemini\antigravity\brain\39658f55-ffb3-411c-99d0-b80fba4cc4b4\task.md`;
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
