import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { recoverTaskSubmissionJobs } from "@/lib/courses/submission-processing";
import { recoverWritingShadowRuns } from "@/lib/writing-engine/whole-writing/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  try {
    const summary = await recoverTaskSubmissionJobs(20);
    let writingShadow: Awaited<ReturnType<typeof recoverWritingShadowRuns>> | { status: "unavailable" };
    try {
      writingShadow = await recoverWritingShadowRuns();
    } catch {
      writingShadow = { status: "unavailable" };
      console.error("[writing-shadow] recovery unavailable", { code: "SHADOW_RECOVERY_UNAVAILABLE" });
    }
    return NextResponse.json({ ...summary, writingShadow }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[task-submission-processing] recovery failed", error);
    return NextResponse.json({ error: "Submission recovery failed." }, { status: 500 });
  }
}
