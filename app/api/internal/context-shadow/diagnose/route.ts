import { NextResponse } from "next/server";

import { getAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validContextRateCard, type ContextRateCard } from "@/lib/writing-engine/whole-writing/context-ai-cost";
import { AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION, AI_CONTEXT_MODEL,
  AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT } from "@/lib/writing-engine/whole-writing/context-ai-gate";
import { contextShadowIdentity, CONTEXT_SHADOW_RUNTIME_FINGERPRINT } from "@/lib/writing-engine/whole-writing/context-shadow-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The revoked approval identifies the failed 2026-10-01 pre-reservation proof.
// This read-only endpoint is for diagnosis while AI remains disabled.
const FAILED_APPROVAL_ID = "4ec2a24f-0503-4f90-964b-f5701674c797";
const FAILED_POLICY_REVISION_ID = "c8386537-e738-43a4-b0ad-019705ace00c";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const access = await getAdminUser();
  if (access.status !== "authorized")
    return NextResponse.json({ error: "Unavailable" }, { status: access.status === "unauthenticated" ? 401 : 403, headers: noStore });

  const client = createServiceRoleClient();
  const [control, approval, policy] = await Promise.all([
    client.from("writing_context_advisory_control").select("enabled,ai_mode").eq("singleton", true).maybeSingle(),
    client.from("writing_context_provider_approvals")
      .select("environment,project_ref,deployment_sha,model,endpoint,config_fingerprint,runtime_fingerprint")
      .eq("id", FAILED_APPROVAL_ID).maybeSingle(),
    client.from("writing_context_shadow_policy_history").select("policy")
      .eq("id", FAILED_POLICY_REVISION_ID).maybeSingle(),
  ]);
  if (control.error || control.data?.enabled !== false || control.data.ai_mode !== "disabled")
    return NextResponse.json({ error: "Disabled control required" }, { status: 409, headers: noStore });

  const a = approval.error ? null : approval.data;
  const approvedCardVersion = policy.error || !policy.data ? null
    : (policy.data.policy as { rate_card_version?: unknown }).rate_card_version;
  const card = typeof approvedCardVersion === "string" ? await client.from("writing_context_ai_rate_cards")
    .select("*").eq("version", approvedCardVersion).maybeSingle() : null;
  const c = !card || card.error ? null : card.data as ContextRateCard | null;
  const deployedSha = process.env.CONTEXT_AI_DEPLOYMENT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return NextResponse.json({
    code: "PRE_RESERVATION_READ_ONLY_DIAGNOSIS",
    checks: {
      approval_found: Boolean(a),
      policy_found: Boolean(policy.data) && !policy.error,
      identity_accepted: contextShadowIdentity() !== null,
      standard_retention_accepted: process.env.CONTEXT_AI_STANDARD_RETENTION_ACCEPTED === "accepted",
      provider_key_present: Boolean(process.env.OPENAI_API_KEY?.trim()),
      environment_match: a?.environment === "production" && process.env.CONTEXT_AI_ENVIRONMENT === a.environment
        && process.env.VERCEL_ENV === a.environment,
      deployment_sha_match: Boolean(a) && deployedSha === a?.deployment_sha,
      project_ref_match: Boolean(a) && process.env.CONTEXT_AI_OPENAI_PROJECT_REF === a?.project_ref,
      model_match: a?.model === AI_CONTEXT_MODEL && process.env.CONTEXT_AI_MODEL === AI_CONTEXT_MODEL,
      endpoint_match: a?.endpoint === "/v1/responses",
      prompt_fingerprint_match: process.env.CONTEXT_AI_PROMPT_FINGERPRINT === AI_CONTEXT_PROMPT_FINGERPRINT,
      schema_fingerprint_match: process.env.CONTEXT_AI_SCHEMA_FINGERPRINT === AI_CONTEXT_SCHEMA_FINGERPRINT,
      config_fingerprint_match: Boolean(a) && a?.config_fingerprint === AI_CONTEXT_CONFIG_FINGERPRINT
        && process.env.CONTEXT_AI_CONFIG_FINGERPRINT === AI_CONTEXT_CONFIG_FINGERPRINT,
      gate_version_match: process.env.CONTEXT_AI_GATE_VERSION === AI_CONTEXT_GATE_VERSION,
      runtime_fingerprint_match: Boolean(a) && a?.runtime_fingerprint === CONTEXT_SHADOW_RUNTIME_FINGERPRINT
        && process.env.CONTEXT_AI_RUNTIME_FINGERPRINT === CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
      rate_card_read_ok: Boolean(card) && !card?.error,
      rate_card_row_found: Boolean(c),
      rate_card_integrity_match: c !== null && validContextRateCard(c),
      rate_card_version_match: typeof approvedCardVersion === "string"
        && approvedCardVersion === process.env.CONTEXT_AI_RATE_CARD_VERSION,
      rate_card_fingerprint_match: c !== null && c.fingerprint === process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT,
    },
  }, { headers: noStore });
}
