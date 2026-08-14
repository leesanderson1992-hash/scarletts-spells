import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADLE_ACTIVITY_CATALOGUE,
  ADLE_ACTIVITY_IMPLEMENTATION_AUDIT,
  activityAuditCounts,
} from "../lib/adle/activity-catalogue";
import { listRegisteredActivityTemplateKeys } from "../lib/adle/activity-template-registry";
import { checkOrWriteGeneratedActivityCatalogue } from "./generate-adle-activity-catalogue";

const root = process.cwd();

assert.equal(
  new Set(ADLE_ACTIVITY_CATALOGUE.map((entry) => entry.activityKey)).size,
  ADLE_ACTIVITY_CATALOGUE.length,
  "activity keys must be unique",
);

const templateOwners = new Map<string, string[]>();
for (const entry of ADLE_ACTIVITY_CATALOGUE) {
  assert(entry.supportedModes.length > 0, `${entry.activityKey} must declare at least one mode`);
  assert.equal(
    new Set(entry.supportedModes).size,
    entry.supportedModes.length,
    `${entry.activityKey} modes must be unique`,
  );
  for (const mode of entry.supportedModes) {
    assert(entry.modeDescriptions[mode]?.trim(), `${entry.activityKey}.${mode} needs a description`);
  }
  if (entry.status === "CANONICAL") {
    assert(entry.canonicalComponent, `${entry.activityKey} canonical entry needs a component`);
    assert(entry.canonicalComponentPath, `${entry.activityKey} canonical entry needs a component path`);
  }
  if (entry.canonicalComponentPath) {
    const path = join(root, entry.canonicalComponentPath);
    assert(existsSync(path), `${entry.activityKey} component path is missing: ${entry.canonicalComponentPath}`);
    const source = readFileSync(path, "utf8");
    assert(source.includes(entry.canonicalComponent ?? ""), `${entry.activityKey} component name is absent from its source`);
  }
  for (const templateKey of entry.templateKeys) {
    templateOwners.set(templateKey, [...(templateOwners.get(templateKey) ?? []), entry.activityKey]);
  }
}

const registered = listRegisteredActivityTemplateKeys();
assert.deepEqual(
  [...templateOwners.keys()].sort(),
  [...registered].sort(),
  "catalogue and generic runtime template keys must be a total, exact mapping",
);
for (const [templateKey, owners] of templateOwners) {
  assert.equal(owners.length, 1, `${templateKey} must map to exactly one catalogue concept`);
}

const auditIdentities = ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.map((row) => `${row.filePath}\u0000${row.implementationName}`);
assert.equal(new Set(auditIdentities).size, auditIdentities.length, "implementation audit identities must be unique");
for (const row of ADLE_ACTIVITY_IMPLEMENTATION_AUDIT) {
  assert(existsSync(join(root, row.filePath)), `audited implementation path is missing: ${row.filePath}`);
  assert(row.evidence.trim(), `${row.implementationName} needs classification evidence`);
  assert(row.recommendedAction.trim(), `${row.implementationName} needs a recommended action`);
}

const counts = activityAuditCounts();
assert.equal(
  counts.CANONICAL + counts.CANONICAL_MODE + counts.COMPATIBILITY_ONLY +
  counts.DUPLICATE_TO_MIGRATE + counts.DEAD_OR_UNREFERENCED + counts.REQUIRES_ARCHITECTURE_DECISION,
  counts.totalImplementations,
  "every implementation must have exactly one classification",
);

const galleryPath = join(root, "app/admin/adle/activity-catalogue/activity-catalogue-gallery.tsx");
const gallery = readFileSync(galleryPath, "utf8");
for (const forbidden of [
  "completeAdleLessonPartAction", "completeAdleReviewPartAction", "createServiceRoleClient",
  "createBrowserClient", ".from(", "proficiency", "review schedule", "assignmentId",
]) {
  assert(!gallery.includes(forbidden), `gallery must not include learner-state capability: ${forbidden}`);
}
for (const expected of [
  "SplitHandle", "BaseWordCleaver", "DefinitionWordBuilder", "BinSort", "CoverShutter",
  "SpellingField", "ReflectionActivity", "CompoundJigsawActivity", "MeaningConnectionActivity",
]) {
  assert(gallery.includes(expected), `gallery must render ${expected}`);
}

assert.deepEqual(
  checkOrWriteGeneratedActivityCatalogue(true),
  [],
  "generated human catalogue, audit, and backlog must match the machine authority",
);

console.log(
  `PASS: ADLE Activity Catalogue (${ADLE_ACTIVITY_CATALOGUE.length} concepts, ${counts.configuredModes} modes, ${counts.totalImplementations} implementations)`,
);
