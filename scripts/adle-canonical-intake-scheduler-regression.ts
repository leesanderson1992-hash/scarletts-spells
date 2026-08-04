import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260804234500_add_adle_canonical_intake_supabase_scheduler.sql",
  "utf8",
);
const operator = readFileSync(
  "scripts/adle-canonical-intake-staging-scheduler.ts",
  "utf8",
);
const route = readFileSync(
  "app/api/internal/adle-canonical-intake/reconcile/route.ts",
  "utf8",
);
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};

assert.match(migration, /create extension if not exists pg_cron/);
assert.match(migration, /create extension if not exists pg_net with schema extensions/);
assert.match(migration, /'\*\/5 \* \* \* \*'/);
assert.match(migration, /cron\.schedule/);
assert.match(migration, /cron\.unschedule/);
assert.match(migration, /net\.http_get/);
assert.match(migration, /vault\.decrypted_secrets/);
assert.match(migration, /'Authorization', 'Bearer ' \|\| v_cron_secret/);
assert.match(migration, /'x-vercel-protection-bypass', v_vercel_bypass_secret/);
assert.match(
  migration,
  /https:\/\/scarletts-spells-staged\.vercel\.app\/api\/internal\/adle-canonical-intake\/reconcile/,
);
assert.match(migration, /environment = 'staging'/);
assert.match(migration, /jlhotktspjvffslvuyfz/);
assert.doesNotMatch(migration, /wwohrqtunajrbwxyssjf/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all .* from public, anon, authenticated/);
assert.match(migration, /grant execute .* to service_role/);

assert.match(operator, /PRODUCTION_REF = "wwohrqtunajrbwxyssjf"/);
assert.match(operator, /STAGING_REF = "jlhotktspjvffslvuyfz"/);
assert.match(operator, /VERCEL_PROJECT_ID = "prj_oJkffstOtacc4juYloXajHpjJUha"/);
assert.match(operator, /Production Supabase is permanently rejected/);
assert.match(operator, /randomBytes\(bytes\)/);
assert.match(operator, /BYPASS_SECRET_NAME,[\s\S]*?automation bypass[\s\S]*?16,/);
assert.match(operator, /vault\.create_secret/);
assert.match(operator, /--protection-bypass-secret/);
assert.match(operator, /runVercel\([\s\S]*?"env",[\s\S]*?"CRON_SECRET"[\s\S]*?cronSecret,/);
assert.doesNotMatch(operator, /`\$\{cronSecret\}\\n`/);
assert.match(operator, /ADLE_CANONICAL_INTAKE_STAGING_SCHEDULER_CONFIRM/);
assert.doesNotMatch(operator, /console\.log\([^\n]*(cronSecret|bypassSecret)/);

assert.match(route, /process\.env\.CRON_SECRET/);
assert.match(route, /timingSafeEqual/);
assert.match(route, /runCanonicalIntakeReconciliationSweep/);
assert.doesNotMatch(
  route,
  /\.from\("daily_assignments"\)|\.from\("assignment_items"\)/,
);
assert.equal(
  vercel.crons.some(
    (entry) => entry.path === "/api/internal/adle-canonical-intake/reconcile",
  ),
  false,
);
assert.equal(
  vercel.crons.every((entry) => entry.schedule.split(" ").length === 5),
  true,
);

console.log("adle-canonical-intake-scheduler-regression: ok");
