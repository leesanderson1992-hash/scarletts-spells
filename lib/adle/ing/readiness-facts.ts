import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { RouteContentFact, RouteSelectionFact } from "../curriculum-readiness/resolver";
import { ING_ROUTE_ID, type IngLessonV1 } from "./contracts";
import { validateIngLesson } from "./lesson";

export function ingReadinessFacts(lesson: IngLessonV1, release: PersistedCurriculumReleaseAuthorityV2, childId: string): { routeContent: RouteContentFact[]; routeSelections: RouteSelectionFact[] } {
  if (!validateIngLesson(lesson) || !/^[a-f0-9]{64}$/.test(release.dependencyFingerprint)) throw new Error("ing_readiness_facts_require_reviewed_selection");
  const common = { microSkillKey: lesson.microSkillKey, routeId: ING_ROUTE_ID, routeVersion: "v1", ready: true };
  const evidence = [
    { source: "adle_curriculum_release_manifests", id: release.releaseManifestId },
    { source: "adle_route_activation_revisions", id: release.activationRevisionId },
    { source: "ing_word_selection:v1", id: lesson.assignmentKey, field: "distinctWords", observed: 6, required: 6 },
  ];
  return {
    routeContent: lesson.queuedTargets.map(target => ({ ...common, canonicalWordId: target.canonicalWordId, dependencyFingerprint: release.dependencyFingerprint, blockers: [], evidence })),
    routeSelections: lesson.queuedTargets.map(target => ({ ...common, childId, canonicalWordId: target.canonicalWordId, selectorBlockers: [], evidence: [...evidence, { source: "adle_learning_items", id: target.learningItemId }] })),
  };
}
