import { NextResponse } from "next/server";
import { listAgentPRs } from "@/lib/agent-team/list-prs";

// Auth: middleware (`/admin/*`) already gates by OWNER_EMAIL.
export async function GET() {
  try {
    const prs = await listAgentPRs();
    return NextResponse.json({ prs, count: prs.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "list-prs failed" },
      { status: 500 }
    );
  }
}
