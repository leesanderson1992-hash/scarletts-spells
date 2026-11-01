import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Only an existing, unrevoked adult-submission authorisation can prompt renewal. */
export async function loadParentContextRenewal(input: {
  childId: string;
  parentUserId: string;
}): Promise<{ expiresAt: string; expired: boolean } | null> {
  const client = createServiceRoleClient();
  const { data: policy, error: policyError } = await client
    .from("writing_context_shadow_policy")
    .select("learner_policy_version,dispatch_scope")
    .eq("singleton", true).maybeSingle();
  if (policyError) throw policyError;
  if (!policy || policy.dispatch_scope !== "REAL_LEARNER" || !policy.learner_policy_version) return null;
  const { data: rows, error: rowsError } = await client
    .from("writing_context_learner_authorisations")
    .select("id,expires_at")
    .eq("child_id", input.childId)
    .eq("parent_user_id", input.parentUserId)
    .eq("policy_version", policy.learner_policy_version)
    .eq("authorisation_kind", "ADULT_SUBMISSION")
    .eq("approved_by", input.parentUserId)
    .order("approved_at", { ascending: false }).limit(20);
  if (rowsError) throw rowsError;
  if (!rows?.length) return null;
  const { data: revocations, error: revocationsError } = await client
    .from("writing_context_approval_revocations")
    .select("learner_authorisation_id")
    .in("learner_authorisation_id", rows.map((row) => row.id));
  if (revocationsError) throw revocationsError;
  if (revocations?.length) return null;
  const latest = rows[0];
  const expiry = Date.parse(latest.expires_at);
  const now = Date.now();
  if (expiry > now + 7 * 24 * 60 * 60 * 1000) return null;
  return { expiresAt: latest.expires_at, expired: expiry <= now };
}
