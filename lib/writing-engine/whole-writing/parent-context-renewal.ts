import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ParentContextChoiceStatus = "not_authorised" | "expired" | "due_soon" | "current" | "declined";

/** Return the current parent decision for a real child profile. */
export async function loadParentContextRenewal(input: {
  childId: string;
  parentUserId: string;
}): Promise<{ status: ParentContextChoiceStatus } | null> {
  const client = createServiceRoleClient();
  const [{ data: policy, error: policyError }, proof] = await Promise.all([
    client.from("writing_context_shadow_policy")
      .select("learner_policy_version,dispatch_scope")
      .eq("singleton", true).maybeSingle(),
    client.rpc("context_provider_proof_child", { p_child: input.childId }),
  ]);
  if (policyError) throw policyError;
  if (proof.error) throw proof.error;
  if (proof.data) return null;
  if (!policy || policy.dispatch_scope !== "REAL_LEARNER" || !policy.learner_policy_version) return null;
  const [authorisations, decisions] = await Promise.all([
    client.from("writing_context_learner_authorisations")
      .select("id,expires_at,approved_by,authorisation_kind")
      .eq("child_id", input.childId)
      .eq("parent_user_id", input.parentUserId)
      .eq("policy_version", policy.learner_policy_version)
      .order("approved_at", { ascending: false }),
    client.from("writing_context_parent_authorisation_decisions")
      .select("choice")
      .eq("child_id", input.childId)
      .eq("parent_user_id", input.parentUserId)
      .eq("policy_version", policy.learner_policy_version)
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);
  const { data: rows, error: rowsError } = authorisations;
  if (rowsError) throw rowsError;
  if (decisions.error) throw decisions.error;
  if (decisions.data?.[0]?.choice === "decline") return { status: "declined" };
  if (!rows?.length) return { status: "not_authorised" };
  const revocations = await client.from("writing_context_approval_revocations")
    .select("learner_authorisation_id")
    .in("learner_authorisation_id", rows.map((row) => row.id));
  if (revocations.error) throw revocations.error;
  const revoked = new Set((revocations.data ?? []).map((row) => row.learner_authorisation_id));
  const latest = rows.find((row) => row.approved_by === input.parentUserId &&
    row.authorisation_kind === "ADULT_SUBMISSION" && !revoked.has(row.id));
  if (!latest) return { status: "not_authorised" };
  const expiry = Date.parse(latest.expires_at);
  const now = Date.now();
  if (expiry > now + 7 * 24 * 60 * 60 * 1000) return { status: "current" };
  return { status: expiry <= now ? "expired" : "due_soon" };
}
