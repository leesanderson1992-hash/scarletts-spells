/** Explicit disposable E1 proof. Project is fixed to staging; production is impossible. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const REF = "jlhotktspjvffslvuyfz";
const ROOT = ".tmp/writing-enrichment-staging";
const FILE = `${ROOT}/fixture.json`;
const CLI = process.env.WRITING_PROOF_SUPABASE_CLI;
const command = process.argv[2];
assert.ok(CLI, "WRITING_PROOF_SUPABASE_CLI required");
assert.ok(!process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT || process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "local",
  "Disposable proof requires the isolated local authority environment");
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "local";
mkdirSync(ROOT, { recursive: true, mode: 0o700 });

function run(args) {
  const result = spawnSync(CLI, args, { encoding: "utf8", timeout: 60_000 });
  if (result.status !== 0) throw new Error(result.stderr || "Staging command failed");
  return result.stdout;
}
function query(sql) {
  const file = `${ROOT}/proof.sql`;
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    const output = run(["db", "query", "--linked", "--project-ref", REF, "--output", "json", "--file", file]);
    return JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)).rows;
  } finally { unlinkSync(file); }
}
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
const save = (state) => writeFileSync(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
const load = () => JSON.parse(readFileSync(FILE, "utf8"));

if (command === "apply") {
  const name = "20260906160000_add_writing_enrichment_operations.sql";
  const sql = readFileSync(`supabase/migrations/${name}`, "utf8");
  assert.ok(!sql.includes("$e1migration$"));
  const existing = query("select version from supabase_migrations.schema_migrations where version='20260906160000';");
  const before = query("select md5(pg_get_functiondef('persist_writing_shadow_result(uuid,uuid,jsonb)'::regprocedure)) writer_hash;")[0].writer_hash;
  if (!existing.length) query(`begin; set local lock_timeout='5s'; set local statement_timeout='60s'; ${sql}
    insert into supabase_migrations.schema_migrations(version,name,statements)
    values('20260906160000','add_writing_enrichment_operations',array[$e1migration$${sql}$e1migration$]);
    notify pgrst,'reload schema'; commit; select true applied;`);
  const after = query("select md5(pg_get_functiondef('persist_writing_shadow_result(uuid,uuid,jsonb)'::regprocedure)) writer_hash;")[0].writer_hash;
  assert.equal(after, before, "E1 replaced the installed S2/S5 evidence writer");
  console.log(JSON.stringify({ status: existing.length ? "already_applied" : "applied", project: REF, migration: name,
    sha256: createHash("sha256").update(sql).digest("hex"), evidenceWriterPreserved: true }));
} else {
  const rawKeys = run(["projects", "api-keys", "--project-ref", REF, "--output", "json"]);
  const keys = JSON.parse(rawKeys.slice(rawKeys.indexOf("["), rawKeys.lastIndexOf("]") + 1));
  const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
  const anonKey = keys.find((item) => item.name === "anon")?.api_key;
  assert.ok(serviceKey && anonKey);
  const url = `https://${REF}.supabase.co`;
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const protectedTables = ["adle_learning_items", "child_gold_coin_ledger_events", "child_gold_bar_ledger_events",
    "adle_authentic_use_events", "adle_review_schedule_words", "adle_canonical_intake_events"];
  const counts = async () => Object.fromEntries(await Promise.all(protectedTables.map(async (table) => {
    const result = await client.from(table).select("id", { head: true, count: "exact" });
    check(result); return [table, result.count];
  })));
  const insert = async (table, row) => check(await client.from(table).insert(row).select("id").single()).id;

  if (command === "setup") {
    assert.ok(!existsSync(FILE), "Fixture already exists; resume or clean it");
    const reviewControls = check(await client.from("adle_word_skill_review_controls").select("*").eq("environment_key", "local").single());
    const enrichmentControls = check(await client.from("writing_enrichment_controls").select("*").eq("environment_key", "local").single());
    assert.ok(!reviewControls.review_enabled && !reviewControls.publication_enabled && !reviewControls.withdrawal_enabled);
    assert.ok(!enrichmentControls.inventory_enabled && !enrichmentControls.generation_enabled && !enrichmentControls.replay_enabled);
    const { loadDeterministicEnrichmentGenerationInputs } = await import("../lib/writing-engine/whole-writing/enrichment-generation-repository.ts");
    const sourceInputs = await loadDeterministicEnrichmentGenerationInputs(client, "local");
    const governedWords = new Set(sourceInputs.authority.relationships.map((row) => row.canonicalWordId));
    const approvedSourceChoices = sourceInputs.sources.filter((row) => row.sourceUseApproved && row.relationshipRole === "demonstrates"
      && sourceInputs.activeCanonicalWordIds.has(row.canonicalWordId) && sourceInputs.activeMicroSkillKeys.has(row.microSkillKey)
      && !governedWords.has(row.canonicalWordId));
    const selected = [];
    const coherentGroups = new Map();
    for (const source of approvedSourceChoices) {
      const key = `${source.sourceKind}\u0000${source.microSkillKey}`;
      const group = coherentGroups.get(key) ?? [];
      if (!group.some((item) => item.canonicalWordId === source.canonicalWordId)) group.push(source);
      coherentGroups.set(key, group);
    }
    const approvedGroup = [...coherentGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).find(([, rows]) => rows.length >= 2);
    if (approvedGroup) selected.push(...approvedGroup[1].slice(0, 2));
    const tag = randomUUID();
    if (selected.length < 2) {
      const uncovered = check(await client.from("canonical_teaching_dictionary_words").select("id,normalised_word,dialect_code")
        .eq("row_status", "active").order("id").range(0, 999)).filter((row) => !governedWords.has(row.id));
      const formCounts = new Map();
      for (const row of uncovered) {
        const key = `${row.dialect_code}\u0000${row.normalised_word}`;
        formCounts.set(key, (formCounts.get(key) ?? 0) + 1);
      }
      const unique = uncovered.filter((row) => formCounts.get(`${row.dialect_code}\u0000${row.normalised_word}`) === 1
        && !selected.some((item) => item.canonicalWordId === row.id));
      const skillRows = check(await client.from("micro_skill_catalog").select("micro_skill_key").eq("is_active", true).order("micro_skill_key").limit(1));
      while (selected.length < 2) {
        const word = unique.shift(), skill = skillRows[0];
        assert.ok(word && skill, "Staging lacks two unique uncovered identities for the disposable proof");
        selected.push({ sourceKind: "reviewed_morphology",
          sourceId: `disposable-e1:${tag}:${selected.length}`, sourceVersion: "original-synthetic-v1", canonicalWordId: word.id,
          microSkillKey: skill.micro_skill_key, relationshipRole: "demonstrates", sourceReference: "Original synthetic disposable E1 proof; not a curriculum assertion",
          licenceReference: "Original synthetic proof", sourceUseApproved: true });
      }
    }
    const covered = sourceInputs.authority.relationships.find((row) => !selected.some((item) => item.canonicalWordId === row.canonicalWordId));
    assert.ok(covered, "Staging lacks an unaffected governed word");
    const wordIds = [...selected.map((row) => row.canonicalWordId), covered.canonicalWordId];
    const labels = check(await client.from("canonical_teaching_dictionary_words").select("id,normalised_word").in("id", wordIds));
    const label = new Map(labels.map((row) => [row.id, row.normalised_word]));
    assert.equal(label.size, 3);

    const state = { tag, password: `E1-proof-${randomUUID()}!`, baseline: await counts(), selected, covered,
      approvedExistingSourceChoiceCount: approvedSourceChoices.length,
      forms: Object.fromEntries(labels.map((row) => [row.id, row.normalised_word])) };
    state.email = `e1-${state.tag}@example.test`; save(state);
    state.actor = check(await client.auth.admin.createUser({ email: state.email, password: state.password, email_confirm: true })).user.id; save(state);
    state.childId = await insert("children", { parent_user_id: state.actor, first_name: "E1 Proof", notes: `disposable-e1:${state.tag}` }); save(state);
    state.courseId = await insert("courses", { parent_user_id: state.actor, child_id: state.childId, title: "E1 proof", description: `disposable:${state.tag}`, structure_type: "timed" }); save(state);
    state.moduleId = await insert("course_modules", { parent_user_id: state.actor, course_id: state.courseId, title: "E1 proof", position: 0 }); save(state);
    const lessonSchema = { version: 1, theme: "scarlett-default", title: "E1 proof", blocks: [{ block_id: "answer", block_type: "question_textarea", label: "Writing", rows: 3 }] };
    state.taskId = await insert("course_tasks", { parent_user_id: state.actor, course_id: state.courseId, module_id: state.moduleId,
      title: "E1 proof", task_type: "lesson", position: 0, is_active: true, coin_reward_trigger: "none", gold_bar_rule: "none", lesson_schema: lessonSchema }); save(state);
    check(await client.from("writing_shadow_controls").insert({ child_id: state.childId, parent_user_id: state.actor,
      capture_enabled: true, processing_enabled: true, extraction_enabled: true, resolution_enabled: true, evidence_shadow_enabled: true }));
    check(await client.from("writing_enrichment_cohorts").insert({ environment_key: "local", child_id: state.childId, parent_user_id: state.actor, enabled: true }));
    check(await client.from("writing_enrichment_controls").update({ inventory_enabled: true, generation_enabled: true, replay_enabled: true }).eq("environment_key", "local"));
    check(await client.from("adle_word_skill_review_controls").update({ review_enabled: true, publication_enabled: true, withdrawal_enabled: true }).eq("environment_key", "local"));
    const parent = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    check(await parent.auth.signInWithPassword({ email: state.email, password: state.password }));
    const rawText = `${label.get(selected[0].canonicalWordId)} ${label.get(selected[0].canonicalWordId)} ${label.get(selected[1].canonicalWordId)} ${label.get(selected[1].canonicalWordId)} ${label.get(covered.canonicalWordId)}`;
    const occurredAt = new Date().toISOString();
    const draft = { version: 1, answers: [{ block_id: "answer", value: rawText }] };
    const submitted = check(await parent.rpc("submit_course_task_response_once", { p_parent_user_id: state.actor, p_child_id: state.childId,
      p_course_id: state.courseId, p_task_id: state.taskId, p_submission_request_id: randomUUID(), p_submission_text: rawText,
      p_submitted_at: occurredAt, p_completion_date: occurredAt.slice(0, 10), p_structured_payload_type: "structured_lesson_response",
      p_structured_payload: draft, p_processing_payload: { writingSourceCapture: { rawSubmissionText: rawText, draftPayload: { __structured_lesson_response: draft } } } }));
    state.submissionId = submitted.submissionId; save(state);
    const { recoverWritingShadowRuns } = await import("../lib/writing-engine/whole-writing/worker.ts");
    const initial = await recoverWritingShadowRuns(client);
    assert.equal(initial.failed, 0); assert.equal(initial.completed, 1);
    const { loadWritingEnrichmentInventory } = await import("../lib/writing-engine/whole-writing/enrichment-inventory-repository.ts");
    const inventory = await loadWritingEnrichmentInventory({ client, environment: "local", corpusScope: `disposable-e1:${state.tag}`, childIds: [state.childId] });
    assert.ok(inventory.pilot.some((row) => row.canonicalWordId === selected[0].canonicalWordId && row.occurrenceCount === 2));
    assert.ok(inventory.pilot.some((row) => row.canonicalWordId === selected[1].canonicalWordId && row.occurrenceCount === 2));
    assert.ok(!inventory.pilot.some((row) => row.canonicalWordId === covered.canonicalWordId));
    const persisted = check(await client.rpc("persist_writing_enrichment_inventory", { p_key: `e1-proof:${state.tag}`, p_environment: "local", p_report: inventory, p_actor: state.actor }));
    state.inventoryRunId = persisted;
    const entries = check(await client.from("writing_enrichment_inventory_entries").select("id,canonical_word_id").eq("run_id", persisted));
    const entryByWord = new Map(entries.map((row) => [row.canonical_word_id, row.id]));
    const { generateDeterministicEnrichmentCandidates } = await import("../lib/writing-engine/whole-writing/enrichment-generation.ts");
    const selectedSourceIds = new Set(sourceInputs.sources.map((row) => row.sourceId));
    const generationSources = [...sourceInputs.sources, ...selected.filter((row) => !selectedSourceIds.has(row.sourceId))];
    const generation = generateDeterministicEnrichmentCandidates({ observedGapWordIds: new Set(inventory.pilot.flatMap((row) => row.canonicalWordId ? [row.canonicalWordId] : [])),
      activeCanonicalWordIds: sourceInputs.activeCanonicalWordIds, activeMicroSkillKeys: sourceInputs.activeMicroSkillKeys,
      sources: generationSources, governedPairs: sourceInputs.governedPairs, pendingPairs: sourceInputs.pendingPairs, history: sourceInputs.history });
    const candidates = selected.map((choice) => generation.candidates.find((candidate) => candidate.canonicalWordId === choice.canonicalWordId
      && candidate.microSkillKey === choice.microSkillKey)).filter(Boolean);
    assert.equal(candidates.length, 2);
    const duplicateProbe = generateDeterministicEnrichmentCandidates({ observedGapWordIds: new Set([covered.canonicalWordId]),
      activeCanonicalWordIds: sourceInputs.activeCanonicalWordIds, activeMicroSkillKeys: sourceInputs.activeMicroSkillKeys,
      governedPairs: sourceInputs.governedPairs, pendingPairs: new Set(), history: [], sources: [{ sourceKind: "approved_specialist_membership",
        sourceId: "existing-phase-b-proof", sourceVersion: sourceInputs.authority.reconciliation.sourceFingerprint,
        canonicalWordId: covered.canonicalWordId, microSkillKey: covered.microSkillKey, relationshipRole: covered.relationshipRole,
        sourceReference: "existing-phase-b-authority", licenceReference: "existing-governed-authority", sourceUseApproved: true }] });
    assert.ok(duplicateProbe.findings.some((finding) => finding.code === "PAIR_ALREADY_GOVERNED"));
    const attempts = [];
    for (const candidate of candidates) attempts.push(check(await client.rpc("record_writing_enrichment_attempt", {
      p_key: `e1-proof:${state.tag}:${candidate.sourceFingerprint}`, p_entry: entryByWord.get(candidate.canonicalWordId), p_environment: "local",
      p_generator_version: generation.version, p_method: candidate.method, p_source_kind: candidate.sourceKind,
      p_source_fingerprint: candidate.sourceFingerprint, p_authority_references: [`${candidate.sourceKind}:${candidate.sourceId}@${candidate.sourceVersion}`],
      p_dictionary_fingerprint: inventory.identityFingerprint, p_relationship_fingerprint: inventory.relationshipFingerprint,
      p_candidate: candidate, p_findings: [], p_outcome: "candidate", p_actor: state.actor })));
    state.packageId = check(await client.rpc("create_writing_enrichment_candidate_package", { p_attempts: attempts,
      p_package_key: `e1-proof:${state.tag}`, p_environment: "local", p_actor: state.actor }));
    const storedPackage = check(await client.from("adle_word_skill_candidate_packages").select("candidates").eq("id", state.packageId).single());
    state.approvedCandidate = storedPackage.candidates[0]; state.rejectedCandidate = storedPackage.candidates[1]; state.duplicateSuppressed = true; save(state);
    console.log(JSON.stringify({ status: "fixture_ready", packageId: state.packageId,
      reviewPath: `/admin/word-skill-review?environment=local&package=${state.packageId}`, inventoryPilot: inventory.pilot.length,
      candidateCount: candidates.length, approvedExistingSourceChoiceCount: approvedSourceChoices.length,
      syntheticDisposableSources: approvedSourceChoices.length < 2, duplicateSuppressed: true, aiCalls: generation.ai.calls }));
  } else if (command === "recover") {
    const state = load();
    const snapshotIds = check(await client.from("writing_source_snapshots").select("id").eq("child_id", state.childId)).map((row) => row.id);
    if (snapshotIds.length) check(await client.from("writing_shadow_runs").update({ next_retry_at: new Date().toISOString() }).in("snapshot_id", snapshotIds).eq("status", "failed"));
    const { recoverWritingShadowRuns } = await import("../lib/writing-engine/whole-writing/worker.ts");
    const result = await recoverWritingShadowRuns(client);
    assert.equal(result.failed, 0); assert.ok(result.completed >= 1);
    console.log(JSON.stringify({ status: "recovered", ...result }));
  } else if (command === "verify-publication") {
    const state = load();
    const publication = check(await client.from("adle_word_skill_package_publications").select("release_id").eq("package_id", state.packageId).single());
    const event = check(await client.from("writing_enrichment_authority_events").select("id,event_sequence").eq("release_id", publication.release_id).eq("event_kind", "s4_publication").single());
    const status = check(await client.from("writing_enrichment_replay_status").select("*").eq("event_id", event.id).single());
    assert.equal(Number(status.target_count), 2); assert.equal(Number(status.completed_target_count), 2);
    const current = check(await client.from("writing_current_occurrence_interpretations").select("occurrence_id,authority_event_sequence,interpretation")
      .eq("canonical_word_id", state.approvedCandidate.canonicalWordId));
    assert.equal(current.length, 2); assert.ok(current.every((row) => row.interpretation.relationships.some((relationship) =>
      relationship.microSkillKey === state.approvedCandidate.microSkillKey)));
    const snapshot = check(await client.from("writing_source_snapshots").select("id").eq("submission_id", state.submissionId).single());
    const allCurrent = check(await client.from("writing_current_occurrence_interpretations").select("occurrence_id,authority_event_sequence").in("occurrence_id",
      check(await client.from("writing_occurrences").select("id").eq("snapshot_id", snapshot.id)).map((row) => row.id)));
    assert.ok(allCurrent.some((row) => Number(row.authority_event_sequence) === 0), "Unaffected occurrences disappeared from current state");
    state.releaseId = publication.release_id; state.publicationEventId = event.id; save(state);
    console.log(JSON.stringify({ status: "publication_verified", affectedOccurrences: 2, unaffectedOccurrencesPreserved: true,
      newEffectiveRelationship: true, releaseId: publication.release_id }));
  } else if (command === "verify") {
    const state = load();
    const withdrawal = check(await client.from("writing_enrichment_authority_events").select("id,event_sequence").eq("release_id", state.releaseId).eq("event_kind", "s4_withdrawal").single());
    const status = check(await client.from("writing_enrichment_replay_status").select("*").eq("event_id", withdrawal.id).single());
    assert.equal(Number(status.target_count), 2); assert.equal(Number(status.completed_target_count), 2);
    const current = check(await client.from("writing_current_occurrence_interpretations").select("interpretation,authority_event_sequence")
      .eq("canonical_word_id", state.approvedCandidate.canonicalWordId));
    assert.equal(current.length, 2); assert.ok(current.every((row) => !row.interpretation.relationships.some((relationship) =>
      relationship.microSkillKey === state.approvedCandidate.microSkillKey)));
    const review = check(await client.from("adle_word_skill_package_reviews").select("decisions").eq("package_id", state.packageId).single());
    assert.deepEqual(review.decisions, ["approved", "rejected"]);
    assert.ok(check(await client.from("adle_word_skill_pair_review_annotations").select("rejection_reason").eq("package_id", state.packageId).single()).rejection_reason);
    assert.deepEqual(await counts(), state.baseline);
    state.withdrawalEventId = withdrawal.id; state.verified = true; save(state);
    console.log(JSON.stringify({ status: "verified", approved: 1, rejected: 1, publicationReplay: true,
      automaticWithdrawalReplay: true, noLearningConsequences: true }));
  } else if (command === "reset-partial") {
    const state = load(); assert.ok(!state.packageId, "Use verified cleanup after package creation");
    check(await client.from("writing_enrichment_controls").update({ inventory_enabled: false, generation_enabled: false, replay_enabled: false }).eq("environment_key", "local"));
    check(await client.from("adle_word_skill_review_controls").update({ review_enabled: false, publication_enabled: false, withdrawal_enabled: false }).eq("environment_key", "local"));
    check(await client.auth.admin.deleteUser(state.actor));
    assert.deepEqual(await counts(), state.baseline);
    unlinkSync(FILE);
    console.log(JSON.stringify({ status: "partial_fixture_removed", protectedCountsRestored: true }));
  } else if (command === "reset-unreviewed") {
    const state = load(); assert.ok(state.packageId && !state.releaseId, "Only an unpublished package can use reset-unreviewed");
    check(await client.from("writing_enrichment_controls").update({ inventory_enabled: false, generation_enabled: false, replay_enabled: false }).eq("environment_key", "local"));
    check(await client.from("adle_word_skill_review_controls").update({ review_enabled: false, publication_enabled: false, withdrawal_enabled: false }).eq("environment_key", "local"));
    query(`begin;
      delete from writing_enrichment_attempt_packages where package_id='${state.packageId}';
      delete from writing_enrichment_attempts where created_by='${state.actor}';
      delete from writing_enrichment_inventory_occurrences where entry_id in (select e.id from writing_enrichment_inventory_entries e join writing_enrichment_inventory_runs r on r.id=e.run_id where r.created_by='${state.actor}');
      delete from writing_enrichment_inventory_entries where run_id in (select id from writing_enrichment_inventory_runs where created_by='${state.actor}');
      delete from writing_enrichment_inventory_runs where created_by='${state.actor}';
      delete from adle_word_skill_candidate_packages where id='${state.packageId}';
      commit; select true cleaned;`);
    check(await client.auth.admin.deleteUser(state.actor));
    assert.deepEqual(await counts(), state.baseline);
    unlinkSync(FILE);
    console.log(JSON.stringify({ status: "unreviewed_fixture_removed", protectedCountsRestored: true }));
  } else if (command === "abort-published") {
    const state = load(); assert.ok(state.packageId && !state.verified, "abort-published is only for a failed disposable pass");
    const publication = check(await client.from("adle_word_skill_package_publications").select("release_id").eq("package_id", state.packageId).single());
    const prior = check(await client.from("adle_reviewed_word_skill_withdrawals").select("release_id").eq("release_id", publication.release_id));
    if (!prior.length) check(await client.rpc("withdraw_word_skill_reviewed_release", { p_release: publication.release_id, p_environment: "local",
      p_actor: state.actor, p_reason: "Abort failed disposable E1 proof before fresh restart" }));
    const { recoverWritingShadowRuns } = await import("../lib/writing-engine/whole-writing/worker.ts");
    const result = await recoverWritingShadowRuns(client); assert.equal(result.failed, 0);
    assert.deepEqual(await counts(), state.baseline);
    state.releaseId = publication.release_id; state.verified = true; state.aborted = true; save(state);
    console.log(JSON.stringify({ status: "failed_pass_withdrawn", recoveryFailed: 0, protectedCountsUnchanged: true }));
  } else if (command === "cleanup") {
    const state = load(); assert.equal(state.verified, true, "Verify before cleanup");
    check(await client.from("writing_enrichment_controls").update({ inventory_enabled: false, generation_enabled: false, replay_enabled: false }).eq("environment_key", "local"));
    check(await client.from("adle_word_skill_review_controls").update({ review_enabled: false, publication_enabled: false, withdrawal_enabled: false }).eq("environment_key", "local"));
    assert.match(state.actor, /^[0-9a-f-]{36}$/); assert.match(state.packageId, /^[0-9a-f-]{36}$/);
    query(`begin;
      delete from writing_enrichment_replay_targets where event_id in (select id from writing_enrichment_authority_events where recorded_by='${state.actor}');
      delete from writing_shadow_runs where id in (select s.run_id from writing_shadow_run_enrichment_scopes s join writing_enrichment_authority_events e on e.id=s.event_id where e.recorded_by='${state.actor}');
      delete from writing_enrichment_event_progress where event_id in (select id from writing_enrichment_authority_events where recorded_by='${state.actor}');
      delete from writing_enrichment_authority_events where recorded_by='${state.actor}';
      delete from writing_enrichment_attempt_packages where package_id='${state.packageId}';
      delete from writing_enrichment_attempts where created_by='${state.actor}';
      delete from writing_enrichment_inventory_occurrences where entry_id in (select e.id from writing_enrichment_inventory_entries e join writing_enrichment_inventory_runs r on r.id=e.run_id where r.created_by='${state.actor}');
      delete from writing_enrichment_inventory_entries where run_id in (select id from writing_enrichment_inventory_runs where created_by='${state.actor}');
      delete from writing_enrichment_inventory_runs where created_by='${state.actor}';
      delete from adle_word_skill_pair_review_annotations where package_id='${state.packageId}';
      delete from adle_word_skill_review_metrics where package_id='${state.packageId}';
      delete from adle_word_skill_package_publications where package_id='${state.packageId}';
      delete from adle_word_skill_package_reviews where package_id='${state.packageId}';
      delete from adle_word_skill_candidate_packages where id='${state.packageId}';
      delete from adle_reviewed_word_skill_withdrawals where release_id='${state.releaseId}';
      delete from adle_reviewed_word_skill_pairs where release_id='${state.releaseId}';
      delete from adle_reviewed_word_skill_releases where id='${state.releaseId}';
      commit; select true cleaned;`);
    check(await client.auth.admin.deleteUser(state.actor));
    assert.deepEqual(await counts(), state.baseline);
    assert.equal(check(await client.from("adle_word_skill_candidate_packages").select("id").eq("id", state.packageId)).length, 0);
    const controls = check(await client.from("writing_enrichment_controls").select("inventory_enabled,generation_enabled,replay_enabled"));
    assert.ok(controls.every((row) => !row.inventory_enabled && !row.generation_enabled && !row.replay_enabled));
    state.cleaned = true; save(state);
    console.log(JSON.stringify({ status: "cleanup_verified", protectedCountsRestored: true, fixtureResidue: 0 }));
  } else throw new Error("Use apply, setup, recover, verify-publication, verify, reset-partial, reset-unreviewed, abort-published or cleanup");
}
