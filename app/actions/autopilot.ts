'use server'

import {
    checkAndRunAutoPilot as runAutoPilotLogic,
    getAutoPilotState as getAutoPilotStateLogic,
    toggleAutoPilot as toggleAutoPilotLogic,
    AutoPilotState
} from "@/lib/autopilot-core";

// Re-export state function for UI
export async function getAutoPilotState(): Promise<AutoPilotState> {
    return await getAutoPilotStateLogic();
}

// Re-export toggle function for UI
export async function toggleAutoPilot(isActive: boolean, repoUrl?: string): Promise<AutoPilotState> {
    return await toggleAutoPilotLogic(isActive, repoUrl);
}

// Re-export main loop for UI manual trigger
export async function checkAndRunAutoPilot() {
    return await runAutoPilotLogic();
}
