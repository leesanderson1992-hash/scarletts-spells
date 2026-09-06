/** Explicitly invoked disposable S5 proof; never targets production. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const REF = "jlhotktspjvffslvuyfz";
const ROOT = ".tmp/whole-writing-s5-staging";
const FILE = `${ROOT}/fixture.json`;
const CLI = process.env.WRITING_PROOF_SUPABASE_CLI;
const command = process.argv[2];
assert.ok(CLI, "WRITING_PROOF_SUPABASE_CLI required");
mkdirSync(ROOT, { recursive: true });

function run(args) {
  const result = spawnSync(CLI, args, { encoding: "utf8", timeout: 90_000 });
  if (result.status !== 0) throw new Error(result.stderr || "Staging command failed");
  return result.stdout;
}
function query(sql) {
  const path = `${ROOT}/proof.sql`; writeFileSync(path, sql, { mode: 0o600 });
  try {
    const output = run(["db", "query", "--linked", "--project-ref", REF, "--output", "json", "--file", path]);
    return JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)).rows;
  } finally { unlinkSync(path); }
}
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
const save = (fixture) => writeFileSync(FILE, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const state = () => JSON.parse(readFileSync(FILE, "utf8"));

if (command === "apply") {
  const name = "20260906150000_add_whole_writing_shadow_projections.sql";
  const sql = readFileSync(`supabase/migrations/${name}`, "utf8");
  assert.ok(!sql.includes("$s5migration$"));
  const before = query("select version from supabase_migrations.schema_migrations where version='20260906150000';");
  if (!before.length) query(`begin; set local lock_timeout='5s'; set local statement_timeout='45s'; ${sql}
    insert into supabase_migrations.schema_migrations(version,name,statements) values('20260906150000','add_whole_writing_shadow_projections',array[$s5migration$${sql}$s5migration$]); notify pgrst,'reload schema'; commit; select true as applied;`);
  console.log(JSON.stringify({ status: before.length ? "already_applied" : "applied", project: REF, migration: name, sha256: createHash("sha256").update(sql).digest("hex") }));
  process.exit(0);
}

const keyOutput = run(["projects", "api-keys", "--project-ref", REF, "--output", "json"]);
const keys = JSON.parse(keyOutput.slice(keyOutput.indexOf("["), keyOutput.lastIndexOf("]") + 1));
const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
assert.ok(serviceKey && anonKey);
const url = `https://${REF}.supabase.co`;
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protectedTables = ["adle_learning_items", "child_gold_coin_ledger_events", "child_gold_bar_ledger_events", "adle_authentic_use_events", "adle_review_schedule_words"];
async function counts() {
  return Object.fromEntries(await Promise.all(protectedTables.map(async (table) => {
    const result = await client.from(table).select("id", { count: "exact", head: true }); check(result); return [table, result.count];
  })));
}
async function signedIn(email, password) {
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  check(await auth.auth.signInWithPassword({ email, password })); return auth;
}

if (command === "setup") {
  assert.ok(!existsSync(FILE), "Fixture already exists; clean or resume it");
  const tag = randomUUID();
  const fixture = { tag, email: `s5-admin-${tag}@example.test`, otherEmail: `s5-parent-${tag}@example.test`, password: `S5-proof-${randomUUID()}!`, baseline: await counts() }; save(fixture);
  fixture.parentId = check(await client.auth.admin.createUser({ email: fixture.email, password: fixture.password, email_confirm: true })).user.id; save(fixture);
  fixture.otherParentId = check(await client.auth.admin.createUser({ email: fixture.otherEmail, password: fixture.password, email_confirm: true })).user.id; save(fixture);
  fixture.childId = check(await client.from("children").insert({ parent_user_id: fixture.parentId, first_name: "S5 Evidence Proof", notes: `disposable-s5:${tag}` }).select("id").single()).id; save(fixture);
  fixture.courseId = check(await client.from("courses").insert({ parent_user_id: fixture.parentId, child_id: fixture.childId, title: "S5 shadow proof", description: `disposable:${tag}`, structure_type: "timed" }).select("id").single()).id; save(fixture);
  fixture.moduleId = check(await client.from("course_modules").insert({ parent_user_id: fixture.parentId, course_id: fixture.courseId, title: "Shadow evidence", position: 0 }).select("id").single()).id; save(fixture);
  const lessonSchema = { version: 1, theme: "scarlett-default", title: "Shadow evidence", blocks: [{ block_id: "story", block_type: "question_textarea", label: "Story", rows: 3 }] };
  fixture.taskId = check(await client.from("course_tasks").insert({ parent_user_id: fixture.parentId, course_id: fixture.courseId, module_id: fixture.moduleId, title: "S5 evidence proof", task_type: "lesson", position: 0, is_active: true, coin_reward_trigger: "none", gold_bar_rule: "none", lesson_schema: lessonSchema }).select("id").single()).id; save(fixture);
  check(await client.from("writing_shadow_controls").insert({ child_id: fixture.childId, parent_user_id: fixture.parentId, capture_enabled: true, processing_enabled: true, extraction_enabled: true, resolution_enabled: true, evidence_shadow_enabled: true }));
  const parent = await signedIn(fixture.email, fixture.password);
  const text = "wash Quazibloom wash";
  const draft = { story: text, __structured_lesson_response: { answers: [{ block_id: "story", value: text }] } };
  const submittedAt = new Date().toISOString();
  const response = check(await parent.rpc("submit_course_task_response_once", { p_parent_user_id: fixture.parentId, p_child_id: fixture.childId, p_course_id: fixture.courseId, p_task_id: fixture.taskId, p_submission_request_id: randomUUID(), p_submission_text: text, p_submitted_at: submittedAt, p_completion_date: submittedAt.slice(0, 10), p_structured_payload_type: "structured_lesson_response", p_structured_payload: draft.__structured_lesson_response, p_processing_payload: { writingSourceCapture: { rawSubmissionText: text, draftPayload: draft }, draftPayload: draft } }));
  fixture.submissionId = response.submissionId; save(fixture);
  console.log(JSON.stringify({ status: "fixture_ready", childId: fixture.childId, adminEmail: fixture.email, nonAdminEmail: fixture.otherEmail, reportPath: `/admin/whole-writing-evidence?child=${fixture.childId}` }));
} else {
  const fixture = state();
  if (command === "configure-preview") {
    assert.ok(process.env.PREVIEW_URL && process.env.CRON_SECRET);
    fixture.previewUrl = process.env.PREVIEW_URL; fixture.cronSecret = process.env.CRON_SECRET; save(fixture);
    console.log(JSON.stringify({ status: "preview_configured", previewUrl: fixture.previewUrl }));
  } else if (command === "recover") {
    const result = spawnSync("vercel", ["curl", "/api/internal/task-submissions/process", "--deployment", fixture.previewUrl, "--", "--silent", "--show-error", "--header", `Authorization: Bearer ${fixture.cronSecret}`], { encoding: "utf8", timeout: 90_000 });
    assert.equal(result.status, 0, result.stderr || "Preview recovery failed");
    const body = JSON.parse(result.stdout); assert.equal(body.writingShadow.failed, 0); assert.ok(body.writingShadow.completed >= 1);
    console.log(JSON.stringify({ status: "recovered", writingShadow: body.writingShadow }));
  } else if (command === "replay") {
    const snapshot = check(await client.from("writing_source_snapshots").select("id").eq("submission_id", fixture.submissionId).single());
    const key = `s5-proof-replay:${fixture.tag}`;
    assert.equal(check(await client.rpc("enqueue_writing_shadow_replay", { p_snapshot_ids: [snapshot.id], p_release_key: key })), 1);
    assert.equal(check(await client.rpc("enqueue_writing_shadow_replay", { p_snapshot_ids: [snapshot.id], p_release_key: key })), 0);
    console.log(JSON.stringify({ status: "replay_queued", snapshotId: snapshot.id }));
  } else if (command === "verify") {
    const snapshots = check(await client.from("writing_source_snapshots").select("id").eq("submission_id", fixture.submissionId)); assert.equal(snapshots.length, 1);
    const batches = check(await client.from("writing_shadow_projection_batches").select("*").eq("snapshot_id", snapshots[0].id).order("created_at")); assert.equal(batches.length, 2);
    const receipts = check(await client.from("writing_shadow_occurrence_evidence_receipts").select("*").in("batch_id", batches.map((batch) => batch.id))); assert.equal(receipts.length, 6);
    assert.ok(receipts.every((receipt) => receipt.disposition === "BLOCKED" && receipt.event_id === null));
    assert.equal(receipts.filter((receipt) => receipt.lineage_reconciliation === "EXACT_HISTORICAL_MATCH").length, 3);
    assert.equal(check(await client.from("writing_shadow_current_occurrence_evidence").select("id").in("batch_id", batches.map((batch) => batch.id))).length, 3);
    assert.equal(check(await client.from("writing_shadow_skill_evidence_projections").select("id").in("batch_id", batches.map((batch) => batch.id))).length, 0);
    const candidates = check(await client.from("writing_shadow_occurrence_skill_candidates").select("id,receipt_id").in("receipt_id", receipts.map((receipt) => receipt.id))); assert.ok(candidates.length >= 2);
    const assessments = check(await client.from("writing_occurrence_assessments").select("outcome,independence,environment,assessment").in("id", receipts.map((receipt) => receipt.assessment_id)));
    assert.ok(assessments.every((assessment) => assessment.outcome === "unknown" && assessment.independence === "unknown" && assessment.environment === null && assessment.assessment.contextStatus === "NOT_ASSESSED"));
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await anon.from("writing_shadow_projection_batches").select("id").limit(1)).error);
    assert.deepEqual(await counts(), fixture.baseline);
    fixture.verified = true; save(fixture);
    console.log(JSON.stringify({ status: "verified", occurrencesPerBatch: 3, batches: 2, currentReceipts: 3, historicalReceipts: 6, exactReplayLinks: 3, skillCandidates: candidates.length, admittedProjections: 0, noLearningConsequences: true }));
  } else if (command === "cleanup") {
    const snapshotIds = check(await client.from("writing_source_snapshots").select("id").eq("child_id", fixture.childId)).map((row) => row.id);
    const batchIds = snapshotIds.length ? check(await client.from("writing_shadow_projection_batches").select("id").in("snapshot_id", snapshotIds)).map((row) => row.id) : [];
    check(await client.from("writing_shadow_controls").update({ capture_enabled: false, processing_enabled: false, extraction_enabled: false, resolution_enabled: false, evidence_shadow_enabled: false }).eq("child_id", fixture.childId));
    check(await client.auth.admin.deleteUser(fixture.parentId)); check(await client.auth.admin.deleteUser(fixture.otherParentId));
    assert.equal(check(await client.from("children").select("id").eq("id", fixture.childId)).length, 0);
    if (snapshotIds.length) assert.equal(check(await client.from("writing_shadow_projection_batches").select("id").in("snapshot_id", snapshotIds)).length, 0);
    if (batchIds.length) assert.equal(check(await client.from("writing_shadow_occurrence_evidence_receipts").select("id").in("batch_id", batchIds)).length, 0);
    assert.deepEqual(await counts(), fixture.baseline);
    fixture.cleaned = true; save(fixture);
    console.log(JSON.stringify({ status: "cleanup_verified", protectedCountsRestored: true, projectionBatchesRemoved: batchIds.length }));
  } else throw new Error("Use apply, setup, configure-preview, recover, replay, verify or cleanup");
}
