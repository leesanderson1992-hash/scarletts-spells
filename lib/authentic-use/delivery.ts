import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverFirstSubmissionAuthenticUseForRewards } from "@/lib/rewards/authentic-use-credit-consumer";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { fingerprint } from "@/lib/writing-engine/baseline/source";
import { object } from "@/lib/writing-engine/whole-writing/source";

type Delivery = { credit_id: string; consumer: "gold" | "proficiency"; child_id: string; parent_user_id: string; claim_token: string };
type Credit = { id: string; canonical_word_id: string | null };

async function readAll<T>(client: SupabaseClient, table: string, columns: string, childId: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const response = await client.from(table).select(columns).eq("child_id", childId).order("id").range(offset, offset + 499);
    if (response.error) throw new Error("AUTHENTIC_USE_PROFICIENCY_READ_FAILED");
    const page = response.data as unknown as T[];
    result.push(...page);
    if (page.length < 500) return result;
  }
}

/** Both initial deliveries and future published mappings use the released
 * report calculator. Evidence IDs and prior reports are retained separately. */
export async function calculateAuthenticUseProficiency(client: SupabaseClient, childId: string) {
  const loaded = await loadDailyPlanFacts(client, {
    childId,
    today: new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
    relationshipEnvironment: process.env.VERCEL_ENV === "production" ? "production" : undefined,
  });
  const events = await readAll<{ source_ref: string; row_status: string }>(client, "adle_authentic_use_events", "id,source_ref,row_status", childId);
  const projected = new Set(events.filter(event => event.row_status === "active").map(event => event.source_ref));
  const credits = await readAll<Credit>(client, "authentic_use_credits", "id,canonical_word_id", childId);
  const history = await client.from("authentic_use_current_proficiency").select("micro_skill_key,report,calculated_at,id")
    .eq("child_id", childId).order("calculated_at", { ascending: false }).order("id", { ascending: false });
  if (history.error) throw new Error("AUTHENTIC_USE_PROFICIENCY_HISTORY_FAILED");
  return loaded.proficiencyReports.flatMap(report => {
    const related = new Set(loaded.proficiencyRelationships.filter(r => r.microSkillKey === report.microSkillKey).map(r => r.canonicalWordId));
    const sourceCreditIds = credits.filter(c => projected.has(`authentic-use:${c.id}`) && c.canonical_word_id && related.has(c.canonical_word_id)).map(c => c.id).sort();
    // A removed mapping still needs a downward recomputation/explanation.
    const prior = history.data.find(row => row.micro_skill_key === report.microSkillKey);
    if (!sourceCreditIds.length && !prior) return [];
    return [{ microSkillKey: report.microSkillKey, sourceCreditIds, report, priorReport: prior?.report ?? null,
      policyVersion: report.proficiencyPolicyVersion,
      fingerprint: fingerprint({ input: loaded.proficiencyFingerprint, skill: report.microSkillKey, sourceCreditIds }) }];
  });
}

export async function recoverAuthenticUseDeliveries(limit = 100, client: SupabaseClient = createServiceRoleClient(), calculate = calculateAuthenticUseProficiency) {
  const summary = { claimed: 0, delivered: 0, ineligible: 0, failed: 0, refreshedChildren: 0, refreshFailures: 0 };
  const reconciled = await client.rpc("reconcile_authentic_use_word_identities");
  if (reconciled.error) {
    if (["PGRST202", "42883"].includes(reconciled.error.code)) return { ...summary, status: "not_installed" as const };
    throw new Error("AUTHENTIC_USE_IDENTITY_RECONCILIATION_FAILED");
  }
  const claimed = await client.rpc("claim_authentic_use_deliveries", { p_limit: limit });
  if (claimed.error) throw new Error("AUTHENTIC_USE_CLAIM_FAILED");
  const jobs = (claimed.data ?? []) as Delivery[];
  summary.claimed = jobs.length;
  const stagedJobs: Delivery[] = [];
  const fail = async (job: Delivery) => {
    summary.failed++;
    const failed = await client.rpc("fail_authentic_use_delivery", { p_credit_id: job.credit_id, p_consumer: job.consumer, p_claim_token: job.claim_token });
    if (failed.error) console.error("[authentic-use] receipt failure; lease recovery pending", { consumer: job.consumer });
  };
  // Stage the batch first, then calculate once per child, not once per word.
  for (const job of jobs) {
    try {
      const params = { p_credit_id: job.credit_id, p_claim_token: job.claim_token };
      const response = job.consumer === "gold"
        ? await deliverFirstSubmissionAuthenticUseForRewards(client, job.credit_id, job.claim_token)
        : await client.rpc("stage_authentic_use_proficiency", params);
      if (response.error) throw new Error("AUTHENTIC_USE_CONSUMER_FAILED");
      if (object(response.data).status === "ineligible") summary.ineligible++;
      else if (job.consumer === "gold") summary.delivered++;
      else stagedJobs.push(job);
    } catch { await fail(job); }
  }
  const calculationsByChild = new Map<string, Awaited<ReturnType<typeof calculateAuthenticUseProficiency>>>();
  for (const childId of new Set(stagedJobs.map(j => j.child_id))) {
    const childJobs = stagedJobs.filter(j => j.child_id === childId);
    try {
      const calculations = await calculate(client, childId);
      calculationsByChild.set(childId, calculations);
      for (const job of childJobs) {
        const completed = await client.rpc("complete_authentic_use_proficiency", { p_credit_id: job.credit_id, p_claim_token: job.claim_token, p_calculations: calculations });
        if (completed.error) await fail(job); else summary.delivered++;
      }
    } catch { for (const job of childJobs) await fail(job); }
  }
  // Rotate through the cohort, including children whose receipts are already
  // delivered. New published relationships therefore reuse retained history.
  const controls = await client.from("authentic_use_controls").select("child_id,parent_user_id").eq("mode", "enabled")
    .eq("proficiency_enabled", true).order("proficiency_checked_at", { ascending: true, nullsFirst: true }).limit(10);
  if (controls.error) throw new Error("AUTHENTIC_USE_REFRESH_COHORT_FAILED");
  for (const control of controls.data) {
    try {
      const calculations = calculationsByChild.get(control.child_id) ?? await calculate(client, control.child_id);
      const result = await client.rpc("refresh_authentic_use_proficiency", { p_child_id: control.child_id, p_parent_user_id: control.parent_user_id, p_calculations: calculations });
      if (result.error) throw new Error("AUTHENTIC_USE_REFRESH_FAILED");
      summary.refreshedChildren++;
    } catch { summary.refreshFailures++; }
    // Failed children rotate too, so one fault cannot starve the cohort.
    await client.from("authentic_use_controls").update({ proficiency_checked_at: new Date().toISOString() }).eq("child_id", control.child_id);
  }
  return summary;
}
