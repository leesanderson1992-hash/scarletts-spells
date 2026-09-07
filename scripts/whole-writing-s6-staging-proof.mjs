/** Explicit disposable S6 proof. The project ref below is staging only. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { processTaskSubmission } from "../lib/courses/submission-processing";
import { recoverWritingShadowRuns } from "../lib/writing-engine/whole-writing/worker";
import { buildWholeWritingKnownErrorFindings } from "../lib/writing-engine/whole-writing/known-errors";
import { findResolverVisibleTokenSafeCanonicalMappings } from "../lib/writing-engine/persistence/spelling-canonical-mappings";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const MIGRATION = "20260907100000_add_whole_writing_known_errors_and_retries.sql";
const command = process.argv[2];
const cli = process.env.WRITING_PROOF_SUPABASE_CLI;
const stagingUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function parseCliJson(output) {
  return JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1));
}

if (command === "apply") {
  assert.ok(cli, "WRITING_PROOF_SUPABASE_CLI is required");
  const root = mkdtempSync(join(tmpdir(), "writing-s6-staging-"));
  try {
    const queryPath = join(root, "query.sql");
    const query = (sql) => {
      writeFileSync(queryPath, sql, { mode: 0o600 });
      return parseCliJson(execFileSync(cli, ["db", "query", "--linked", "--project-ref", STAGING_REF, "--output", "json", "--file", queryPath], { encoding: "utf8", timeout: 90_000 })).rows;
    };
    const before = query(`select version from supabase_migrations.schema_migrations where version in ('20260906190000','20260907100000') order by version;`);
    assert.ok(before.some((row) => row.version === "20260906190000"), "E1/S5 integration is required in staging");
    if (before.some((row) => row.version === "20260907100000")) {
      console.log(JSON.stringify({ status: "already_applied", project: STAGING_REF, migration: MIGRATION }));
    } else {
      const sql = readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), "utf8");
      assert.ok(!sql.includes("$s6migration$"));
      const applied = query(`begin; set local lock_timeout='5s'; set local statement_timeout='60s'; ${sql}
        insert into supabase_migrations.schema_migrations(version,name,statements)
        values('20260907100000','add_whole_writing_known_errors_and_retries',array[$s6migration$${sql}$s6migration$]);
        commit; select true applied;`);
      assert.equal(applied[0]?.applied, true);
      console.log(JSON.stringify({ status: "applied", project: STAGING_REF, migration: MIGRATION, sha256: createHash("sha256").update(sql).digest("hex") }));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  process.exit(0);
}

assert.equal(command, "proof", "Use apply or proof");
assert.ok(stagingUrl?.includes(STAGING_REF), "The configured Supabase URL is not the fixed staging project");
assert.ok(serviceKey && anonKey, "Staging Supabase keys are required");
const client = createClient(stagingUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(stagingUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protectedTables = ["adle_learning_items", "child_gold_coin_ledger_events", "child_gold_bar_ledger_events", "adle_authentic_use_events", "adle_review_schedule_words"];
const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
async function counts() {
  return Object.fromEntries(await Promise.all(protectedTables.map(async (table) => {
    const result = await client.from(table).select("id", { count: "exact", head: true });
    if (result.error) throw new Error(result.error.message);
    return [table, result.count];
  })));
}

const tag = randomUUID();
let parentId = null;
try {
  const candidateRows = check(await client.from("spelling_canonical_mappings")
    .select("misspelling_normalized").eq("mapping_status", "active").eq("resolver_visibility_status", "visible")
    .contains("metadata", { automatic_detection_eligibility: "token_safe" }).limit(100));
  const mappings = await findResolverVisibleTokenSafeCanonicalMappings({
    supabase: client,
    observedNormalizedTokens: candidateRows.map((row) => row.misspelling_normalized),
  });
  const governed = mappings.find((mapping) => buildWholeWritingKnownErrorFindings({
    occurrences: [{ id: "probe", observedText: mapping.misspellingNormalized, provenance: "learner_response" }],
    mappings: [mapping],
  }).findings.length === 1);
  assert.ok(governed, "Staging has no resolver-visible token-safe mapping suitable for S6 proof");

  const email = `s6-proof-${tag}@example.test`;
  const password = `S6-proof-${randomUUID()}!`;
  parentId = check(await client.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  const childId = check(await client.from("children").insert({ parent_user_id: parentId, first_name: "S6 Proof", notes: `disposable-s6:${tag}` }).select("id").single()).id;
  const courseId = check(await client.from("courses").insert({ parent_user_id: parentId, child_id: childId, title: "S6 proof", description: `disposable:${tag}`, structure_type: "timed" }).select("id").single()).id;
  const moduleId = check(await client.from("course_modules").insert({ parent_user_id: parentId, course_id: courseId, title: "Known errors", position: 0 }).select("id").single()).id;
  const schema = { version: 1, theme: "scarlett-default", title: "Known errors", blocks: [{ block_id: "story", block_type: "question_textarea", label: "Story", rows: 3 }] };
  const taskId = check(await client.from("course_tasks").insert({ parent_user_id: parentId, course_id: courseId, module_id: moduleId, title: "S6 proof", task_type: "lesson", position: 0, is_active: true, coin_reward_trigger: "none", gold_bar_rule: "none", lesson_schema: schema }).select("id").single()).id;
  check(await client.from("writing_shadow_controls").insert({ child_id: childId, parent_user_id: parentId, capture_enabled: true, processing_enabled: true, extraction_enabled: true, resolution_enabled: true, evidence_shadow_enabled: false, known_error_detection_enabled: true, known_error_review_enabled: true }));

  check(await anon.auth.signInWithPassword({ email, password }));
  const text = `${governed.misspellingNormalized} garden`;
  const draft = { story: text, __structured_lesson_response: { answers: [{ block_id: "story", value: text }] } };
  const submittedAt = new Date().toISOString();
  const submitted = check(await anon.rpc("submit_course_task_response_once", {
    p_parent_user_id: parentId, p_child_id: childId, p_course_id: courseId, p_task_id: taskId,
    p_submission_request_id: randomUUID(), p_submission_text: text, p_submitted_at: submittedAt,
    p_completion_date: submittedAt.slice(0, 10), p_structured_payload_type: "structured_lesson_response",
    p_structured_payload: draft.__structured_lesson_response,
    p_processing_payload: { writingSourceCapture: { rawSubmissionText: text, draftPayload: draft }, draftPayload: draft, taskType: "lesson", completionDate: submittedAt.slice(0, 10) },
  }));
  assert.equal((await processTaskSubmission(submitted.submissionId)).status, "completed");
  const protectedBeforeS6 = await counts();
  const first = await recoverWritingShadowRuns(client);
  assert.equal(first.failed, 0); assert.ok(first.completed >= 1);

  const snapshot = check(await client.from("writing_source_snapshots").select("id").eq("submission_id", submitted.submissionId).single());
  let findings = check(await client.from("writing_known_spelling_current_findings").select("id,occurrence_id,intended_normalized,micro_skill_keys,lineage_reconciliation").eq("intended_normalized", governed.correctSpellingNormalized));
  assert.equal(findings.length, 1); assert.deepEqual(findings[0].micro_skill_keys, [governed.microSkillKey]);
  assert.equal(findings[0].lineage_reconciliation, "ORIGINAL");
  assert.equal(check(await client.from("misspelling_instances").select("id").eq("source_writing_occurrence_id", findings[0].occurrence_id)).length, 1);
  const occurrence = check(await client.from("writing_occurrences").select("id").eq("id", findings[0].occurrence_id).single());
  const interpretations = check(await client.from("writing_occurrence_interpretations").select("id").eq("occurrence_id", occurrence.id));
  const assessments = check(await client.from("writing_occurrence_assessments").select("outcome,independence,environment").in("interpretation_id", interpretations.map((row) => row.id)));
  assert.ok(assessments.every((row) => row.outcome === "unknown" && row.independence === "unknown" && row.environment === null));
  assert.deepEqual(await counts(), protectedBeforeS6);

  assert.equal(check(await client.rpc("enqueue_writing_shadow_replay", { p_snapshot_ids: [snapshot.id], p_release_key: `s6-proof:${tag}` })), 1);
  const replay = await recoverWritingShadowRuns(client); assert.equal(replay.failed, 0); assert.ok(replay.completed >= 1);
  findings = check(await client.from("writing_known_spelling_current_findings").select("id,occurrence_id,lineage_reconciliation").eq("occurrence_id", occurrence.id));
  assert.equal(findings.length, 1); assert.equal(findings[0].lineage_reconciliation, "EXACT_HISTORICAL_MATCH");
  assert.equal(check(await client.from("writing_known_spelling_findings").select("id").eq("occurrence_id", occurrence.id)).length, 2);
  assert.equal(check(await client.from("misspelling_instances").select("id").eq("source_writing_occurrence_id", occurrence.id)).length, 1);
  assert.ok((await anon.from("writing_known_spelling_findings").select("id").limit(1)).error);
  assert.deepEqual(await counts(), protectedBeforeS6);

  console.log(JSON.stringify({ status: "passed", project: STAGING_REF, submissionId: submitted.submissionId,
    mappingId: governed.mappingId, currentFindings: 1, historicalFindings: 2, exactReplayLinks: 1,
    reviewCandidates: 1, pendingAssessmentProvenance: true, consequentialWrites: 0 }));
} finally {
  if (parentId) check(await client.auth.admin.deleteUser(parentId));
}
