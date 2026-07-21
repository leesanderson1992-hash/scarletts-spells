import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { recoverTaskSubmissionJobs } from "@/lib/courses/submission-processing";

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
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[task-submission-processing] recovery failed", error);
    return NextResponse.json({ error: "Submission recovery failed." }, { status: 500 });
  }
}
