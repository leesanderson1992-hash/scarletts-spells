import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { recoverContextShadowJobs } from "@/lib/writing-engine/whole-writing/context-advisory-worker";
import { recoverAdleReviewContextJobs } from "@/lib/writing-engine/whole-writing/adle-review-context-worker";
import { validContextRateCard, type ContextRateCard } from "@/lib/writing-engine/whole-writing/context-ai-cost";
import { AI_CONTEXT_CONFIG_FINGERPRINT } from "@/lib/writing-engine/whole-writing/context-ai-gate";
import { CONTEXT_SHADOW_RUNTIME_FINGERPRINT, contextShadowIdentity } from "@/lib/writing-engine/whole-writing/context-shadow-policy";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: NextRequest) {
  const secret = process.env.CONTEXT_RECOVERY_CRON_SECRET;
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  const left = Buffer.from(token ?? ""), right = Buffer.from(secret ?? "");
  return !!secret && scheme?.toLowerCase() === "bearer" && !!token &&
    left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // An unaliased Production replay deployment must never drain the site-wide queue.
  if (process.env.CONTEXT_TARGETED_ADLE_REPLAY_SESSION_ID)
    return NextResponse.json({ error: "Targeted replay only.",
      deploymentSha: process.env.CONTEXT_AI_DEPLOYMENT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      runtimeFingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
      releaseHold: process.env.CONTEXT_AI_RELEASE_HOLD === "enabled" }, { status: 409 });
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

/** One explicitly granted, unsent Review job on an unaliased Production deployment. */
export async function POST(request: NextRequest) {
  if (!authorised(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const reviewSessionId = body && typeof body === "object" && "reviewSessionId" in body
    ? (body as { reviewSessionId?: unknown }).reviewSessionId : null;
  if (typeof reviewSessionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(reviewSessionId) ||
    reviewSessionId !== process.env.CONTEXT_TARGETED_ADLE_REPLAY_SESSION_ID ||
    process.env.VERCEL_ENV !== "production")
    return NextResponse.json({ error: "Targeted replay unavailable." }, { status: 409 });
  const identity = contextShadowIdentity();
  if (process.env.CONTEXT_AI_RELEASE_HOLD === "enabled" || !identity)
    return NextResponse.json({ error: "Replay configuration not ready." }, { status: 409 });
  const client = createServiceRoleClient();
  const [control, policy] = await Promise.all([
    client.from("writing_context_advisory_control").select("enabled,ai_mode")
      .eq("singleton", true).maybeSingle(),
    client.from("writing_context_shadow_policy")
      .select("provider_approval_id,revision_id,rate_card_version,execution_policy_kind,dispatch_scope")
      .eq("singleton", true).maybeSingle(),
  ]);
  if (control.error || control.data?.enabled !== false || control.data.ai_mode !== "shadow" ||
    policy.error || !policy.data?.provider_approval_id || !policy.data.revision_id ||
    policy.data.execution_policy_kind !== "ADULT_RELEASE" || policy.data.dispatch_scope !== "REAL_LEARNER" ||
    policy.data.rate_card_version !== process.env.CONTEXT_AI_RATE_CARD_VERSION)
    return NextResponse.json({ error: "Replay policy not ready." }, { status: 409 });
  const [approval, card, revocation, ready] = await Promise.all([
    client.from("writing_context_provider_approvals")
      .select("id,environment,project_ref,deployment_sha,config_fingerprint,runtime_fingerprint")
      .eq("id", policy.data.provider_approval_id).lte("approved_at", new Date().toISOString())
      .gt("expires_at", new Date().toISOString()).maybeSingle(),
    client.from("writing_context_ai_rate_cards").select("*")
      .eq("version", policy.data.rate_card_version).maybeSingle(),
    client.from("writing_context_approval_revocations").select("id")
      .eq("provider_approval_id", policy.data.provider_approval_id).limit(1),
    client.rpc("context_shadow_execution_ready", { p_revision: policy.data.revision_id }),
  ]);
  if (approval.error || !approval.data || approval.data.environment !== identity.environment ||
    approval.data.project_ref !== identity.projectRef ||
    approval.data.deployment_sha !== identity.deploymentSha ||
    approval.data.config_fingerprint !== AI_CONTEXT_CONFIG_FINGERPRINT ||
    approval.data.runtime_fingerprint !== CONTEXT_SHADOW_RUNTIME_FINGERPRINT ||
    card.error || !card.data || !validContextRateCard(card.data as ContextRateCard) ||
    card.data.fingerprint !== process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT ||
    revocation.error || revocation.data?.length || ready.error || ready.data !== true)
    return NextResponse.json({ error: "Replay approval not ready." }, { status: 409 });
  const source = await client.from("adle_review_context_sources").select("id,source_hash")
    .eq("review_session_id", reviewSessionId).maybeSingle();
  if (source.error || !source.data)
    return NextResponse.json({ error: "Replay source unavailable." }, { status: 409 });
  const [grant, job] = await Promise.all([
    client.from("adle_review_context_replay_grants").select("id")
      .eq("source_id", source.data.id).eq("source_hash", source.data.source_hash)
      .gt("expires_at", new Date().toISOString()).maybeSingle(),
    client.from("adle_review_context_jobs").select("id,status,claim_count")
      .eq("source_id", source.data.id).maybeSingle(),
  ]);
  if (grant.error || !grant.data || job.error || job.data?.status !== "pending" ||
    job.data.claim_count !== 0)
    return NextResponse.json({ error: "Replay grant or job unavailable." }, { status: 409 });
  const dispatch = await client.from("adle_review_context_dispatches").select("id")
    .eq("job_id", job.data.id).limit(1);
  if (dispatch.error || dispatch.data?.length)
    return NextResponse.json({ error: "Replay job already dispatched." }, { status: 409 });
  const adle = await recoverAdleReviewContextJobs(reviewSessionId, client);
  return NextResponse.json({ adle }, { headers: { "Cache-Control": "no-store" } });
}
