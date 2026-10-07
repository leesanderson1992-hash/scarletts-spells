/** Read-only current-work inventory for the one authorised replay learner. */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";

const learnerId = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_READONLY_CREDENTIALS_UNAVAILABLE");
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
async function main() {
  const rpc = await client.rpc("context_replay_dry_run_inventory");
  if (!rpc.error) {
    console.log(JSON.stringify({ learnerId, inventory: rpc.data }, null, 2));
    return;
  }
  // The read-only fallback works before the inventory migration. Course
  // source hashes remain unavailable until PostgreSQL calculates them.
  const submissions = await client.from("task_submissions")
    .select("id,task_id,submitted_at,parent_review_status")
    .eq("child_id", learnerId).order("submitted_at", { ascending: false });
  if (submissions.error) throw new Error("REPLAY_COURSE_READ_UNAVAILABLE");
  const taskIds = [...new Set((submissions.data ?? []).map(s => s.task_id))];
  const taskTypes = new Map<string, string>();
  for (let i = 0; i < taskIds.length; i += 100) {
    const tasks = await client.from("course_tasks").select("id,task_type").in("id", taskIds.slice(i, i + 100));
    if (tasks.error) throw new Error("REPLAY_TASK_SCOPE_UNAVAILABLE");
    for (const task of tasks.data ?? []) taskTypes.set(task.id, task.task_type);
  }
  const latest = new Map<string, typeof submissions.data extends (infer T)[] ? T : never>();
  for (const submission of submissions.data ?? []) if (!latest.has(submission.task_id)) latest.set(submission.task_id, submission);
  const course = [];
  for (const submission of latest.values()) {
    if (taskTypes.get(submission.task_id) !== "lesson" || submission.parent_review_status !== "pending") continue;
    const source = await client.from("writing_source_snapshots").select("*").eq("submission_id", submission.id).maybeSingle();
    if (source.error) throw new Error("REPLAY_COURSE_SOURCE_UNAVAILABLE");
    const scanned = source.data ? await client.from("writing_context_shadow_jobs")
      .select("id").eq("snapshot_id", source.data.id).limit(1) : null;
    if (scanned?.error) throw new Error("REPLAY_COURSE_JOB_UNAVAILABLE");
    if (scanned?.data?.length) continue;
    const authored = source.data ? extractWholeWriting(source.data as SourceSnapshot).fields
      .some(f => f.provenance === "learner_response") : false;
    course.push({ sourceType: "course_lesson", sourceId: submission.id,
      snapshotId: source.data?.id ?? null, sourceHash: null,
      status: authored ? "needs_db_hash_and_grant" : "manual_review",
      reason: authored ? "EXACT_SOURCE_HASH_PENDING_MIGRATION" : "AUTHORSHIP_UNVERIFIED" });
  }
  const sessions = await client.from("adle_review_sessions")
    .select("id,submitted_writing_text,writing_started_at,writing_submitted_at,completed_at")
    .eq("child_id", learnerId).not("completed_at", "is", null);
  if (sessions.error) throw new Error("REPLAY_ADLE_READ_UNAVAILABLE");
  const adle = [];
  for (const session of sessions.data ?? []) {
    if (!session.submitted_writing_text) continue;
    const inspected = await client.from("adle_review_parent_reviews")
      .select("review_session_id").eq("review_session_id", session.id).maybeSingle();
    if (inspected.error) throw new Error("REPLAY_INSPECTION_READ_UNAVAILABLE");
    if (inspected.data) continue;
    const hash = createHash("sha256").update(session.submitted_writing_text).digest("hex");
    adle.push({ sourceType: "adle_review", sourceId: session.id, sourceHash: hash,
      status: session.writing_started_at && session.writing_submitted_at ? "eligible_for_exact_grant"
        : "manual_review", reason: session.writing_started_at && session.writing_submitted_at
        ? "FINAL_REVIEW_WRITING" : "AUTHORSHIP_UNVERIFIED" });
  }
  console.log(JSON.stringify({ learnerId, inventory: [...course, ...adle] }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "REPLAY_INVENTORY_UNAVAILABLE"); process.exitCode = 1; });
