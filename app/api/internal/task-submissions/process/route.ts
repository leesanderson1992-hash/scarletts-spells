import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { recoverTaskSubmissionJobs } from "@/lib/courses/submission-processing";
import { recoverWritingShadowRuns } from "@/lib/writing-engine/whole-writing/worker";
import { recoverWritingContextJobs } from "@/lib/writing-engine/whole-writing/context-worker";
import { recoverContextShadowJobs } from "@/lib/writing-engine/whole-writing/context-advisory-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.TASK_SUBMISSION_CRON_SECRET || process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (
    !configuredSecret ||
    scheme.toLowerCase() !== "bearer" ||
    !token ||
    !safeEquals(token, configuredSecret)
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Shadow recovery is independent of core submission recovery failures.
  const contextShadowPending = recoverContextShadowJobs().catch(() => {
    console.error("[context-shadow] recovery unavailable", { code: "CONTEXT_SHADOW_RECOVERY_UNAVAILABLE" });
    return { status: "unavailable" as const };
  });
  try {
    const summary = await recoverTaskSubmissionJobs(20);
    let writingShadow: Awaited<ReturnType<typeof recoverWritingShadowRuns>> | { status: "unavailable" };
    try {
      writingShadow = await recoverWritingShadowRuns();
    } catch {
      writingShadow = { status: "unavailable" };
      console.error("[writing-shadow] recovery unavailable", { code: "SHADOW_RECOVERY_UNAVAILABLE" });
    }
    let writingContext: Awaited<ReturnType<typeof recoverWritingContextJobs>> | { status: "unavailable" };
    try {
      writingContext = await recoverWritingContextJobs();
    } catch {
      writingContext = { status: "unavailable" };
      console.error("[writing-context] recovery unavailable", { code: "CONTEXT_RECOVERY_UNAVAILABLE" });
    }
    const contextShadow = await contextShadowPending;
    return NextResponse.json({ ...summary, writingShadow, writingContext, contextShadow }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await contextShadowPending;
    console.error("[task-submission-processing] recovery failed", { code: "SUBMISSION_RECOVERY_UNAVAILABLE" });
    return NextResponse.json({ error: "Submission recovery failed." }, { status: 500 });
  }
}
