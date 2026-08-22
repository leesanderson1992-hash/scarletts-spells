import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADLE_ACTIVITY_AUDIT_CONCLUSIONS,
  ADLE_ACTIVITY_CATALOGUE,
  ADLE_ACTIVITY_CONVERGENCE_BACKLOG,
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
  counts.THIN_ADAPTER + counts.DEVELOPMENT_REFERENCE + counts.DUPLICATE_TO_MIGRATE +
  counts.DEAD_OR_UNREFERENCED + counts.REQUIRES_ARCHITECTURE_DECISION,
  counts.totalImplementations,
  "every implementation must have exactly one classification",
);

assert.equal(
  ADLE_ACTIVITY_AUDIT_CONCLUSIONS.authoritativeBaseSha,
  "d59506c9f3175a73b3f4614a1077470f3ab0e4a2",
  "catalogue governance must cite the fetched post-Group-7 authority",
);
assert.equal(
  ADLE_ACTIVITY_AUDIT_CONCLUSIONS.group7Closeout.status,
  "COMPLETE_MERGED_AND_DEPLOYED",
  "Group 7 must remain recorded as merged and deployed",
);
assert(
  !ADLE_ACTIVITY_CONVERGENCE_BACKLOG.some((item) => item.title === "Extract the standard first-impression shell"),
  "the completed Group 7 shell extraction must not remain in the active backlog",
);
assert(
  !ADLE_ACTIVITY_AUDIT_CONCLUSIONS.genuineGaps.some((gap) => gap.includes("Reading Page")),
  "TeachingPages resolved the former canonical Reading Page gap",
);
const registryWiring = ADLE_ACTIVITY_CONVERGENCE_BACKLOG.find((item) => item.title === "Wire rich components through registry modes");
assert(registryWiring, "registry wiring must remain the next active architecture workstream");
assert.equal(registryWiring.modelCReleaseChangeRequired, false, "behaviour-identical registry wiring is not itself a Model C release change");
assert(registryWiring.releaseBoundary.includes("Stop and require a separate Model C decision"), "registry wiring must retain the semantic-change release gate");
assert.equal(
  ADLE_ACTIVITY_AUDIT_CONCLUSIONS.nextConvergenceGroup.status,
  "P1_REGISTRY_WIRING_PHASES_A_B_COMPLETE_REVIEW_REQUIRED",
  "governance must stop for review before Phase C",
);
assert(
  ADLE_ACTIVITY_IMPLEMENTATION_AUDIT.some((row) => row.implementationName === "CanonicalActivityRenderer registry" && row.classification === "CANONICAL"),
  "the specialist versioned renderer registry must be governed as the current canonical runtime authority",
);
assert(
  !registryWiring.currentImplementations.includes("FirstImpressionLesson render closures"),
  "specialist render closures must no longer be listed as current renderer-selection authority",
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
  "SplitHandle", "DefinitionWordBuilder", "BinSort", "CoverShutter",
  "ColdWordRecall", "SentenceDictation", "ReflectionActivity", "CompoundJigsawActivity", "MeaningConnectionActivity",
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
