import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadSchwaWorkbookQueue, publishCheckedSchwaWorkbookWord } from "./schwa-bulk-review";
type Db = ReturnType<typeof createServiceRoleClient>;
export type PublishScope = { environment: "staging" | "production"; actor: string; skill: string };
export type SchwaPublishJob = { id: string; status: "active" | "paused" | "completed"; items: {
  draftId: string; wordId: string; word: string; status: "pending" | "publishing" | "published" | "failed" | "blocked";
  error: string | null; leaseUntil: string | null;
}[] };
async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function readSchwaPublishJob(db: Db, scope: PublishScope, id?: string): Promise<SchwaPublishJob | null> {
  let query = db.from("teaching_dictionary_publish_jobs").select("id,status").eq("environment_key", scope.environment)
    .eq("created_by", scope.actor).eq("micro_skill_key", scope.skill);
  query = id ? query.eq("id", id) : query.in("status", ["active", "paused"]);
  const job = await checked(query.order("created_at", { ascending: false }).limit(1).maybeSingle());
  if (!job) return null;
  const items = await checked(db.from("teaching_dictionary_publish_job_items")
    .select("draft_id,canonical_word_id,word,status,error,lease_until").eq("job_id", job.id).order("ordinal"));
  return { id: job.id, status: job.status, items: (items ?? []).map(item => ({ draftId: item.draft_id, wordId: item.canonical_word_id,
    word: item.word, status: item.status, error: item.error, leaseUntil: item.lease_until })) };
}
export async function startSchwaPublishJob(db: Db, scope: PublishScope, requestId: string, drafts: string[]) {
  const id = await checked(db.rpc("start_dictionary_schwa_publish_job", { p_environment: scope.environment,
    p_actor: scope.actor, p_skill: scope.skill, p_request: requestId, p_drafts: drafts }));
  return readSchwaPublishJob(db, scope, id);
}
export async function controlSchwaPublishJob(db: Db, scope: PublishScope, id: string, action: "pause" | "resume") {
  const job = await readSchwaPublishJob(db, scope, id);
  if (!job) throw new Error("Publish job not found for this account and lesson.");
  if (job.status === "completed") return job;
  if (action === "resume") await checked(db.from("teaching_dictionary_publish_job_items")
    .update({ status: "pending", error: null, lease_until: null }).eq("job_id", id).eq("status", "failed").select("draft_id"));
  await checked(db.from("teaching_dictionary_publish_jobs").update({ status: action === "pause" ? "paused" : "active", updated_at: new Date().toISOString() })
    .eq("id", id).eq("created_by", scope.actor).eq("environment_key", scope.environment).select("id"));
  return readSchwaPublishJob(db, scope, id);
}
export async function processSchwaPublishBatch(db: Db, scope: PublishScope, id: string) {
  const job = await readSchwaPublishJob(db, scope, id);
  if (!job) throw new Error("Publish job not found for this account and lesson.");
  if (job.status !== "active") return job;
  const claims = await checked(db.rpc("claim_dictionary_schwa_publish_items", {
    p_environment: scope.environment, p_actor: scope.actor, p_job: id,
  })) as { draft_id: string; canonical_word_id: string; lease_token: string }[];
  if (claims.length) {
    // One small, current preflight for the batch; omit optional enrichment reads.
    const rows = await loadSchwaWorkbookQueue(db, scope.skill, claims.map(item => item.canonical_word_id), false);
    const results = await Promise.allSettled(claims.map(async item => {
      const row = rows.find(row => row.id === item.draft_id && row.wordId === item.canonical_word_id);
      let status: "published" | "failed" | "blocked" = "blocked", error: string | null = null, version: string | null = null;
      if (!row || row.blockers.length) error = row?.blockers.join(" ") || "This word has a newer review. Open its word page or refresh the lesson preview.";
      else {
        try { const published = await publishCheckedSchwaWorkbookWord(db, scope.actor, scope.skill, row); status = "published"; version = published.contentVersionId; }
        catch (cause) { status = "failed"; error = cause instanceof Error ? cause.message : "Publishing interrupted. Resume to retry this word."; }
      }
      await checked(db.from("teaching_dictionary_publish_job_items").update({ status, error: error?.slice(0, 2000),
        published_version_id: version, lease_until: null, lease_token: null, updated_at: new Date().toISOString() })
        .eq("job_id", id).eq("draft_id", item.draft_id).eq("lease_token", item.lease_token).select("draft_id"));
    }));
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason; // Durable leases make lost acknowledgements resumable.
  }
  const current = await readSchwaPublishJob(db, scope, id);
  if (current && !current.items.some(item => item.status === "pending" || item.status === "publishing")) {
    const status = current.items.some(item => item.status === "failed") ? "paused" : "completed";
    await checked(db.from("teaching_dictionary_publish_jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id"));
  }
  return readSchwaPublishJob(db, scope, id);
}
