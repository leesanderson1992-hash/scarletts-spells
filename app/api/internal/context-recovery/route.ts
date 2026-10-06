import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { recoverContextShadowJobs } from "@/lib/writing-engine/whole-writing/context-advisory-worker";
import { recoverAdleReviewContextJobs } from "@/lib/writing-engine/whole-writing/adle-review-context-worker";
import { CONTEXT_SHADOW_RUNTIME_FINGERPRINT } from "@/lib/writing-engine/whole-writing/context-shadow-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CONTEXT_RECOVERY_CRON_SECRET;
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  const left = Buffer.from(token ?? ""), right = Buffer.from(secret ?? "");
  if (!secret || scheme?.toLowerCase() !== "bearer" || !token ||
    left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // One independently claimed job of each kind per tick. Supabase Cron may
  // overlap HTTP requests; DB claims and the shared admission lock serialize sends.
  const [course, adle] = await Promise.all([
    recoverContextShadowJobs(), recoverAdleReviewContextJobs(),
  ]);
  return NextResponse.json({
    deploymentSha: process.env.CONTEXT_AI_DEPLOYMENT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    runtimeFingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
    releaseHold: process.env.CONTEXT_AI_RELEASE_HOLD === "enabled",
    course, adle,
  }, { headers: { "Cache-Control": "no-store" } });
}
