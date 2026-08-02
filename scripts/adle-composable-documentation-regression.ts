import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";

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
  "lib/adle/morphology/affix-word-lab.ts",
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
  sharedAffix.includes("shared writer authority for all five") &&
    sharedAffix.includes("adle_dynamic_prefix_un_profile_staging_v1_2026_08_02") &&
    sharedAffix.includes("Dynamic Affix V3 remains dark") &&
    sharedAffix.includes("microskill-key branch") &&
    sharedAffix.includes("no catch-and-call-legacy path"),
);
assert(
  affixProfiles.includes("inventory, not an activation switch") &&
    affixProfiles.includes("never gain a microskill literal") &&
    affixProfiles.includes("dynamic-prefix-compiler-rollout.ts"),
);
assert(
  sharedAffixInventory.includes('"dynamicPrefix": "all_five_shared_compiler_authority"') &&
    sharedAffixInventory.includes('"dynamicAffix": "none_dark_foundation"') &&
    sharedAffixInventory.includes('"defaultMode": "shadow"') &&
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
  !affixWriter.includes("dynamic-prefix-compiler-rollout") &&
    !affixWriter.includes("compileSharedAffixLesson"),
  "Dynamic Affix writer state remains dark",
);
assert(
  migrationTracker.includes("internal V2 compiler migration") &&
    migrationTracker.includes("exact-production `un-` source release") &&
    migrationTracker.includes("do not depend on its production rollout"),
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
