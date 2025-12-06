'use server'

import { getProjectContextSummary } from "@/lib/git";

export async function analyzeProjectStatus() {
    try {
        const summary = await getProjectContextSummary();
        return { success: true, summary };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
    }
}
