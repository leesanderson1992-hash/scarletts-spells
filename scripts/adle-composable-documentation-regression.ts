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
