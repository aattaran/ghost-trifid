'use server'

import * as GithubLib from "@/lib/github-api";

export async function getRemoteCommits(owner: string, repo: string, limit: number = 5) {
    return await GithubLib.getRemoteCommits(owner, repo, limit);
}

export async function getLatestRemoteCommitHash(owner: string, repo: string) {
    return await GithubLib.getLatestRemoteCommitHash(owner, repo);
}

export async function fetchAndSummarizeRepo(repoString: string) {
    return await GithubLib.fetchAndSummarizeRepo(repoString);
}
