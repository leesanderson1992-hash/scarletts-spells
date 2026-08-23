import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260823170000_add_compound_specialist_snapshot_v3.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /create or replace function public\.adle_specialist_lesson_snapshot_is_structurally_valid_v3/);
assert.match(migration, /create or replace function public\.adle_lesson_snapshot_is_structurally_valid/);
assert.match(migration, /when 'generic_composer' then public\.adle_generic_lesson_snapshot_is_structurally_valid_v3/);
assert.match(migration, /when 'compound_word_lab' then public\.adle_specialist_lesson_snapshot_is_structurally_valid_v3/);
assert.doesNotMatch(migration, /create or replace function public\.adle_generic_lesson_snapshot_is_structurally_valid_v3\s*\(/, "generic v3 validator is not redefined");
assert.doesNotMatch(migration, /create or replace function public\.adle_generic_lesson_snapshot_is_structurally_valid\s*\(/, "generic version dispatcher is not redefined");
assert.doesNotMatch(migration, /create or replace function public\.persist_adle_generic_daily_plan_v[23]/, "generic persistence RPCs are unchanged");
assert.match(migration, /create or replace function public\.persist_adle_specialist_daily_plan_v3/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /compiled_lesson_snapshot/);
assert.match(migration, /count\(\*\) <> 18/);
assert.match(migration, /count\(distinct binding\.value->>'sourceEntityId'\)/);
assert.match(migration, /ADLE specialist v3 plan idempotency conflict/);
assert.match(migration, /revoke all on function public\.persist_adle_specialist_daily_plan_v3[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.persist_adle_specialist_daily_plan_v3[\s\S]*to service_role/);
assert.match(migration, /daily_assignments_compiled_lesson_snapshot_versioned_check[\s\S]*public\.adle_lesson_snapshot_is_structurally_valid/);
assert.doesNotMatch(migration, /alter table public\.daily_assignments\s+add column/);
assert.doesNotMatch(migration, /update public\.daily_assignments|delete from public\.daily_assignments/);

console.log("Specialist Snapshot v3 migration regression passed.");
