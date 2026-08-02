import type { ComposedDailyPlan, DailyPlanFacts, PlanItemCandidate, PlanSection } from "../daily-assignment-composer";
import { canonicalSnapshotJson } from "../composable-lesson/canonical-fingerprint";
import { createPersistedRouteMetadata } from "../composable-lesson/persisted-route-metadata";
import type { DynamicPrefixLessonPayloadV2, DynamicPrefixSelection } from "./dynamic-prefix-word-lab";
import type { CompiledAffixLessonV1 } from "./shared-affix-contracts";

export type DynamicPrefixAssignmentPlanValidationResult =
  | { ok: true }
  | {
      ok: false;
      blockerCode:
        | "assignment_plan_mismatch"
        | "assignment_binding_mismatch"
        | "assignment_item_count_mismatch";
    };

function canonical(value: unknown): string {
  return canonicalSnapshotJson(JSON.parse(JSON.stringify(value)) as unknown);
}

/** Builds the exact persisted shape for a reviewed Dynamic Prefix v2 snapshot. */
export function buildDynamicPrefixAssignmentPlan(params: { basePlan: ComposedDailyPlan; facts: DailyPlanFacts; selection: DynamicPrefixSelection; payload: DynamicPrefixLessonPayloadV2 }): ComposedDailyPlan {
  const { basePlan, selection, payload } = params;
  const authentic = new Map(selection.authenticTargets.map((item) => [item.canonicalWordId, item]));
  const guided = payload.activities.guided ?? {
    splitCanonicalWordIds: [payload.words.lesson[0].canonicalWordId],
    builds: [payload.activities.build],
    includeMeaningSort: true,
  };
  const splitWords = guided.splitCanonicalWordIds.map((id) => payload.words.lesson.find((word) => word.canonicalWordId === id));
  const buildWords = guided.builds.map((build) => ({ build, word: payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId) }));
  if (splitWords.some((word) => !word) || buildWords.some(({ word }) => !word)) throw new Error("Dynamic Prefix guided targets are not in the immutable lesson.");
  let position = 0;
  const item = (input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "provenance"> & { provenance: string }): PlanItemCandidate => ({ ...input, position: ++position, microSkillKey: payload.microSkillId, provenance: input.provenance });
  const lessonWords = payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, provenance: authentic.has(word.canonicalWordId) ? "learning_item" as const : "stretch" as const, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, complexityLevel: null }));
  const root = { dynamicPrefixActivityId: "intro-root", dynamicPrefixLesson: payload };
  const sections: PlanSection[] = [
    { sectionKey: "lesson_intro", purpose: "Dynamic Prefix Word Lab v2", items: [
      item({ sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: root, expectedEvidenceKind: "read_only", provenance: "dynamic_prefix_v2" }),
      item({ sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { dynamicPrefixActivityId: "intro-words", words: payload.words.lesson }, expectedEvidenceKind: "read_only", provenance: "dynamic_prefix_v2" }),
    ] },
    { sectionKey: "guided_practice", purpose: "Dynamic Prefix guided work", items: [
      ...splitWords.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_STRIP_BUILD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `guided-strip-${word!.canonicalWordId}` }, expectedEvidenceKind: "guided_task", provenance: "dynamic_prefix_v2" })),
      ...(guided.includeMeaningSort ? payload.words.lesson.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_MEANING_MATCH", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `guided-meaning-${word.canonicalWordId}` }, expectedEvidenceKind: "guided_task", provenance: "dynamic_prefix_v2" })) : []),
      ...buildWords.map(({ word }) => item({ sectionKey: "guided_practice", templateKey: "MOR_BUILD_WORD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `guided-build-${word!.canonicalWordId}` }, expectedEvidenceKind: "guided_task", provenance: "dynamic_prefix_v2" })),
    ] },
    { sectionKey: "lesson_production", purpose: "Controlled spelling", items: payload.words.lesson.map((word) => item({ sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `controlled-${word.canonicalWordId}`, source: word.source }, expectedEvidenceKind: "controlled_spelling", provenance: "dynamic_prefix_v2" })) },
    { sectionKey: "lesson_dictation", purpose: "Contextual dictation", items: payload.activities.dictation.map((sentence) => item({ sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: sentence.canonicalWordId, targetWord: sentence.targetWord, learningItemId: authentic.get(sentence.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `dictation-${sentence.canonicalWordId}`, sentence: sentence.sentence }, expectedEvidenceKind: "dictation", provenance: "dynamic_prefix_v2" })) },
  ];
  return { ...basePlan, lessonRouteMetadata: createPersistedRouteMetadata("dynamic_prefix_word_lab"), partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] }, partTwo: { composed: true, microSkillKey: payload.microSkillId, selectionAudit: [], lessonWords, probePlan: null, stretchItemIntakes: [], sections, skips: [] }, budget: { ...basePlan.budget, estimatedResponses: sections.flatMap((section) => section.items).length, guidedWordCount: payload.words.lesson.length, introTrimmed: false, trims: [] } };
}

/** Validate the persistence projection before the atomic assignment write. */
export function validateDynamicPrefixAssignmentPlanAgainstSharedLesson(params: {
  plan: ComposedDailyPlan;
  payload: DynamicPrefixLessonPayloadV2;
  lesson: CompiledAffixLessonV1;
}): DynamicPrefixAssignmentPlanValidationResult {
  const { plan, payload, lesson } = params;
  const items = plan.partTwo.sections.flatMap((section) => section.items);
  if (
    items.length !== lesson.assignmentBindings.length
    || items.length !== plan.budget.estimatedResponses
  ) {
    return { ok: false, blockerCode: "assignment_item_count_mismatch" };
  }
  const actualBindings = items.map((item) => {
    const activityId = item.payload && typeof item.payload === "object"
      ? (item.payload as { dynamicPrefixActivityId?: unknown }).dynamicPrefixActivityId
      : null;
    return {
      activityId: typeof activityId === "string" ? activityId : "",
      sectionKey: item.sectionKey,
      templateKey: item.templateKey,
      canonicalWordId: item.canonicalWordId,
      expectedEvidenceKind: item.expectedEvidenceKind,
    };
  });
  if (canonical(actualBindings) !== canonical(lesson.assignmentBindings)) {
    return { ok: false, blockerCode: "assignment_binding_mismatch" };
  }
  const root = items.find((item) => {
    if (!item.payload || typeof item.payload !== "object") return false;
    return (item.payload as { dynamicPrefixActivityId?: unknown }).dynamicPrefixActivityId === "intro-root";
  });
  const rootPayload = root?.payload && typeof root.payload === "object"
    ? (root.payload as { dynamicPrefixLesson?: unknown }).dynamicPrefixLesson
    : null;
  if (
    canonical(rootPayload) !== canonical(payload)
    || canonical(plan.lessonRouteMetadata) !== canonical(createPersistedRouteMetadata("dynamic_prefix_word_lab"))
    || plan.partTwo.microSkillKey !== lesson.taxonomy.microSkillKey
  ) {
    return { ok: false, blockerCode: "assignment_plan_mismatch" };
  }
  return { ok: true };
}
