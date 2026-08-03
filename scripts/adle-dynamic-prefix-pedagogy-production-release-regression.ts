import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACCEPTED_MANIFEST_PATH,
  ACCEPTED_PACKAGE_SHA256,
  DEACTIVATE_CONFIRMATION,
  EXPECTED_PROFILE_COLUMNS,
  MUTATING_RELEASE_FLAG_VALUE,
  PROFILE_KEYS,
  PROFILE_MUTATION_FIELDS,
  PROTECTED_TABLES,
  PRODUCTION_RELEASE_FLAG,
  PRODUCTION_SUPABASE_REF,
  PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_VERCEL_PROJECT_NAME,
  READ_ONLY_BEGIN_SQL,
  READ_ONLY_RELEASE_FLAG_VALUE,
  RELEASE_CONFIRMATION,
  STAGING_SUPABASE_REF,
  assertExpectedProfileColumns,
  assertProductionDatabaseTarget,
  assertProductionEnvelope,
  assertProtectedSnapshotEqual,
  assessVercelFacts,
  canonical,
  loadAcceptedManifest,
  productionBatchId,
  profilePlan,
  validateManifestBytes,
  withReadOnlyTransaction,
  type ProtectedSnapshot,
  type Queryable,
} from "./adle-dynamic-prefix-pedagogy-production-release";

function expectFailure(operation: () => unknown, pattern: RegExp) {
  assert.throws(operation, pattern);
}

async function main() {
const productionUrl = `postgresql://postgres.${PRODUCTION_SUPABASE_REF}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
const stagingUrl = `postgresql://postgres.${STAGING_SUPABASE_REF}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
assert.equal(assertProductionDatabaseTarget(productionUrl), PRODUCTION_SUPABASE_REF);
expectFailure(() => assertProductionDatabaseTarget(stagingUrl), /Staging Supabase is rejected/);
expectFailure(() => assertProductionDatabaseTarget("postgresql://postgres.unknown@db.example.com/postgres"), /pinned production/);
expectFailure(() => assertProductionDatabaseTarget(undefined), /required/);

assert.doesNotThrow(() => assertProductionEnvelope({
  command: "plan",
  environment: "production",
  releaseFlag: READ_ONLY_RELEASE_FLAG_VALUE,
}));
assert.doesNotThrow(() => assertProductionEnvelope({
  command: "validate",
  environment: "production",
  releaseFlag: READ_ONLY_RELEASE_FLAG_VALUE,
}));
expectFailure(() => assertProductionEnvelope({ command: "plan", environment: "production" }), new RegExp(PRODUCTION_RELEASE_FLAG));
expectFailure(() => assertProductionEnvelope({ command: "plan", environment: "staging", releaseFlag: READ_ONLY_RELEASE_FLAG_VALUE }), /environment production/);
expectFailure(() => assertProductionEnvelope({ command: "release", environment: "production", releaseFlag: READ_ONLY_RELEASE_FLAG_VALUE, confirmation: RELEASE_CONFIRMATION }), /authorised-production-release/);
expectFailure(() => assertProductionEnvelope({ command: "release", environment: "production", releaseFlag: MUTATING_RELEASE_FLAG_VALUE }), /confirmation token/);
assert.doesNotThrow(() => assertProductionEnvelope({ command: "release", environment: "production", releaseFlag: MUTATING_RELEASE_FLAG_VALUE, confirmation: RELEASE_CONFIRMATION }));
expectFailure(() => assertProductionEnvelope({ command: "deactivate", environment: "production", releaseFlag: MUTATING_RELEASE_FLAG_VALUE, confirmation: RELEASE_CONFIRMATION }), /restore confirmation/);
assert.doesNotThrow(() => assertProductionEnvelope({ command: "deactivate", environment: "production", releaseFlag: MUTATING_RELEASE_FLAG_VALUE, confirmation: DEACTIVATE_CONFIRMATION }));

const raw = await readFile(ACCEPTED_MANIFEST_PATH);
const validated = validateManifestBytes(raw);
assert.equal(validated.packageSha256, ACCEPTED_PACKAGE_SHA256);
const drifted = Buffer.from(raw);
drifted[drifted.length - 2] = drifted[drifted.length - 2] === 0x20 ? 0x0a : 0x20;
expectFailure(() => validateManifestBytes(drifted), /Immutable package drift/);
assert.notEqual(productionBatchId(), "10a761b4-4e00-4e7b-8fc9-edc5af5a9d35", "production and staging batch IDs are distinct");
assert.equal(productionBatchId(), productionBatchId(), "production batch ID is deterministic");

assert.deepEqual(PROFILE_MUTATION_FIELDS, ["meaning_bins", "prefix_choices", "intro_content"]);
assertExpectedProfileColumns([...EXPECTED_PROFILE_COLUMNS]);
expectFailure(() => assertExpectedProfileColumns([...EXPECTED_PROFILE_COLUMNS, "unexpected_field"]), /unexpected=unexpected_field/);
expectFailure(() => assertExpectedProfileColumns(EXPECTED_PROFILE_COLUMNS.filter((field) => field !== "production_enabled")), /missing=production_enabled/);

const loaded = await loadAcceptedManifest();
const fixtureRows = loaded.manifest.profiles.map((profile, index) => ({
  ...Object.fromEntries(EXPECTED_PROFILE_COLUMNS.map((column) => [column, `${column}-${index}`])),
  id: `00000000-0000-4000-8000-00000000000${index}`,
  micro_skill_key: profile.microSkillKey,
  meaning_bins: [{ id: "legacy", label: "legacy", description: "legacy" }],
  prefix_choices: [{ text: "", label: "no prefix" }],
  intro_content: null,
  production_enabled: true,
  row_status: "active",
  review_status: "approved_for_first_exposure",
}));
const projectionPlan = profilePlan(loaded.manifest, loaded.definitions, fixtureRows);
assert.equal(projectionPlan.length, 5, "all five rollback projections are captured");
assert.deepEqual(projectionPlan.map((profile) => profile.microSkillKey), [...PROFILE_KEYS]);
for (const profile of projectionPlan) {
  assert.deepEqual(profile.changedFields, [...PROFILE_MUTATION_FIELDS]);
  assert(profile.unchangedFields.includes("production_enabled"), "activation is immutable");
  assert(profile.unchangedFields.includes("source_metadata"), "profile metadata is immutable");
  assert.match(profile.rollbackProjectionSha256, /^[a-f0-9]{64}$/);
}

const snapshot: ProtectedSnapshot = {
  "public.assignment_items": { present: true, count: 4, sha256: "a".repeat(64) },
  "auth.users": { present: true, count: 2, sha256: "b".repeat(64) },
};
assert.doesNotThrow(() => assertProtectedSnapshotEqual(snapshot, structuredClone(snapshot)));
expectFailure(() => assertProtectedSnapshotEqual(snapshot, {
  ...snapshot,
  "public.assignment_items": { present: true, count: 5, sha256: "a".repeat(64) },
}), /count\/hash drift/);
expectFailure(() => assertProtectedSnapshotEqual(snapshot, {
  ...snapshot,
  "auth.users": { present: true, count: 2, sha256: "c".repeat(64) },
}), /count\/hash drift/);
expectFailure(() => assertProtectedSnapshotEqual(snapshot, {
  ...snapshot,
  "auth.users": { present: false, count: 0, sha256: "d".repeat(64) },
}), /count\/hash drift/);

const vercelFixture = {
  project: { id: PRODUCTION_VERCEL_PROJECT_ID, name: PRODUCTION_VERCEL_PROJECT_NAME },
  deployments: [{ uid: "dpl_fixture", target: "production", readyState: "READY", meta: { githubCommitSha: "a".repeat(40) } }],
  environmentNames: ["ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED"],
  baselineGitSha: "a".repeat(40),
};
const vercel = assessVercelFacts(vercelFixture);
assert.equal(vercel.compilerModeResolution, "shadow");
expectFailure(() => assessVercelFacts({ ...vercelFixture, project: { id: "prj_unknown", name: PRODUCTION_VERCEL_PROJECT_NAME } }), /identity mismatch/);
expectFailure(() => assessVercelFacts({ ...vercelFixture, deployments: [{ ...vercelFixture.deployments[0], meta: { githubCommitSha: "b".repeat(40) } }] }), /source SHA/);
expectFailure(() => assessVercelFacts({ ...vercelFixture, environmentNames: [...vercelFixture.environmentNames, "ADLE_DYNAMIC_PREFIX_COMPILER_MODE"] }), /explicitly configured/);

const transactionQueries: string[] = [];
const transactionClient: Queryable = {
  async query<Row extends Record<string, unknown>>(text: string) {
    transactionQueries.push(text);
    return { rows: [] as Row[], rowCount: 0 };
  },
};
const result = await withReadOnlyTransaction(transactionClient, async () => "read-only-result");
assert.equal(result, "read-only-result");
assert.equal(transactionQueries[0], READ_ONLY_BEGIN_SQL);
assert.equal(transactionQueries.at(-1), "rollback");
assert(transactionQueries.every((query) => !/^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/i.test(query)), "read-only transaction issued no mutation statement");

const source = await readFile("scripts/adle-dynamic-prefix-pedagogy-production-release.ts", "utf8");
assert(source.includes("begin transaction isolation level repeatable read read only"), "plan is database-enforced read-only");
assert(source.includes("set meaning_bins=$1,prefix_choices=$2,intro_content=$3"), "release update names only the three allowed profile fields");
assert(!/update public\.canonical_teaching_dictionary_prefix_members/i.test(source), "member rows cannot be updated");
assert(!/set\s+production_enabled\s*=|,\s*production_enabled\s*=/i.test(source), "profile activation cannot be changed");
const mutationTargets = [...source.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
  .map((match) => match[1]!);
const protectedNames = new Set<string>(PROTECTED_TABLES.map(([, table]) => table));
assert.deepEqual([...new Set(mutationTargets.filter((table) => protectedNames.has(table)))], [], "no protected learner/member table has a mutation path");
const planRegion = source.slice(source.indexOf("async function planCommand"), source.indexOf("function confirmationPlanSha"));
assert(!/client\.query\(\s*[`\"']\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)/i.test(planRegion), "plan command contains no write query");
assert(source.includes("protectedSnapshotBefore"), "release receipt retains the protected baseline");
assert(source.includes("previousProfiles"), "release receipt retains the complete rollback projection");
assert(source.includes("narrow reviewed 20-item migration must be applied"), "publication blocks until the 20-item migration is present");
assert.equal(canonical(PROFILE_MUTATION_FIELDS), '["meaning_bins","prefix_choices","intro_content"]');

console.log("PASS: guarded Dynamic Prefix pedagogy production release envelope regression");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
