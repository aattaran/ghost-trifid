import { checkAndRunAutoPilot, getAutoPilotState } from "@/lib/autopilot-core";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const state = await getAutoPilotState();
        const result = await checkAndRunAutoPilot();

        return NextResponse.json({
            state,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json({
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
