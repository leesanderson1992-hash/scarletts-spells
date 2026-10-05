import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { RouteContentFact, RouteSelectionFact } from "../curriculum-readiness/resolver";
import { COMPARATIVE_ROUTE_ID, type ComparativeLessonV1 } from "./contracts";
import { validateComparativeLesson } from "./lesson";

/** Projects an already checked release/selection; never activates content or creates needs. */
export function comparativeReadinessFacts(lesson: ComparativeLessonV1, release: PersistedCurriculumReleaseAuthorityV2, childId: string): { routeContent: RouteContentFact[]; routeSelections: RouteSelectionFact[] } {
  if (!validateComparativeLesson(lesson) || !/^[a-f0-9]{64}$/.test(release.dependencyFingerprint)) throw new Error("comparative_readiness_facts_require_reviewed_selection");
  const common = { microSkillKey: lesson.microSkillKey, routeId: COMPARATIVE_ROUTE_ID, routeVersion: "v1", ready: true };
  const evidence = [
    { source: "adle_curriculum_release_manifests", id: release.releaseManifestId },
    { source: "adle_route_activation_revisions", id: release.activationRevisionId },
    { source: "comparative_family_selection:v1", id: lesson.assignmentKey, field: "distinctFamilies", observed: 2, required: 2 },
  ];
  return {
    routeContent: lesson.queuedTargets.map(t => ({ ...common, canonicalWordId: t.canonicalWordId, dependencyFingerprint: release.dependencyFingerprint, blockers: [], evidence })),
    routeSelections: lesson.queuedTargets.map(t => ({ ...common, childId, canonicalWordId: t.canonicalWordId, selectorBlockers: [], evidence: [...evidence, { source: "adle_learning_items", id: t.learningItemId! }] })),
  };
}
