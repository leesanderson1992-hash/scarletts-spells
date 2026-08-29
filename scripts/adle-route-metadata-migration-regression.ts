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
const validatorCorrection = readFileSync(
  "supabase/migrations/20260731123000_fix_adle_route_metadata_structural_validator.sql",
  "utf8",
);
const validatorGrant = readFileSync(
  "supabase/migrations/20260731124500_grant_adle_route_metadata_validator.sql",
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
assert(!migration.includes("jsonb_object_length"));
assert(!validatorCorrection.includes("jsonb_object_length"));
assert(
  migration.includes("jsonb_object_keys") &&
    validatorCorrection.includes("jsonb_object_keys"),
  "both fresh and forward-correction migrations use PostgreSQL's supported object-key API",
);
assert(
  migration.includes(
    "to authenticated, service_role;",
  ) &&
    validatorGrant.includes(
      "to authenticated, service_role;",
    ) &&
    !validatorGrant.match(/\b(insert|update|delete)\s+(into|public[.])?/i),
  "fresh and forward migrations grant only validator execution needed by authenticated assignment updates",
);
assert(
  !stagingHarness.includes('from "pg"') &&
    !stagingHarness.includes("STAGING_PROJECT_REF") &&
    !stagingHarness.includes("PRODUCTION_PROJECT_REF"),
  "the retired staging harness retains no database client or project target",
);
assert(
  stagingHarness.includes("throw new Error(RETIRED_OPERATIONAL_ENTRYPOINT)"),
  "the retired staging harness has no database execution path",
);
assert(
  stagingHarness.includes("requires removed legacy persistence RPCs"),
  "the staging harness explains why it can no longer masquerade as a current release path",
);

console.log("ADLE route metadata migration regression passed.");
