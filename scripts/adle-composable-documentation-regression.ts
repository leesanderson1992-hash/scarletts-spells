import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const architecture = readFileSync(
  "docs/architecture/adle-activity-platform-architecture.md",
  "utf8",
);
const authority = readFileSync(
  "docs/implementation/adle-7-ui-document-authority-map.md",
  "utf8",
);
const template = readFileSync(
  "docs/contracts/adle-template-development-contract.md",
  "utf8",
);
const teaching = readFileSync(
  "docs/contracts/adle-teaching-content-authoring-contract.md",
  "utf8",
);
const decisionRegister = readFileSync(
  "docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-decision-register.csv",
  "utf8",
);
const routeMetadata = readFileSync(
  "docs/generated/adle-composable-lesson/route-metadata-contract.json",
  "utf8",
);
const sharedAffix = readFileSync(
  "docs/contracts/adle-shared-affix-compiler-contract.md",
  "utf8",
);
const affixProfiles = readFileSync(
  "docs/contracts/adle-affix-profile-development-contract.md",
  "utf8",
);
const sharedAffixInventory = readFileSync(
  "docs/generated/adle-composable-lesson/shared-affix-profiles.json",
  "utf8",
);
const sharedAffixReceipt = readFileSync(
  "docs/implementation/qa/adle-shared-affix-staging-proof-2026-08-01.json",
  "utf8",
);
const sharedCompiler = readFileSync(
  "lib/adle/morphology/shared-affix-compiler.ts",
  "utf8",
);
const prefixWriter = readFileSync(
  "lib/adle/morphology/dynamic-prefix-assignment-writer.ts",
  "utf8",
);
const prefixRouteAction = readFileSync(
  "app/learn/week/adle/dynamic-prefix/actions.ts",
  "utf8",
);
const affixWriter = readFileSync(
  "lib/adle/morphology/dynamic-affix-assignment-writer.ts",
  "utf8",
);
const affixRouteAction = readFileSync(
  "app/learn/week/adle/dynamic-suffix/actions.ts",
  "utf8",
);
const migrationTracker = readFileSync(
  "docs/implementation/adle-composable-lesson-migration-tracker.md",
  "utf8",
);
const productionChecklist = readFileSync(
  "docs/implementation/qa/adle-dynamic-prefix-shared-compiler-production-rollout-checklist.md",
  "utf8",
);
const prefixVisualQa = readFileSync(
  "docs/implementation/qa/adle-dynamic-prefix-child-visual-qa-checklist.md",
  "utf8",
);
const releaseRegistry = readFileSync(
  "docs/implementation/adle-current-state-and-release-registry.md",
  "utf8",
);
const observationLedger = readFileSync(
  "docs/implementation/qa/adle-microskill-production-observation-ledger.md",
  "utf8",
);

for (const source of [architecture, authority, template, teaching]) {
  assert(
    source.includes("activity-requirements") ||
      source.includes("activity requirements"),
    "authoritative documentation links the machine-readable activity requirements",
  );
}
assert(
  architecture.includes("repository/report") &&
    architecture.includes("live/strict") &&
    architecture.includes("daily_assignments.lesson_route_metadata") &&
    architecture.includes("absent metadata") &&
    architecture.includes("never") &&
    architecture.includes("falls back"),
);
assert(
  sharedAffix.includes("shared writer authority is active in production") &&
    sharedAffix.includes("under seven-day natural observation") &&
    sharedAffix.includes("adle_dynamic_prefix_un_profile_staging_v1_2026_08_02") &&
    sharedAffix.includes("all-ten-profile guarded compiler boundary") &&
    sharedAffix.includes("ADLE_DYNAMIC_AFFIX_COMPILER_MODE") &&
    sharedAffix.includes("invalid non-empty value fails closed") &&
    sharedAffix.includes("microskill-key branch") &&
    sharedAffix.includes("no catch-and-call-legacy path"),
);
assert(
  affixProfiles.includes("inventory, not an activation switch") &&
    affixProfiles.includes("never gain a microskill literal") &&
    affixProfiles.includes("They do not define a fixed production transfer roster") &&
    affixProfiles.includes("dynamic_affix_transfer_selection_v1") &&
    affixProfiles.includes("dynamic-prefix-compiler-rollout.ts") &&
    affixProfiles.includes("dynamic-affix-compiler-rollout.ts"),
);
assert(
  sharedAffixInventory.includes('"dynamicPrefix": "all_five_shared_compiler_authority"') &&
    sharedAffixInventory.includes('"dynamicAffix": "all_ten_guarded_shared_compiler_authority"') &&
    sharedAffixInventory.includes('"defaultMode": "shadow"') &&
    sharedAffixInventory.includes('"defaultMode": "legacy_authoritative"') &&
    sharedAffixInventory.includes('"policyVersion": "dynamic_affix_transfer_selection_v1"') &&
    sharedAffixInventory.includes('"crossEnvironmentSemantic": "shared_affix_profile_semantic_fingerprint_v2"') &&
    sharedAffixInventory.includes('"authority": "shared_migration"') &&
    sharedAffixInventory.includes('"compilerVersion": 1') &&
    sharedAffixInventory.includes('"D4_MOR_PREFIXES_UN"') &&
    sharedAffixInventory.includes('"D4_MOR_SUFFIXES_SION"'),
);
assert(!sharedCompiler.includes("D4_MOR_"), "shared compiler has no production microskill literal");
assert(
  prefixWriter.includes("compileDynamicPrefixWordLabDecision") &&
    prefixWriter.includes("canPersistDynamicPrefixCompilerDecision") &&
    !prefixWriter.includes("shared-affix-compiler") &&
    !prefixWriter.includes("dynamic-prefix-legacy-compiler"),
  "Prefix writer reaches compiler authority only through the rollout boundary",
);
assert(
  prefixRouteAction.includes("createDynamicPrefixAssignment") &&
    !prefixRouteAction.includes("compileDynamicPrefixWordLabDecision"),
  "normal Prefix action and QA launcher share one assignment writer",
);
assert(
  affixWriter.includes("compileDynamicAffixWordLabDecision") &&
    affixWriter.includes("canPersistDynamicAffixCompilerDecision") &&
    !affixWriter.includes("compileSharedAffixLesson") &&
    !affixWriter.includes("dynamic-affix-legacy-compiler"),
  "Dynamic Affix writer reaches compiler authority only through the rollout boundary",
);
assert(
  affixRouteAction.includes("createDynamicAffixAssignment") &&
    !affixRouteAction.includes("compileDynamicAffixWordLabDecision"),
  "normal Affix action and readiness page share one assignment writer",
);
assert(
    migrationTracker.includes("internal V2 compiler migration") &&
    migrationTracker.includes("exact-production `un-` source release") &&
    migrationTracker.includes("do not depend on its production rollout") &&
    migrationTracker.includes("ten Dynamic Affix profiles"),
);
assert(
  productionChecklist.includes("Status: not authorised") &&
    productionChecklist.includes("staging-only release package") &&
    productionChecklist.includes("HTTP `404`") &&
    productionChecklist.includes("Retain the old compiler"),
);
assert(
  prefixVisualQa.includes("1440 × 900") &&
    prefixVisualQa.includes("390 × 844") &&
    prefixVisualQa.includes("Reload mid-lesson") &&
    prefixVisualQa.includes("pre-existing renderer defect") &&
    prefixVisualQa.includes("D4_MOR_PREFIXES_UN"),
  "all-five human visual QA remains a required staging gate",
);
const productionObservationKeys = [
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_PREFIXES_UN",
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
  "D4_MOR_SUFFIXES_NESS",
  "D4_MOR_SUFFIXES_ABLE_IBLE",
  "D4_MOR_SUFFIXES_AL",
  "D4_MOR_SUFFIXES_OUS",
  "D4_MOR_SUFFIXES_ITY",
  "D4_MOR_SUFFIXES_LY",
  "D4_MOR_SUFFIXES_MENT",
  "D4_MOR_SUFFIXES_FUL_LESS",
  "D4_MOR_SUFFIXES_TION",
  "D4_MOR_SUFFIXES_SION",
  "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
];
for (const key of productionObservationKeys) {
  assert(releaseRegistry.includes(key), `release registry contains ${key}`);
  assert(observationLedger.includes(`\`${key}\``), `observation ledger contains ${key}`);
  assert.equal(
    observationLedger.split(`\`${key}\``).length - 1,
    1,
    `observation ledger contains one row for ${key}`,
  );
}
assert(
  observationLedger.includes("`coverage_complete`; `lifecycle_audit_required`") &&
    observationLedger.includes("Reviewed base definitions for `natural` and `necessary`") &&
    observationLedger.includes("Generic-support approval remains outstanding"),
  "Prefix coverage and lifecycle qualifiers are recorded",
);
assert(
  releaseRegistry.includes("adle-microskill-production-observation-ledger.md") &&
    observationLedger.includes("`not_applicable`") &&
    observationLedger.includes("`blocked`"),
  "registry links the observation ledger and deferred capabilities are not treated as missing coverage",
);
for (const [, target] of observationLedger.matchAll(/\]\(([^)]+)\)/g)) {
  assert(
    existsSync(`docs/implementation/qa/${target}`) || existsSync(`docs/implementation/${target}`),
    `observation-ledger link resolves: ${target}`,
  );
}
assert(
  sharedAffixReceipt.includes('"profileCount": 15') &&
    sharedAffixReceipt.includes('"eligibleWordCount": 75') &&
    sharedAffixReceipt.includes('"authenticSlotCases": 300') &&
    sharedAffixReceipt.includes('"remoteWriteRequests": 0') &&
    sharedAffixReceipt.includes('"productionHostRejected": true'),
);
assert(
  routeMetadata.includes('"metadataSchemaVersion": 1') &&
    routeMetadata.includes('"authoritativeStorage": "daily_assignments.lesson_route_metadata"') &&
    routeMetadata.includes('"legacyFallback": "metadata_absent_only"'),
);
assert(
  authority.includes("lib/adle/curriculum-readiness/route-registry.ts") &&
    authority.includes("docs/generated/adle-composable-lesson/"),
);
assert(
  decisionRegister.includes(
    "7UI-DEC-011,composable lesson foundation ownership,closed",
  ),
);
assert(
  decisionRegister.trimEnd().split("\n").filter((line) => line.startsWith("7UI-DEC-011,"))
    .length === 1,
);

const trackers = readdirSync("docs/implementation").filter((name) =>
  name.includes("composable-lesson-migration-tracker"),
);
assert.deepEqual(trackers, ["adle-composable-lesson-migration-tracker.md"]);

console.log("ADLE composable documentation regression passed.");
