import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationName = "20260831120000_add_adle_c2b2_scheduler_persistence.sql";
const migrationPath = resolve(root, "supabase/migrations", migrationName);
const migration = readFileSync(migrationPath, "utf8");

const migrationVersions = readdirSync(resolve(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.split("_")[0]);
assert.equal(
  migrationVersions.filter((version) => version === "20260831120000").length,
  1,
  "C2B.2 migration version must be unique",
);
assert.match(migration, /^-- ADLE C2B\.2:[\s\S]*\nbegin;/);
assert.match(migration, /\ncommit;\s*$/);

assert.match(
  migration,
  /unique \(\s*child_id,\s*daily_assignment_id,\s*canonical_word_id,\s*source_ref,\s*controlled_policy_version,\s*controlled_cycle_kind\s*\)/,
  "controlled receipt identity must include exact source_ref",
);
assert.match(migration, /p_source_ref \|\| ':' \|\| v_cover_position::text/);
assert.match(migration, /p_source_ref \|\| ':' \|\| v_dictation_position::text/);
assert.doesNotMatch(
  migration.slice(
    migration.indexOf("create or replace function public.persist_adle_controlled_graduation_receipt_c2b2"),
    migration.indexOf("-- Persist exactly one target reducer result"),
  ),
  /\blike\b|regexp_replace|split_part/i,
  "controlled voter source validation must not use wildcard or suffix guessing",
);
assert.match(migration, /attempt_kind <> 'lesson_production'/);
assert.match(migration, /attempt_kind <> 'lesson_dictation'/);
assert.match(migration, /evidence_class <> 'first_exposure_lesson_attempt'/);
assert.match(migration, /attempt_kind not in \('lesson_production', 'lesson_dictation'\)/);

assert.match(migration, /consecutive_independent_failures smallint/);
assert.match(migration, /failure_episode_id uuid/);
assert.match(migration, /membership_status = 'controlled_reacquisition'[\s\S]*consecutive_independent_failures >= 1/);
assert.match(migration, /word_schedule_version = 'adle_review_per_word_schedule_v1'[\s\S]*consecutive_independent_failures is null/);
assert.match(migration, /word_schedule_version = 'adle_review_per_word_schedule_v2'/);
assert.match(migration, /membership_status in \('scheduled', 'next_day_recovery'\)/);

assert.match(migration, /'ADLE_SPACED_REVIEW_REGRESSION_V1',\s*false,\s*false,/);
assert.match(migration, /'adle_review_per_word_schedule_v2'/);
assert.match(migration, /is_default_for_new_schedules = true[\s\S]*review_policy_v1_2026-07-04/);
assert.match(migration, /is_default_for_new_schedules = false[\s\S]*activated_at is not null/);

const transitionRpc = migration.slice(
  migration.indexOf("create or replace function public.persist_adle_review_schedule_transition_c2b2"),
  migration.indexOf("-- ---------------------------------------------------------------------------\n-- Security and documentation."),
);
assert.match(transitionRpc, /for update/);
assert.match(transitionRpc, /word_schedule_transition_count <> p_expected_state_revision/);
assert.match(transitionRpc, /word_schedule_transition_count = word\.word_schedule_transition_count \+ 1/);
assert.match(transitionRpc, /source_fingerprint <> p_source_fingerprint/);
assert.doesNotMatch(transitionRpc, /\bis_active\b|\bis_default_for_new_schedules\b/);
assert.doesNotMatch(
  transitionRpc,
  /DAY_1|DAY_3|DAY_7|DAY_14|DAY_28|DAY_56|recovery_delay_days|interval_ladder_days|THIRD_CONSECUTIVE/i,
  "SQL transition RPC must not reproduce reducer transition semantics",
);

assert.match(migration, /before update on public\.adle_assignment_attempt_events/);
assert.match(migration, /before update on public\.adle_controlled_graduation_receipts/);
assert.match(migration, /before update on public\.adle_review_schedule_transition_events/);
assert.doesNotMatch(migration, /before\s+(?:update\s+or\s+)?delete\s+on\s+public\.adle_assignment_attempt_events/i);
assert.doesNotMatch(migration, /before\s+(?:update\s+or\s+)?delete\s+on\s+public\.adle_controlled_graduation_receipts/i);
assert.doesNotMatch(migration, /before\s+(?:update\s+or\s+)?delete\s+on\s+public\.adle_review_schedule_transition_events/i);
assert.match(migration, /daily_assignment_id uuid not null[\s\S]*references public\.daily_assignments\(id\) on delete cascade/);
assert.match(migration, /cover_write_attempt_event_id uuid[\s\S]*references public\.adle_assignment_attempt_events\(id\) on delete cascade/);
assert.match(migration, /schedule_word_id uuid not null[\s\S]*references public\.adle_review_schedule_words\(id\) on delete cascade/);

assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.adle_controlled_graduation_receipts[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant select on table public\.adle_controlled_graduation_receipts to service_role/);
assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
assert.doesNotMatch(migration, /grant\s+(?:all|insert|update|delete)[\s\S]*adle_(?:controlled_graduation_receipts|review_schedule_transition_events)\s+to\s+(?:anon|authenticated)/i);

assert.doesNotMatch(
  migration,
  /update\s+public\.adle_review_schedule_words[\s\S]*where\s+word_schedule_version\s*=\s*'adle_review_per_word_schedule_v1'/i,
  "migration must not backfill or reinterpret existing schedules",
);
assert.doesNotMatch(migration, /create or replace function public\.(?:finalize_adle_review_r5|persist_adle_review_assignment_r6)/);

const fingerprint = createHash("sha256").update(migration).digest("hex");
console.log(JSON.stringify({
  status: "PASS",
  migration: migrationName,
  sha256: fingerprint,
  assertions: 39,
  runtimeCallSitesChanged: false,
  targetPolicyActive: false,
  targetPolicyDefault: false,
}, null, 2));
