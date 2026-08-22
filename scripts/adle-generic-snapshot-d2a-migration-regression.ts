import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const historicalPath = path.join(root, "supabase/migrations/20260731200000_add_adle_generic_lesson_snapshot_v2.sql");
const migrationPath = path.join(root, "supabase/migrations/20260822190000_reconcile_adle_generic_snapshot_persistence_v2_v3.sql");
const persistencePath = path.join(root, "lib/adle/composable-lesson/generic-snapshot-v3-persistence.ts");
const rolloutPath = path.join(root, "lib/adle/composable-lesson/generic-snapshot-v3-registry.ts");
const productionHarnessPath = path.join(root, "scripts/apply-adle-generic-snapshot-v2-v3-production-migration.ts");
const stagingHarnessPath = path.join(root, "scripts/apply-adle-generic-snapshot-v2-v3-staging-migration.ts");

const historical = readFileSync(historicalPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");
const persistence = readFileSync(persistencePath, "utf8");
const rollout = readFileSync(rolloutPath, "utf8");
const productionHarness = readFileSync(productionHarnessPath, "utf8");
const stagingHarness = readFileSync(stagingHarnessPath, "utf8");

function functionDefinition(sql: string, functionName: string): string {
  const marker = `create or replace function public.${functionName}(`;
  const start = sql.indexOf(marker);
  assert(start >= 0, `${functionName} must exist`);
  const bodyStart = sql.indexOf("as $$", start);
  assert(bodyStart >= 0, `${functionName} must have a dollar-quoted body`);
  const end = sql.indexOf("$$;", bodyStart);
  assert(end >= 0, `${functionName} must terminate its body`);
  return sql
    .slice(start, end + 3)
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

assert.equal(
  functionDefinition(migration, "adle_generic_lesson_snapshot_is_structurally_valid_v2"),
  functionDefinition(historical, "adle_generic_lesson_snapshot_is_structurally_valid_v2"),
  "the historical v2 structural validator definition must be preserved",
);
assert.equal(
  functionDefinition(migration, "persist_adle_generic_daily_plan_v2"),
  functionDefinition(historical, "persist_adle_generic_daily_plan_v2"),
  "the historical v2 RPC definition must be preserved",
);

assert.match(migration, /if v_column_exists then/);
assert.match(migration, /elsif v_v2_validator_exists[\s\S]+or v_v2_rpc_exists/);
assert.match(migration, /add column if not exists compiled_lesson_snapshot jsonb/);
assert.doesNotMatch(migration, /update\s+public\.daily_assignments\s+set\s+compiled_lesson_snapshot/i, "no snapshot backfill is permitted");
assert.match(migration, /case p_snapshot->>'snapshotSchemaVersion'[\s\S]+when '2'/);
assert.match(migration, /when '3'/);
assert.match(migration, /persist_adle_generic_daily_plan_v3/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /is distinct from p_snapshot#>>'\{provenance,sourceFingerprint\}'/);
assert.match(migration, /revoke all on function public\.persist_adle_generic_daily_plan_v3/);
assert.match(migration, /grant execute on function public\.persist_adle_generic_daily_plan_v3[\s\S]*to service_role/);

for (const pedagogicalIdentity of [
  "INTRODUCTION",
  "MEANING_MATCH",
  "COVER_CHECK",
  "DICTATION",
  "LESSON_REFLECTION",
  "PHONEME_GRAPHEME",
]) {
  assert(!migration.includes(pedagogicalIdentity), `${pedagogicalIdentity} must remain application-owned`);
}
assert.doesNotMatch(migration, /v_activity\s*#>>\s*'\{payload,/i, "SQL must not interpret activity payload fields");
for (const implementationIdentity of [
  /commit(?:Sha|Hash)?/i,
  /build(?:Id|Number|Sha|Hash)/i,
  /deployment(?:Id|Sha|Hash)/i,
  /git(?:Sha|Commit|Ref|Branch)/i,
  /source(?:File|Code)(?:Sha|Hash)/i,
]) {
  assert.doesNotMatch(
    functionDefinition(migration, "adle_generic_lesson_snapshot_is_structurally_valid_v3"),
    implementationIdentity,
    "the SQL validator must not depend on commit, build, deployment, branch, or implementation identities",
  );
}

assert.match(persistence, /validateCompiledGenericLessonSnapshotV3\(input\.snapshot/);
assert.match(persistence, /persist_adle_generic_daily_plan_v3/);
assert.match(persistence, /export function persistGuardedGenericSnapshotV3ToSupabase/);
assert.match(rollout, /GENERIC_SNAPSHOT_V3_WRITER_ENABLED\s*=\s*false/);

assert.match(productionHarness, /wwohrqtunajrbwxyssjf/);
assert.match(productionHarness, /--dry-run/);
assert.match(productionHarness, /D2A_PRODUCTION_SNAPSHOT_BASELINE_APPROVAL/);
assert.match(productionHarness, /supabase@2\.115\.0/);
assert.match(productionHarness, /--merged-sha/);
assert.match(productionHarness, /--migration-sha256/);
assert.match(productionHarness, /SCHEMA-ONLY-NO-BACKFILL-NO-WRITER-ENABLEMENT/);
assert.match(productionHarness, /const VERSION = "20260822190000"/);
assert.match(productionHarness, /const NAME = "reconcile_adle_generic_snapshot_persistence_v2_v3"/);
assert.doesNotMatch(productionHarness, /db\s+reset/);

assert.match(stagingHarness, /jlhotktspjvffslvuyfz/);
assert.match(stagingHarness, /wwohrqtunajrbwxyssjf/);
assert.match(stagingHarness, /--dry-run/);
assert.match(stagingHarness, /supabase@2\.115\.0/);
assert.match(stagingHarness, /--merged-sha/);
assert.match(stagingHarness, /--migration-sha256/);
assert.match(stagingHarness, /SCHEMA-ONLY-NO-BACKFILL-NO-WRITER-ENABLEMENT/);
assert.match(stagingHarness, /const VERSION = "20260822190000"/);
assert.match(stagingHarness, /begin read only/i);
assert.doesNotMatch(stagingHarness, /db\s+reset/);

console.log("PASS: D2A dual-topology migration, v2 semantic parity, application/SQL validation boundary, service-role grants, default-off rollout, and guarded Production harness");
