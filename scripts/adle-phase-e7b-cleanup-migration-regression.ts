import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20260829133000_retire_verified_adle_legacy_database_functions.sql";
const restorationPath = "scripts/sql/adle-phase-e7b-forward-restoration.sql";
const receiptPath = "scripts/fixtures/adle-phase-e7b-restoration-receipt.json";
const migration = readFileSync(migrationPath, "utf8");
const restoration = readFileSync(restorationPath, "utf8");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
  transactionReadOnly: boolean;
  mutationPerformed: boolean;
  capturedFunctions: Array<{ signature: string; definitionSha256: string }>;
  aggregateValidator: { signature: string; definitionSha256: string };
};

const retired = [
  "public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)",
  "public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)",
  "public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)",
  "public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)",
  "public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)",
  "public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)",
  "public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)",
] as const;

assert.match(migration, /^begin;/);
assert.match(migration, /set local lock_timeout = '5s'/);
assert.match(migration, /set local statement_timeout = '120s'/);
assert.match(migration, /v_prior_migration_count <> 109/);
assert.match(migration, /generic snapshot-v2 rows exist/);
assert.match(migration, /fixed-un-v1 markers exist/);
assert.match(migration, /closed-compound-v1 markers exist/);
assert.equal((migration.match(/^drop function /gm) ?? []).length, 7, "exactly seven functions are dropped");
for (const signature of retired) {
  assert(migration.includes(`drop function ${signature};`), `missing exact drop: ${signature}`);
  assert(restoration.includes(signature), `restoration omits: ${signature}`);
}
assert.doesNotMatch(migration, /\bcascade\b/i);
assert.doesNotMatch(migration, /\bdrop\s+(table|column)\b|\balter\s+table\b[^;]*\bdrop\b/i);
assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b[\s\S]{0,40}\b(daily_assignments|assignment_items|children|adle_learning_items|child_word_treasures)\b/i);

const aggregateStart = migration.indexOf("create or replace function public.adle_lesson_snapshot_is_structurally_valid(");
const aggregateEnd = migration.indexOf("\ndrop function ", aggregateStart);
assert(aggregateStart >= 0 && aggregateEnd > aggregateStart, "aggregate validator replacement is present");
const aggregate = migration.slice(aggregateStart, aggregateEnd);
assert.match(aggregate, /when '3' then/);
assert.doesNotMatch(aggregate, /when '2' then|structurally_valid_v2/);
assert.match(migration, /validate constraint daily_assignments_compiled_lesson_snapshot_versioned_check/);

for (const authority of [
  "persist_adle_generic_daily_plan_v3",
  "persist_adle_specialist_daily_plan_v3",
  "complete_adle_base_word_family_pilot_v1",
  "complete_adle_base_word_family_pilot_v2",
  "complete_adle_release_bound_word_lab_v2",
  "adle_lesson_route_metadata_is_valid_v1",
  "adle_lesson_route_metadata_is_valid_v2",
  "materialize_resolved_stage_f_spelling_occurrence_source",
  "adle_authorize_parent_approval_exact_id_handoff",
  "adle_reconcile_parent_spelling_decision_r8d",
  "materialize_r8e_stage_f_historical_occurrence_source",
  "adle_authorize_governed_source_continuation",
  "finalize_adle_review_r5",
  "transition_adle_review_writing_r6",
  "finalize_adle_review_stage_r6",
  "persist_adle_review_assignment_r6",
  "adle-canonical-intake-production-safety-sweep-v1",
  "word_schedule_version",
  "adle_review_schedule_words_word_authority_check",
  "set_child_word_treasures_updated_at",
  "set_child_word_treasure_evidence_candidates_updated_at",
]) {
  assert(migration.includes(authority), `protected authority assertion missing: ${authority}`);
}
for (const relation of [
  "public.daily_assignments",
  "public.assignment_items",
  "public.adle_review_schedule_words",
  "public.adle_review_bundles",
  "public.adle_learning_items",
  "public.adle_taught_word_history",
  "public.adle_authentic_use_events",
  "public.adle_assignment_attempt_events",
  "public.learning_item_evidence",
  "public.adle_review_sessions",
  "public.adle_review_word_encounters",
  "public.adle_review_repair_attempts",
  "public.adle_review_outcome_events",
  "public.adle_review_memory_cue_versions",
  "public.adle_review_completion_receipts",
  "public.child_word_treasures",
  "public.child_word_treasure_events",
  "public.child_word_treasure_evidence_candidates",
  "public.child_gold_coin_ledger_events",
  "public.spelling_reward_events",
  "public.spelling_reward_states",
]) {
  assert(migration.includes(`'${relation}'`), `shared/protected relation assertion missing: ${relation}`);
}

assert.equal(receipt.transactionReadOnly, true);
assert.equal(receipt.mutationPerformed, false);
assert.deepEqual(receipt.capturedFunctions.map((row) => row.signature), [...retired]);
for (const captured of [...receipt.capturedFunctions, receipt.aggregateValidator]) {
  assert.match(captured.definitionSha256, /^[a-f0-9]{64}$/);
  assert(migration.includes(captured.definitionSha256), `cleanup preflight omits captured hash: ${captured.signature}`);
  assert(restoration.includes(captured.definitionSha256), `restoration postflight omits captured hash: ${captured.signature}`);
}
assert.match(restoration, /^-- Generated from the final Production pg_get_functiondef receipt/);
assert.match(restoration, /^begin;/m);
assert.match(restoration, /^commit;$/m);
assert.doesNotMatch(restoration, /\bcascade\b/i);

console.log("PASS: Phase E7B cleanup is fail-closed, exactly scoped, v3-only, reversible, and preserves protected authorities");
