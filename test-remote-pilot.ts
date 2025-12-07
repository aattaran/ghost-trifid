
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testRemotePilot() {
    console.log("🚀 Testing Remote Auto Pilot...");

    // Dynamic import to ensure env vars are loaded first
    const { toggleAutoPilot, checkAndRunAutoPilot, getAutoPilotState } = await import('./app/actions/autopilot');

    // 1. Enable for a public repo
    const repo = "vercel/ai";
    console.log(`Step 1: Enabling Auto Pilot for ${repo}...`);
    await toggleAutoPilot(true, repo);

    const state = await getAutoPilotState();
    console.log("State after toggle:", state);
    if (state.monitoredRepo !== repo || state.monitoringMode !== 'remote') {
        console.error("❌ Failed to set remote mode.");
        return;
    }

    console.log("Step 2: Running Check (Expect 'No new commits' initially)...");
    const res1 = await checkAndRunAutoPilot();
    console.log("Check 1 Result:", res1);

    // Fixed safe access to properties
    const hasNoCommitsMsg = res1.message?.includes('No new commits');
    const hasChanges = (res1 as any).changes !== undefined && (res1 as any).changes >= 0;

    if (res1.success && (hasNoCommitsMsg || hasChanges)) {
        console.log("✅ Remote Pilot successfully connected.");
    } else {
        console.error("❌ Check failed:", res1);
    }
}

testRemotePilot();
