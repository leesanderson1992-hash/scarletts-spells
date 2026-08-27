import { readFileSync } from "node:fs";
import { equal, match, ok } from "node:assert/strict";

import { genericSnapshotMode } from "../lib/adle/composable-lesson/generic-snapshot-mode";

const migrationPath =
  "supabase/migrations/20260731200000_add_adle_generic_lesson_snapshot_v2.sql";
const migration = readFileSync(migrationPath, "utf8");
const reader = readFileSync("lib/adle/loaders/daily-plan-surface.ts", "utf8");
const snapshotCapability = readFileSync("lib/adle/loaders/daily-plan-snapshot-capability.ts", "utf8");

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

match(reader, /resolveGenericLessonSnapshot/);
match(reader, /dailyPlanHeaderProjection\(snapshotCapability\)/);
match(snapshotCapability, /lesson_route_metadata, assignment_generation_source/);
match(snapshotCapability, /compiled_lesson_snapshot/);
match(reader, /source_entity_id/);

equal(genericSnapshotMode(undefined), "off");
equal(genericSnapshotMode("bad"), "off");
equal(genericSnapshotMode("observe"), "observe");
equal(genericSnapshotMode("enforce"), "enforce");
console.log("ADLE historical generic snapshot migration/read compatibility regression passed.");
