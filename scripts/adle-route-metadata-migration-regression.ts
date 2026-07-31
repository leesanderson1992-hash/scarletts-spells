import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260731120000_add_adle_lesson_route_metadata.sql",
  "utf8",
);
const stagingHarness = readFileSync(
  "scripts/apply-adle-route-metadata-staging-migration.ts",
  "utf8",
);

assert(migration.includes("add column lesson_route_metadata jsonb null"));
assert(!migration.includes("lesson_route_metadata jsonb not null"));
assert(!migration.includes("default '{}'"));
assert(!/\bupdate\s+public[.]daily_assignments\s+set\s+lesson_route_metadata/i.test(migration));
assert(migration.includes("daily_assignments_lesson_route_metadata_v1_check"));
assert(migration.includes("daily_assignments_lesson_route_version_idx"));
assert(migration.includes("daily_assignments_lesson_route_metadata_immutable"));
assert(migration.includes("old.lesson_route_metadata is distinct from new.lesson_route_metadata"));
assert(migration.includes("persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)"));
assert(migration.includes("persist_adle_base_word_family_pilot_v2"));
assert(migration.includes("persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)"));
assert(migration.includes("to service_role"));
assert(!migration.match(/\bdelete\s+from\b/i));
assert(!migration.match(/\bdrop\s+column\b/i));
assert(
  stagingHarness.includes('const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz"') &&
    stagingHarness.includes(
      'const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf"',
    ),
  "the staging migration harness names the verified staging and rejected production projects",
);
assert(
  stagingHarness.indexOf("requiredDatabaseUrl()") <
    stagingHarness.indexOf("await client.connect()"),
  "project identity validation runs before the staging migration opens a database connection",
);
assert(
  stagingHarness.includes('"--dry-run"') &&
    stagingHarness.includes("Unexpected migration selected"),
  "the staging harness proves that only the reviewed migration is selected",
);

console.log("ADLE route metadata migration regression passed.");
