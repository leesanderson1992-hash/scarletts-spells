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
  sharedAffix.includes("no production route") &&
    sharedAffix.includes("Dynamic Prefix V2 and Dynamic Affix V3 remain authoritative") &&
    sharedAffix.includes("no microskill-key branch") &&
    sharedAffix.includes("performs no remote write"),
);
assert(
  affixProfiles.includes("inventory, not an activation switch") &&
    affixProfiles.includes("never gain a microskill literal"),
);
assert(
  sharedAffixInventory.includes('"activationAuthority": "none_shadow_only"') &&
    sharedAffixInventory.includes('"compilerVersion": 1') &&
    sharedAffixInventory.includes('"D4_MOR_PREFIXES_UN"') &&
    sharedAffixInventory.includes('"D4_MOR_SUFFIXES_SION"'),
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
