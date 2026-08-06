import type { ComposedDailyPlan, PlanItemCandidate, PlanSection } from "../daily-assignment-composer";
import { canonicalSnapshotJson } from "../composable-lesson/canonical-fingerprint";
import { createPersistedRouteMetadata } from "../composable-lesson/persisted-route-metadata";
import { dynamicAffixExpectedItemCount, type DynamicAffixLessonPayloadV3, type DynamicAffixSelection } from "./affix-word-lab";
import type { CompiledAffixLessonV1 } from "./shared-affix-contracts";

export type DynamicAffixAssignmentPlanValidationResult =
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

/** Persists new position-aware snapshots without changing legacy prefix bindings. */
export function buildDynamicAffixAssignmentPlan(params: { basePlan: ComposedDailyPlan; selection: DynamicAffixSelection; payload: DynamicAffixLessonPayloadV3 }): ComposedDailyPlan {
  const authentic = new Map(params.selection.authenticTargets.map((item) => [item.canonicalWordId, item]));
  const { payload } = params;
  const split = payload.activities.guided.splitCanonicalWordIds.map((id) => payload.words.lesson.find((word) => word.canonicalWordId === id));
  const builds = payload.activities.guided.builds.map((build) => ({ build, word: payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId) }));
  if (split.some((word) => !word) || builds.some((entry) => !entry.word)) throw new Error("Dynamic Affix guided targets are not in the immutable lesson.");
  let position = 0;
  const item = (input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "provenance">): PlanItemCandidate => ({ ...input, position: ++position, microSkillKey: payload.microSkillId, provenance: "dynamic_affix_v3" });
  const root = { dynamicAffixActivityId: "intro-root", dynamicAffixLesson: payload };
  const id = (name: string, word: string) => `${name}-${word}`;
  const sections: PlanSection[] = [
    { sectionKey: "lesson_intro", purpose: "Dynamic Affix Word Lab v3", items: [
      item({ sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: root, expectedEvidenceKind: "read_only" }),
      item({ sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { dynamicAffixActivityId: "intro-words", words: payload.words.lesson }, expectedEvidenceKind: "read_only" }),
    ] },
    { sectionKey: "guided_practice", purpose: "Dynamic Affix guided work", items: [
      ...split.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_STRIP_BUILD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("guided-strip", word!.canonicalWordId) }, expectedEvidenceKind: "guided_task" })),
      ...(payload.activities.guided.includeMeaningSort ? payload.words.lesson.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_MEANING_MATCH", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("guided-meaning", word.canonicalWordId) }, expectedEvidenceKind: "guided_task" })) : []),
      ...builds.map(({ word }) => item({ sectionKey: "guided_practice", templateKey: "MOR_BUILD_WORD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("guided-build", word!.canonicalWordId) }, expectedEvidenceKind: "guided_task" })),
    ] },
    { sectionKey: "lesson_production", purpose: "Controlled spelling", items: payload.words.lesson.map((word) => item({ sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("controlled", word.canonicalWordId), source: word.source }, expectedEvidenceKind: "controlled_spelling" })) },
    { sectionKey: "lesson_dictation", purpose: "Contextual dictation", items: payload.activities.dictation.map((sentence) => item({ sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: sentence.canonicalWordId, targetWord: sentence.targetWord, learningItemId: authentic.get(sentence.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("dictation", sentence.canonicalWordId), sentence: sentence.sentence }, expectedEvidenceKind: "dictation" })) },
  ];
  const expectedItems = dynamicAffixExpectedItemCount(payload);
  if (sections.flatMap((section) => section.items).length !== expectedItems) throw new Error(`Dynamic Affix snapshot must contain exactly ${expectedItems} items.`);
  return { ...params.basePlan, lessonRouteMetadata: createPersistedRouteMetadata("dynamic_affix_word_lab"), partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] }, partTwo: { composed: true, microSkillKey: payload.microSkillId, selectionAudit: [], lessonWords: payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, provenance: authentic.has(word.canonicalWordId) ? "learning_item" : "stretch", learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, complexityLevel: null })), probePlan: null, stretchItemIntakes: [], sections, skips: [] }, budget: { ...params.basePlan.budget, estimatedResponses: expectedItems, guidedWordCount: 4, introTrimmed: false, trims: [] } };
}

/** Strictly validates only newly prepared plans before they cross persistence. */
export function validateDynamicAffixAssignmentPlanAgainstSharedLesson(params: {
  plan: ComposedDailyPlan;
  payload: DynamicAffixLessonPayloadV3;
  lesson: CompiledAffixLessonV1;
}): DynamicAffixAssignmentPlanValidationResult {
  const { plan, payload, lesson } = params;
  const items = plan.partTwo.sections.flatMap((section) => section.items);
  if (
    items.length !== lesson.assignmentBindings.length
    || items.length !== dynamicAffixExpectedItemCount(payload)
    || items.length !== plan.budget.estimatedResponses
  ) {
    return { ok: false, blockerCode: "assignment_item_count_mismatch" };
  }
  const actualBindings = items.map((item) => {
    const activityId = item.payload && typeof item.payload === "object"
      ? (item.payload as { dynamicAffixActivityId?: unknown }).dynamicAffixActivityId
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
  const root = items.find((item) =>
    item.payload && typeof item.payload === "object"
      && (item.payload as { dynamicAffixActivityId?: unknown }).dynamicAffixActivityId === "intro-root",
  );
  const rootPayload = root?.payload && typeof root.payload === "object"
    ? (root.payload as { dynamicAffixLesson?: unknown }).dynamicAffixLesson
    : null;
  const roleByWordId = new Map(payload.words.lesson.map((word) => [word.canonicalWordId, word.source]));
  const production = items.filter((item) => item.sectionKey === "lesson_production");
  const roleReferencesAgree = production.length === payload.words.lesson.length
    && production.every((item) => {
      if (!item.canonicalWordId) return false;
      const source = roleByWordId.get(item.canonicalWordId);
      return source === "authentic"
        ? item.learningItemId !== null
        : source === "transfer" && item.learningItemId === null;
    });
  if (
    canonical(rootPayload) !== canonical(payload)
    || canonical(plan.lessonRouteMetadata) !== canonical(createPersistedRouteMetadata("dynamic_affix_word_lab"))
    || plan.partTwo.microSkillKey !== lesson.taxonomy.microSkillKey
    || !roleReferencesAgree
  ) {
    return { ok: false, blockerCode: "assignment_plan_mismatch" };
  }
  return { ok: true };
}
