import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  activationAllowsChild,
  allEligibleActivationReport,
  childAllowlistActivationReport,
} from "../lib/adle/route-activation-scope";

const FIRST = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const SECOND = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";

const allowlist = childAllowlistActivationReport([FIRST]);
assert(activationAllowsChild(allowlist, FIRST));
assert(!activationAllowsChild(allowlist, SECOND));

const allEligible = allEligibleActivationReport();
assert(activationAllowsChild(allEligible, FIRST));
assert(activationAllowsChild(allEligible, SECOND));
assert(!activationAllowsChild(allEligible, "not-a-child-id"));
assert(!activationAllowsChild({ ...allEligible, emergencyDisableAvailable: false }, FIRST));
assert(!activationAllowsChild({ ...allEligible, scope: { kind: "all_eligible", childIds: [] } }, FIRST));
assert(!activationAllowsChild({ ...allEligible, scope: { kind: "unknown" } }, FIRST));

const migration = readFileSync("supabase/migrations/20260812190000_enable_all_eligible_route_activation_scope.sql", "utf8");
assert(migration.includes("create or replace function public.adle_release_activation_allows_child_v2"));
assert(migration.includes("revision.activation_status = 'enabled'"));
assert(migration.includes("revision.readiness_report#>>'{scope,kind}' = 'all_eligible'"));
assert(migration.includes("revision.readiness_report->'scope' = '{\"kind\":\"all_eligible\"}'::jsonb"));
assert(migration.includes("revision.readiness_report#>>'{scope,kind}' = 'child_allowlist'"));
assert(!migration.includes("set_adle_route_activation_revision_v2("), "the migration changes capability, not activation state");
assert(!migration.includes("insert into public.daily_assignments"));
assert(!migration.includes("insert into public.adle_learning_items"));

const rollout = readFileSync("scripts/adle-compound-word-full-production-rollout.ts", "utf8");
assert(rollout.includes("set_adle_route_activation_revision_v2"), "rollout uses governed CAS activation");
assert(rollout.includes('scope: { kind: "all_eligible" }'));
assert(rollout.includes("be3c9822-9253-4ec6-b5de-85808791eb67"));
assert(rollout.includes("8ba3118d-7adb-4634-8aa4-598773a2cda3"));
assert(rollout.includes("8bcae678-a1d2-4572-a1e9-9aacb378cf9f"));
assert(!rollout.includes("insert into public.daily_assignments"), "rollout never fabricates assignments");
assert(!rollout.includes("insert into public.adle_learning_items"), "rollout never fabricates learner evidence");
assert(rollout.includes("--skill must be closed, separated, or all"), "each micro-skill can be independently revoked");

console.log("Compound Word all-eligible rollout regression passed");
