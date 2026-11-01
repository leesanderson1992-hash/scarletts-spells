import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Return every child profile that can receive a new parent decision. */
export async function loadParentContextRenewal(input: {
  childId: string;
  parentUserId: string;
}): Promise<{ status: "not_authorised" | "expired" | "due_soon" } | null> {
  const client = createServiceRoleClient();
  const { data: policy, error: policyError } = await client
    .from("writing_context_shadow_policy")
    .select("learner_policy_version,dispatch_scope")
    .eq("singleton", true).maybeSingle();
  if (policyError) throw policyError;
  if (!policy || policy.dispatch_scope !== "REAL_LEARNER" || !policy.learner_policy_version) return null;
  const { data: rows, error: rowsError } = await client
    .from("writing_context_learner_authorisations")
    .select("id,expires_at,approved_by,authorisation_kind")
    .eq("child_id", input.childId)
    .eq("parent_user_id", input.parentUserId)
    .eq("policy_version", policy.learner_policy_version)
    .order("approved_at", { ascending: false });
  if (rowsError) throw rowsError;
  if (!rows?.length) return { status: "not_authorised" };
  const { data: revocations, error: revocationsError } = await client
    .from("writing_context_approval_revocations")
    .select("learner_authorisation_id")
    .in("learner_authorisation_id", rows.map((row) => row.id));
  if (revocationsError) throw revocationsError;
  if (revocations?.length) return null;
  const latest = rows.find((row) => row.approved_by === input.parentUserId && row.authorisation_kind === "ADULT_SUBMISSION");
  if (!latest) return { status: "not_authorised" };
  const expiry = Date.parse(latest.expires_at);
  const now = Date.now();
  if (expiry > now + 7 * 24 * 60 * 60 * 1000) return null;
  return { status: expiry <= now ? "expired" : "due_soon" };
}
