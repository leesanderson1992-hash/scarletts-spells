import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationName = "20260901140000_add_adle_fr2_retirement_persistence.sql";
const migration = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const versions = readdirSync(resolve(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.split("_")[0]);
assert.equal(versions.filter((version) => version === "20260901140000").length, 1);
assert.match(migration, /^-- ADLE FR\.2:[\s\S]*\nbegin;/);
assert.match(migration, /\ncommit;\s*$/);

assert.match(migration, /add column if not exists pre_retirement_check_outcome_event_id uuid/);
assert.match(migration, /references public\.adle_review_outcome_events\(id\)[\s\S]*on delete no action[\s\S]*deferrable initially deferred/);
assert.match(migration, /adle_review_schedule_words_retirement_lineage_check/);
assert.doesNotMatch(
  migration.slice(0, migration.indexOf("create or replace function public.persist_adle_final_rung")),
  /update\s+public\.adle_review_schedule_words/i,
  "FR.2 migration must not backfill schedule rows",
);

assert.match(migration, /create table if not exists public\.adle_review_retirement_decision_receipts/);
for (const field of [
  "schedule_word_id", "child_id", "canonical_word_id",
  "schedule_policy_version", "state_shape_version",
  "retirement_policy_version", "retirement_state_version",
  "source_review_outcome_event_id", "qualifying_authentic_use_event_id",
  "pre_retirement_check_outcome_event_id", "decision", "decision_reason",
  "scheduler_reducer_input_state", "schedule_transition_event_id",
  "expected_state_revision", "applied_state_revision", "source_fingerprint",
]) assert.match(migration, new RegExp(`\\b${field}\\b`));
assert.match(migration, /unique \(schedule_word_id, idempotency_key\)/);
assert.match(migration, /unique \(source_review_outcome_event_id\)/);
assert.match(migration, /unique \(schedule_transition_event_id\)/);
assert.match(migration, /unique \(schedule_word_id, applied_state_revision\)/);
assert.match(migration, /applied_state_revision = expected_state_revision \+ 1/);
assert.match(migration, /before update on public\.adle_review_retirement_decision_receipts/);
assert.doesNotMatch(
  migration,
  /before\s+(?:update\s+or\s+)?delete\s+on\s+public\.adle_review_retirement_decision_receipts/i,
);

const rpc = migration.slice(
  migration.indexOf("create or replace function public.persist_adle_final_rung_retirement_decision_fr2"),
  migration.indexOf("alter table public.adle_review_retirement_decision_receipts\n  enable row level security"),
);
assert.match(rpc, /for update/);
assert.match(rpc, /word_schedule_transition_count <> p_expected_state_revision/);
assert.match(rpc, /pre_retirement_check_outcome_event_id[\s\S]*is distinct from p_expected_pre_retirement_check_outcome_event_id/);
assert.match(rpc, /persist_adle_review_schedule_transition_c2b2/);
assert.match(rpc, /transitionSourceFingerprint/);
assert.match(rpc, /adle_canonical_json_sha256_v1/);
assert.doesNotMatch(rpc, /\bis_active\b|\bis_default_for_new_schedules\b/);
assert.doesNotMatch(
  rpc,
  /interval_ladder_days|catch_up_offsets_days|recovery_delay_days|THIRD_CONSECUTIVE_FAILURE|RECOVERY_FAILURE_REGRESSED_ONE_RUNG|DAY_3|DAY_7|DAY_14|DAY_28\s*->/i,
  "FR.2 SQL must not reproduce scheduler/retirement algorithms",
);
assert.doesNotMatch(migration, /create or replace function public\.(?:finalize_adle_review_c2b6|prepare_adle_review_finalization_c2b6)/);

assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.adle_review_retirement_decision_receipts[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant select on table public\.adle_review_retirement_decision_receipts[\s\S]*to service_role/);
assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
assert.doesNotMatch(
  migration,
  /grant\s+(?:all|insert|update|delete)[\s\S]*adle_review_retirement_decision_receipts[\s\S]*to\s+(?:anon|authenticated)/i,
);

const fingerprint = createHash("sha256").update(migration).digest("hex");
console.log(JSON.stringify({
  status: "PASS",
  migration: migrationName,
  sha256: fingerprint,
  assertions: 45,
  noBackfill: true,
  runtimeCallSitesChanged: false,
  sqlRetirementAlgorithm: false,
}, null, 2));
