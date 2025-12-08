
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local BEFORE importing app code
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ====================================
// GRACEFUL SHUTDOWN - Prevent orphaned processes
// ====================================
let isShuttingDown = false;

const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    process.exit(0);
};

// Handle terminal close, Ctrl+C, and kill signals
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command
process.on('SIGHUP', () => shutdown('SIGHUP'));   // Terminal closed

// Windows-specific: Handle Ctrl+C on Windows terminals
if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => shutdown('CLOSE'));
}


async function main() {
    console.log("🚀 Starting Ghost Trifid Autopilot V2 (Headless Mode)");

    // Dynamic import to ensure env vars are loaded first
    const { checkAndRunAutoPilot, toggleAutoPilot, getAutoPilotState } = await import('../lib/autopilot-core');

    // Check for CLI args (e.g. npm run autopilot -- owner/repo)
    const args = process.argv.slice(2);
    const targetRepo = args[0];

    if (targetRepo) {
        console.log(`🎯 Target Repo from CLI: ${targetRepo}`);
        // Update state to monitor this repo and enable it
        await toggleAutoPilot(true, targetRepo);
    }

    // Initial State Check
    let state = await getAutoPilotState();
    if (!state.isActive) {
        console.log("⚠️ Autopilot is currently DISABLED in settings.");
        console.log("   usage: npm run autopilot -- owner/repo");
        console.log("   or enable it via the web UI.");

        if (!targetRepo) {
            console.log("   Waiting for enable signal...");
        }
    } else {
        console.log(`✅ Autopilot Active. Monitoring: ${state.monitoredRepo || 'Local Repo'}`);
    }

    // Checking Loop
    const runLoop = async () => {
        try {
            // Re-read state in case it changed via UI or other process
            state = await getAutoPilotState();

            if (state.isActive) {
                const now = new Date().toLocaleTimeString();
                process.stdout.write(`[${now}] 🔍 Checking... `);

                const result = await checkAndRunAutoPilot();

                if (result.success) {
                    if (result.posted) {
                        console.log("✨ ACTIVE: Found commits and POSTED update!");
                    } else if (result.changes && result.changes > 0) {
                        console.log(`ℹ️  Pending: ${result.message}`);
                    } else {
                        console.log("💤 No new relevant commits.");
                    }
                } else {
                    console.log(`❌ Error: ${result.error || result.message}`);
                }
            } else {
                // Silent pulse if disabled
                // console.log("... (Disabled) ...");
            }

        } catch (error) {
            console.error("\n💥 Critical Engine Error:", error);
        }

        // Schedule next run
        setTimeout(runLoop, CHECK_INTERVAL_MS);
    };

    // Run immediately on start
    await runLoop();
}

main().catch(console.error);
