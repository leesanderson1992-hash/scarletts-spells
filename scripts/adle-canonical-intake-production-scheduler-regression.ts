import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260805070000_add_adle_canonical_intake_production_scheduler.sql",
  "utf8",
);
const operator = readFileSync(
  "scripts/adle-canonical-intake-production-scheduler.ts",
  "utf8",
);
const stagingMigration = readFileSync(
  "supabase/migrations/20260804234500_add_adle_canonical_intake_supabase_scheduler.sql",
  "utf8",
);
const route = readFileSync(
  "app/api/internal/adle-canonical-intake/reconcile/route.ts",
  "utf8",
);

assert.match(migration, /create extension if not exists pg_cron/);
assert.match(migration, /create extension if not exists pg_net with schema extensions/);
assert.match(migration, /production_supabase_cron_v1/);
assert.match(migration, /environment = 'production'/);
assert.match(
  migration,
  /https:\/\/scarletts-spells\.vercel\.app\/api\/internal\/adle-canonical-intake\/reconcile/,
);
assert.match(migration, /adle-canonical-intake-production-safety-sweep-v1/);
assert.match(migration, /'\*\/5 \* \* \* \*'/);
assert.match(migration, /adle_canonical_intake_production_cron_secret/);
assert.match(migration, /wwohrqtunajrbwxyssjf/);
assert.doesNotMatch(migration, /jlhotktspjvffslvuyfz/);
assert.doesNotMatch(migration, /scarletts-spells-staged/);
assert.doesNotMatch(migration, /x-vercel-protection-bypass/);
assert.match(migration, /cron\.schedule/);
assert.match(migration, /cron\.unschedule/);
assert.match(migration, /net\.http_get/);
assert.match(migration, /vault\.decrypted_secrets/);
assert.match(migration, /'Authorization', 'Bearer ' \|\| v_cron_secret/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all .* from public, anon, authenticated/);
assert.match(migration, /grant execute .* to service_role/);

assert.match(stagingMigration, /staging_supabase_cron_v1/);
assert.doesNotMatch(stagingMigration, /production_supabase_cron_v1/);

assert.match(operator, /PRODUCTION_REF = "wwohrqtunajrbwxyssjf"/);
assert.match(operator, /STAGING_REF = "jlhotktspjvffslvuyfz"/);
assert.match(operator, /VERCEL_PROJECT_ID = "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl"/);
assert.match(operator, /VERCEL_PROJECT_NAME = "scarletts-spells"/);
assert.match(operator, /Staging Supabase is permanently rejected/);
assert.match(operator, /ADLE_CANONICAL_INTAKE_VERCEL_LINK_DIR is required/);
assert.match(operator, /randomBytes\(32\)/);
assert.match(operator, /vault\.create_secret/);
assert.match(operator, /"CRON_SECRET"[\s\S]*?cronSecret/);
assert.match(operator, /ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM/);
assert.doesNotMatch(operator, /console\.log\([^\n]*cronSecret/);
assert.doesNotMatch(operator, /--protection-bypass/);

assert.match(route, /process\.env\.CRON_SECRET/);
assert.match(route, /timingSafeEqual/);
assert.match(route, /runCanonicalIntakeReconciliationSweep/);
assert.doesNotMatch(
  route,
  /\.from\("daily_assignments"\)|\.from\("assignment_items"\)/,
);

console.log("adle-canonical-intake-production-scheduler-regression: ok");
