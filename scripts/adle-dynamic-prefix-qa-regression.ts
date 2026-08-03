import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveAdlePlanDateOverride } from "../lib/adle/session-date-override";
import { DYNAMIC_PREFIX_QA_PROFILES } from "../lib/adle/morphology/dynamic-prefix-qa-catalog";
import {
  DYNAMIC_PREFIX_QA_PATH,
  DYNAMIC_PREFIX_QA_PRODUCTION_SUPABASE_REF,
  DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT,
  DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT_ID,
  DYNAMIC_PREFIX_QA_STAGING_SUPABASE_REF,
  DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT,
  DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT_ID,
  DYNAMIC_PREFIX_QA_STAGING_VERCEL_PRODUCTION_URL,
  isDynamicPrefixQaUserAuthorized,
  isPinnedDynamicPrefixQaEnvironment,
} from "../lib/adle/morphology/dynamic-prefix-qa-policy";

const staging = {
  ADLE_DYNAMIC_PREFIX_QA_ENABLED: "enabled",
  ADLE_ROUTE_ACTIVATION_ENVIRONMENT: "staging",
  ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_ID: DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT_ID,
  ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_NAME: DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT,
  VERCEL_PROJECT_PRODUCTION_URL: DYNAMIC_PREFIX_QA_STAGING_VERCEL_PRODUCTION_URL,
  NEXT_PUBLIC_SUPABASE_URL: `https://${DYNAMIC_PREFIX_QA_STAGING_SUPABASE_REF}.supabase.co`,
};
assert.equal(isPinnedDynamicPrefixQaEnvironment(staging), true, "exact staging identities pass");
assert.equal(isPinnedDynamicPrefixQaEnvironment({ ...staging, ADLE_DYNAMIC_PREFIX_QA_ENABLED: "disabled" }), false);
assert.equal(isPinnedDynamicPrefixQaEnvironment({ ...staging, ADLE_ROUTE_ACTIVATION_ENVIRONMENT: "production" }), false);
assert.equal(isPinnedDynamicPrefixQaEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_URL: `https://${DYNAMIC_PREFIX_QA_PRODUCTION_SUPABASE_REF}.supabase.co` }), false, "production Supabase rejected");
assert.equal(isPinnedDynamicPrefixQaEnvironment({ ...staging, ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_ID: DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT_ID, ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_NAME: DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT }), false, "production Vercel rejected");
assert.equal(isPinnedDynamicPrefixQaEnvironment({ ...staging, ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_ID: "unknown" }), false, "unknown Vercel rejected");
assert.equal(isDynamicPrefixQaUserAuthorized({ userId: "admin", isAdmin: true, qaUserIds: undefined }), true);
assert.equal(isDynamicPrefixQaUserAuthorized({ userId: "qa", isAdmin: false, qaUserIds: "first,qa" }), true);
assert.equal(isDynamicPrefixQaUserAuthorized({ userId: "other", isAdmin: false, qaUserIds: "qa" }), false);
assert.equal(resolveAdlePlanDateOverride({ requestedDate: "2026-08-08", fallbackDate: "2026-08-02", isAdmin: false, isStagingQa: true }), "2026-08-08");
assert.equal(resolveAdlePlanDateOverride({ requestedDate: "2026-08-08", fallbackDate: "2026-08-02", isAdmin: false, isStagingQa: false }), null);
assert.equal(DYNAMIC_PREFIX_QA_PATH, "/admin/adle-dynamic-prefix-qa");
assert.deepEqual(DYNAMIC_PREFIX_QA_PROFILES.map((profile) => profile.expectedItemCount), [16, 16, 20, 16, 18]);
assert.equal(DYNAMIC_PREFIX_QA_PROFILES[2]?.meaningEvidenceLabel, "Prefix Form Sort (equivalent)");

const writer = readFileSync("lib/adle/morphology/dynamic-prefix-assignment-writer.ts", "utf8");
const actions = readFileSync("app/admin/adle-dynamic-prefix-qa/actions.ts", "utf8");
const page = readFileSync("app/admin/adle-dynamic-prefix-qa/page.tsx", "utf8");
const launcher = readFileSync("app/admin/adle-dynamic-prefix-qa/launcher.tsx", "utf8");
const access = readFileSync("lib/adle/morphology/dynamic-prefix-qa-access.ts", "utf8");
const layout = readFileSync("app/admin/layout.tsx", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");

for (const boundary of [
  "loadDynamicPrefixProfiles",
  "selectDynamicPrefixWordLab",
  "compileDynamicPrefixWordLabDecision",
  "buildDynamicPrefixAssignmentPlan",
  "persistComposedAdleDailyPlan",
]) assert(writer.includes(boundary), `normal writer boundary includes ${boundary}`);
assert(writer.includes("getExistingAdleSessionPlanId") && writer.includes('? "existing"') && writer.includes(': "conflict"'), "duplicate/conflict guard is before persistence");
assert(actions.includes("DYNAMIC_PREFIX_QA_PROFILE_ORDER") && actions.includes("sequence preflight") === false);
assert(actions.indexOf("const blockers") < actions.indexOf("persistPreparedDynamicPrefixAssignment({", actions.indexOf("const blockers")), "all-five preflight precedes sequence persistence");
assert(access.includes("isPinnedDynamicPrefixQaEnvironment") && access.includes("notFound()") && access.includes("redirect(\"/login\")"));
assert(layout.includes("x-scarletts-pathname") && proxy.includes("x-scarletts-pathname"));
for (const source of [page, launcher]) {
  assert(!source.includes("compileDynamicPrefix"), "launcher UI never compiles a payload");
  assert(!source.includes("DynamicPrefixStagingLab"), "launcher UI has no duplicate renderer");
  assert(!source.includes("dynamicPrefixLesson"), "launcher UI never constructs a Prefix payload");
}
assert(launcher.includes("/learn/week/adle") === false, "child lesson links are returned by the server action");
assert(actions.includes('buildScopedPath("/learn/week/adle"') && actions.includes("adleDate="), "normal child-session link is used");

console.log("PASS: staging-only Dynamic Prefix QA launcher policy, normal-writer boundary, duplicate safeguards, all-five preflight, and learner links");
