import { NextResponse } from "next/server";
import { parseQueue } from "@/lib/agent-team/parse-queue";

// Auth: middleware (`/admin/*`) already gates by OWNER_EMAIL. By the time
// this handler runs, the request is owner-authenticated.
export async function GET() {
  try {
    const queue = await parseQueue();
    return NextResponse.json(queue);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "queue parse failed" },
      { status: 500 }
    );
  }
}
