import { readFileSync } from "node:fs";
import { equal, match, ok } from "node:assert/strict";

import {
  genericSnapshotMode,
  genericSnapshotWritesEnabled,
} from "../lib/adle/composable-lesson/generic-snapshot-mode";

const migrationPath =
  "supabase/migrations/20260731200000_add_adle_generic_lesson_snapshot_v2.sql";
const migration = readFileSync(migrationPath, "utf8");
const writer = readFileSync("lib/adle/loaders/daily-plan-surface.ts", "utf8");
const stagingHarness = readFileSync("scripts/apply-adle-generic-snapshot-staging-migration.ts", "utf8");
const proofHarness = readFileSync("scripts/adle-generic-snapshot-staging-proof.ts", "utf8");

match(migration, /add column compiled_lesson_snapshot jsonb null/);
match(migration, /daily_assignments_compiled_lesson_snapshot_v2_check/);
match(migration, /adle_generic_lesson_snapshot_is_structurally_valid_v2/);
match(migration, /daily_assignments_compiled_lesson_snapshot_immutable/);
match(migration, /old\.compiled_lesson_snapshot is distinct from new\.compiled_lesson_snapshot/);
match(migration, /daily_assignments_compiled_snapshot_version_idx/);
match(migration, /where compiled_lesson_snapshot is not null/);
ok(!/\bupdate\s+public[.]daily_assignments\s+set\s+compiled_lesson_snapshot/i.test(migration), "migration has no backfill");
ok(!/compiled_lesson_snapshot\s+jsonb\s+not\s+null/i.test(migration), "historical snapshots stay nullable");
ok(!/using\s+gin/i.test(migration), "migration avoids an unnecessary GIN index");

match(migration, /persist_adle_generic_daily_plan_v2\s*\(/);
match(migration, /jsonb_array_length\(p_snapshot->'activities'\) <> jsonb_array_length\(p_items\)/);
match(migration, /snapshot and item bindings disagree/);
match(migration, /pg_advisory_xact_lock/);
match(migration, /compiled_lesson_snapshot\s*\n\s*\) values/);
match(migration, /grant execute on function public\.persist_adle_generic_daily_plan_v2[\s\S]*to service_role/);
ok(!/grant execute on function public\.persist_adle_generic_daily_plan_v2[\s\S]{0,200}to authenticated/.test(migration), "generic writer is never granted to authenticated");
ok(!migration.includes("create or replace function public.persist_adle_composed_daily_plan_v1"), "rich persistence RPC is unchanged");

match(writer, /compileGenericLessonSnapshot/);
match(writer, /persist_adle_generic_daily_plan_v2/);
match(writer, /p_snapshot: compiled\.snapshot/);
match(writer, /generic plans require the snapshot-aware ensure path/);
match(writer, /compiled_lesson_snapshot, assignment_generation_source|assignment_generation_source, compiled_lesson_snapshot/);
match(writer, /source_entity_id/);

equal(genericSnapshotMode(undefined), "off");
equal(genericSnapshotMode("bad"), "off");
equal(genericSnapshotMode("observe"), "observe");
equal(genericSnapshotMode("enforce"), "enforce");
equal(genericSnapshotWritesEnabled("off"), false);
equal(genericSnapshotWritesEnabled("observe"), true);
equal(genericSnapshotWritesEnabled("enforce"), true);

match(stagingHarness, /const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz"/);
match(stagingHarness, /const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf"/);
match(stagingHarness, /--environment staging/);
match(stagingHarness, /--confirm-generic-snapshot-migration/);
match(stagingHarness, /production and unknown targets are rejected/);
ok(!stagingHarness.includes("SAND8624erson"), "staging harness contains no credential literal");

match(proofHarness, /const STAGING_REF = "jlhotktspjvffslvuyfz"/);
match(proofHarness, /const PRODUCTION_REF = "wwohrqtunajrbwxyssjf"/);
match(proofHarness, /const STAGING_POOLER = "aws-1-eu-central-1\.pooler\.supabase\.com"/);
match(proofHarness, /ADLE-GENERIC-SNAPSHOT-STAGING-FIXTURE-V2/);
match(proofHarness, /persist_adle_generic_daily_plan_v2/);
match(proofHarness, /compiled_lesson_snapshot/);
match(proofHarness, /exactFixtureResidue: 0/);
ok(!proofHarness.includes("SAND8624erson"), "proof harness contains no credential literal");

console.log("ADLE generic snapshot migration regression passed.");
