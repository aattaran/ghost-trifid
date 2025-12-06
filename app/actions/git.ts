'use server'

import { getProjectContextSummary } from "@/lib/git";

export async function analyzeProjectStatus() {
    try {
        const summary = await getProjectContextSummary();
        return { success: true, summary };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
