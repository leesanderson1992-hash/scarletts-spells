import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADLE_VISUAL_CONVERGENCE_GROUPS,
  visualConvergenceCandidateCount,
  type VisualConvergenceClassification,
} from "../lib/adle/activity-visual-convergence";

const root = process.cwd();
const allowed = new Set<VisualConvergenceClassification>([
  "SAME_ENGINE", "SAME_ENGINE_DIFFERENT_MODE", "SAME_ENGINE_DIFFERENT_SKIN",
  "GENUINELY_DIFFERENT_INTERACTION", "RETIRE", "OWNER_REVIEW_REQUIRED",
]);

assert.deepEqual(ADLE_VISUAL_CONVERGENCE_GROUPS.map((group) => group.number), [1, 2, 3, 4, 5, 7], "completed convergence groups and Group 7 Teaching/Shell must remain ordered");
assert.equal(new Set(ADLE_VISUAL_CONVERGENCE_GROUPS.map((group) => group.id)).size, 6, "visual group ids must be unique");
assert.equal(visualConvergenceCandidateCount(), 32, "visual lab inventory replaces teaching duplicates with canonical TeachingPages and FirstImpressionLesson while retaining both ColdWordRecall evidence configurations");

const candidateIds = new Set<string>();
for (const group of ADLE_VISUAL_CONVERGENCE_GROUPS) {
  assert(group.question.trim() && group.interactionFamily.trim(), `${group.id} needs an architectural question and interaction family`);
  assert(group.behaviouralDifferences.length && group.visualOnlyDifferences.length && group.persistenceEvidenceDifferences.length && group.historicalReplayRequirements.length, `${group.id} needs the full read-only summary`);
  for (const candidate of group.candidates) {
    assert(!candidateIds.has(candidate.id), `duplicate visual candidate id: ${candidate.id}`);
    candidateIds.add(candidate.id);
    assert(allowed.has(candidate.classification), `${candidate.id} has an invalid classification`);
    assert(existsSync(join(root, candidate.componentPath)), `${candidate.id} provenance path is missing`);
    assert(candidate.note.trim(), `${candidate.id} needs a mount/safety note`);
    if (candidate.mount === "documented_only") assert.equal(candidate.supportedStates.length, 0, `${candidate.id} cannot advertise forced preview states`);
    else assert(candidate.supportedStates.length > 0, `${candidate.id} mounted previews need supported states`);
  }
}
for (const coldId of ["review-cold-recall", "diagnostic-cold-recall"]) {
  assert(candidateIds.has(coldId), `${coldId} must remain visibly reviewable through the canonical ColdWordRecall`);
}

const routeSource = readFileSync(join(root, "app/admin/adle/activity-catalogue/page.tsx"), "utf8");
const labSource = readFileSync(join(root, "app/admin/adle/activity-catalogue/visual-convergence-lab.tsx"), "utf8");
const previewSource = readFileSync(join(root, "app/admin/adle/activity-catalogue/visual-convergence-candidates.tsx"), "utf8");
const devRouteSource = readFileSync(join(root, "app/dev/adle/activity-convergence/page.tsx"), "utf8");
assert(routeSource.includes("VisualConvergenceLab"), "admin catalogue route must render the Visual Convergence Lab");
assert(devRouteSource.includes('process.env.NODE_ENV === "production"') && devRouteSource.includes("notFound()"), "local visual-review alias must fail closed in Production");
for (const candidate of ADLE_VISUAL_CONVERGENCE_GROUPS.flatMap((group) => group.candidates)) {
  if (candidate.mount !== "documented_only") assert(previewSource.includes(`\"${candidate.id}\"`), `${candidate.id} must resolve to a real mounted preview`);
}

for (const [name, source] of [["lab", labSource], ["preview", previewSource]] as const) {
  for (const forbidden of [
    "completeAdleLessonPartAction", "completeAdleReviewPartAction", "createServiceRoleClient",
    "createBrowserClient", ".from(", "fetch(", "localStorage", "sessionStorage", "use server",
  ]) assert(!source.includes(forbidden), `${name} must not include learner/runtime mutation capability: ${forbidden}`);
}
assert(!previewSource.includes("<form"), "preview adapters must not introduce completion forms");
assert(previewSource.includes("<LessonReflection") && previewSource.includes("onComplete={noop}"), "LessonReflection previews must use controlled local state and non-mutating callbacks");
const lessonReflectionSource = readFileSync(join(root, "components/adle/activities/lesson-reflection.tsx"), "utf8");
for (const forbidden of ["completeAdleLessonPartAction", "completeBaseWordFamilyLessonAction", "createBrowserClient", ".from(", "fetch("]) {
  assert(!lessonReflectionSource.includes(forbidden), `LessonReflection must not own runtime or persistence capability: ${forbidden}`);
}

for (const exactAuditClassification of ["GENUINELY_DIFFERENT_INTERACTION", "RETIRE"]) {
  assert(ADLE_VISUAL_CONVERGENCE_GROUPS.some((group) => group.candidates.some((candidate) => candidate.classification === exactAuditClassification)), `lab must expose established ${exactAuditClassification} findings`);
}
assert(ADLE_VISUAL_CONVERGENCE_GROUPS.some((group) => group.candidates.some((candidate) => candidate.classification === "OWNER_REVIEW_REQUIRED")), "visual judgement must remain explicitly owner-reviewed");

console.log(`PASS: ADLE Visual Convergence Lab (Groups 1-5 and 7, ${visualConvergenceCandidateCount()} candidates, no mutation capability)`);
