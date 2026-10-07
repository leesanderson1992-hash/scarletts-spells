/** Read-only 30-day inventory. Emits counts and hashes, never writing text. */
import { createClient } from "@supabase/supabase-js";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";
import { planPassageWindows } from "../lib/writing-engine/whole-writing/context-passage-scan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_READONLY_CREDENTIALS_UNAVAILABLE");
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const since = new Date(Date.now() - 30 * 86400_000).toISOString();
const today = new Date().toISOString().slice(0, 10);

async function pages<T>(table: string, columns: string, timestamp: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0;; from += 500) {
    const result = await client.from(table).select(columns).gte(timestamp, since)
      .order(timestamp).range(from, from + 499);
    if (result.error) throw new Error(`INVENTORY_${table.toUpperCase()}_UNAVAILABLE`);
    rows.push(...(result.data as T[]));
    if ((result.data?.length ?? 0) < 500) break;
  }
  return rows;
}

async function main() {
const course = await pages<{ id: string; task_id: string; child_id: string;
  submitted_at: string; submission_text: string | null }>(
  "task_submissions", "id,task_id,child_id,submitted_at,submission_text", "submitted_at");
const proofRead = await client.from("writing_context_provider_proof_learners").select("child_id");
if (proofRead.error) throw new Error("INVENTORY_PROOF_SCOPE_UNAVAILABLE");
const proofChildren = new Set((proofRead.data ?? []).map(row => row.child_id));
const tasks = new Map<string, string>();
for (let i = 0; i < course.length; i += 100) {
  const ids = [...new Set(course.slice(i, i + 100).map(row => row.task_id))];
  if (!ids.length) continue;
  const read = await client.from("course_tasks").select("id,task_type").in("id", ids);
  if (read.error) throw new Error("INVENTORY_COURSE_TASKS_UNAVAILABLE");
  for (const row of read.data ?? []) tasks.set(row.id, row.task_type);
}
const lessons = course.filter(row => tasks.get(row.task_id) === "lesson" && !proofChildren.has(row.child_id));
const snapshots = new Map<string, SourceSnapshot>();
for (let i = 0; i < lessons.length; i += 100) {
  const ids = lessons.slice(i, i + 100).map(row => row.id);
  if (!ids.length) continue;
  const read = await client.from("writing_source_snapshots").select("*").in("submission_id", ids);
  if (read.error) throw new Error("INVENTORY_SNAPSHOTS_UNAVAILABLE");
  for (const row of read.data ?? []) snapshots.set(row.submission_id, row as SourceSnapshot);
}
const reviews = (await pages<{ id: string; child_id: string; writing_submitted_at: string; submitted_writing_text: string }>(
  "adle_review_sessions", "id,child_id,writing_submitted_at,submitted_writing_text", "writing_submitted_at"))
  .filter(row => !proofChildren.has(row.child_id));
const counts = new Map<string, { lessons: number; adle: number; windows: number; forecastWindows: number;
  manual: number }>();
function day(date: string) {
  const key = date.slice(0, 10);
  if (!counts.has(key)) counts.set(key, { lessons: 0, adle: 0, windows: 0, forecastWindows: 0, manual: 0 });
  return counts.get(key)!;
}
for (const row of lessons) {
  const d = day(row.submitted_at); d.lessons++;
  const snapshot = snapshots.get(row.id);
  if (!snapshot) { d.forecastWindows += row.submission_text?.trim() ? 3 : 0; d.manual++; continue; }
  const extraction = extractWholeWriting(snapshot);
  const fields = extraction.fields.filter(f => f.provenance === "learner_response")
    .map(f => ({ path: f.key, hash: f.textHash, text: f.rawText }));
  const windows = planPassageWindows({ fields });
  if (windows === null || !fields.length) { d.manual++; d.forecastWindows += 3; continue; }
  d.windows += windows.length;
}
for (const row of reviews) {
  if (!row.submitted_writing_text || !row.writing_submitted_at) continue;
  const d = day(row.writing_submitted_at); d.adle++;
  const text = row.submitted_writing_text;
  const windows = planPassageWindows({ fields: [{ path: "/submittedWritingText", hash: fingerprint(text), text }] });
  if (windows === null) { d.manual++; continue; }
  d.windows += windows.length;
}
const daily = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([date, c]) => ({ date, ...c, totalWindows: c.windows + c.forecastWindows }));
const observedPeak = Math.max(0, ...daily.map(d => d.totalWindows));
const recentSeven = daily.filter(d => d.date >= new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
const recentAverage = recentSeven.reduce((n, d) => n + d.totalWindows, 0) / 7;
const forecastPeak = Math.ceil(recentAverage * 1.5);
const proposedRequestsPerUtcDay = Math.max(32, Math.ceil(1.25 * Math.max(observedPeak, forecastPeak)));
const policy = await client.from("writing_context_shadow_policy")
  .select("max_usd_per_request,provider_approval_id").eq("singleton", true).maybeSingle();
if (policy.error) throw new Error("INVENTORY_POLICY_UNAVAILABLE");
const worstCaseReservation = Number(policy.data?.max_usd_per_request ?? NaN);
const proposedUsdPerUtcDay = Number.isFinite(worstCaseReservation)
  ? Number((proposedRequestsPerUtcDay * worstCaseReservation).toFixed(8)) : null;
const replay = await client.rpc("context_replay_dry_run_inventory");
console.log(JSON.stringify({ periodStart: since, periodEnd: today, daily,
  observedPeak, forecastPeak, forecastMethod: "150% of trailing seven-day daily mean",
  proposedRequestsPerUtcDay, worstCaseReservationUsd: Number.isFinite(worstCaseReservation)
    ? worstCaseReservation : null, proposedUsdPerUtcDay,
  replay: replay.error ? { status: "inventory_migration_pending" } : replay.data }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "INVENTORY_UNAVAILABLE"); process.exitCode = 1; });
