import type {
  ActivityTemplateFact,
  ComposedDailyPlan,
  DailyPlanFacts,
  PlanItemCandidate,
} from "../daily-assignment-composer";
import { createPersistedRouteMetadata } from "./persisted-route-metadata";
import type { GenericCanonicalActivityAuthoringV3 } from "./generic-snapshot-v3-contracts";
import type { GenericSnapshotV3ProductionAuthorization } from "./generic-snapshot-writer-rollout";

export type GenericSnapshotV3EligibilityBlocker =
  | "generic_v3_no_lesson_composed"
  | "generic_v3_review_activity_unsupported"
  | "generic_v3_required_dictation_replaced_by_probe"
  | "generic_v3_unsupported_activity"
  | "generic_v3_authored_content_incomplete"
  | "generic_v3_first_impression_structure_incomplete";

export type GenericSnapshotV3AuthoringResult =
  | { ok: true; plan: ComposedDailyPlan }
  | { ok: false; blockerCode: GenericSnapshotV3EligibilityBlocker };

export function evaluateNoSpecialistGenericSnapshotV3Boundary(input: {
  authorization: GenericSnapshotV3ProductionAuthorization | null;
  author: () => GenericSnapshotV3AuthoringResult;
}): { authorization: GenericSnapshotV3ProductionAuthorization; authoring: GenericSnapshotV3AuthoringResult }
  | { authorization: null; authoring: null; blockerCode: "no_active_specialist_route" } {
  if (!input.authorization) {
    return { authorization: null, authoring: null, blockerCode: "no_active_specialist_route" };
  }
  return { authorization: input.authorization, authoring: input.author() };
}

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function canonical(input: Omit<GenericCanonicalActivityAuthoringV3, "schemaVersion">): GenericCanonicalActivityAuthoringV3 {
  return { schemaVersion: 3, ...input };
}

/**
 * Pure, deliberately narrow D3 forward authoring adapter. It never interprets
 * historical typed prompts as canonical permission and never mutates the v2
 * composed plan supplied by the caller.
 */
export function authorCompleteGenericSnapshotV3(
  facts: DailyPlanFacts,
  composed: ComposedDailyPlan,
): GenericSnapshotV3AuthoringResult {
  if (!composed.partTwo.composed || !composed.partTwo.microSkillKey || composed.partTwo.lessonWords.length === 0) {
    return { ok: false, blockerCode: "generic_v3_no_lesson_composed" };
  }
  if (composed.partOne.dueQueue.length > 0 || composed.partOne.sections.some((section) => section.items.length > 0)) {
    return { ok: false, blockerCode: "generic_v3_review_activity_unsupported" };
  }
  if (composed.partTwo.probePlan || composed.partTwo.sections.some((section) => section.sectionKey === "lesson_probe")) {
    return { ok: false, blockerCode: "generic_v3_required_dictation_replaced_by_probe" };
  }

  const skill = composed.partTwo.microSkillKey;
  const content = facts.teachingContent.get(skill);
  const reflection = facts.genericV3Reflection?.get(skill);
  if (!content || !text(content.contentVersion) || !text(content.sourceRowHash)
    || !text(content.teachingObjective) || !text(content.childFriendlyExplanation)
    || !text(content.ruleExplanation)
    || reflection?.authorityKind !== "reflection_prompt"
    || reflection.microSkillKey !== skill
    || !text(reflection.promptKey) || !text(reflection.promptText)
    || !text(reflection.contentVersion) || !text(reflection.sourceRowHash)) {
    return { ok: false, blockerCode: "generic_v3_authored_content_incomplete" };
  }

  const dictionary = new Map(facts.dictionary.words.map((word) => [word.canonicalWordId, word]));
  const words = composed.partTwo.lessonWords.map((slot) => {
    const word = dictionary.get(slot.canonicalWordId);
    return word ? { slot, id: slot.canonicalWordId, word: word.displayWord } : null;
  });
  if (words.some((word) => !word) || words.length > 5) {
    return { ok: false, blockerCode: "generic_v3_authored_content_incomplete" };
  }
  const governedWords = words as Array<NonNullable<(typeof words)[number]>>;

  const guided = composed.partTwo.sections.flatMap((section) =>
    section.sectionKey === "guided_practice" ? section.items : [],
  );
  if (guided.length === 0 || guided.some((item) => item.templateKey !== "MEMORY_CUE")) {
    return { ok: false, blockerCode: "generic_v3_unsupported_activity" };
  }
  const templateByKey = new Map(facts.activityTemplates.map((entry) => [entry.templateKey, entry]));
  const memoryTemplate = templateByKey.get("MEMORY_CUE") as ActivityTemplateFact | undefined;
  if (!memoryTemplate || memoryTemplate.rowStatus !== "active" || !text(memoryTemplate.childFacingCopy)
    || !text(memoryTemplate.contentVersion)) {
    return { ok: false, blockerCode: "generic_v3_authored_content_incomplete" };
  }
  const dictation = facts.genericV3Dictation;
  if (!dictation || governedWords.some(({ id }) => {
    const row = dictation.get(id);
    return !row || !text(row.sentence) || !text(row.audioText) || !text(row.sourceRowHash)
      || !Number.isInteger(row.targetTokenIndex) || row.targetTokenIndex < 0;
  })) return { ok: false, blockerCode: "generic_v3_authored_content_incomplete" };

  let position = 0;
  const item = (input: Omit<PlanItemCandidate, "position" | "templateKey" | "expectedEvidenceKind" | "provenance">): PlanItemCandidate => ({
    ...input,
    position: ++position,
    templateKey: "CANONICAL_ACTIVITY_V3",
    expectedEvidenceKind: null,
    provenance: "generic_snapshot_v3_forward_authoring",
  });
  const intro = item({
    sectionKey: "lesson_intro", microSkillKey: skill, canonicalWordId: null,
    targetWord: null, learningItemId: null,
    payload: { canonicalActivityV3: canonical({
      label: "Teaching",
      canonical: { concept: "INTRODUCTION", mode: "teaching_page", contractVersion: 1 },
      canonicalWordIds: governedWords.map(({ id }) => id),
      payload: {
        config: {
          pages: [{
            id: `teaching:${skill}:1`, type: "teaching", title: content.teachingObjective,
            paragraphs: [content.childFriendlyExplanation, content.ruleExplanation],
          }],
          meetWords: { words: governedWords.map(({ id, word }) => ({ id, word, provenance: content.contentVersion! })) },
        },
        progression: { kind: "first_impression_sequence", meetWordsPosition: "final" },
      },
    }) },
  });
  const middle = guided.map((source) => {
    const word = governedWords.find((candidate) => candidate.id === source.canonicalWordId);
    if (!word) return null;
    return item({
      sectionKey: "guided_practice", microSkillKey: skill, canonicalWordId: word.id,
      targetWord: word.word, learningItemId: source.learningItemId,
      payload: { canonicalActivityV3: canonical({
        label: "Memory cue",
        canonical: { concept: "MEMORY_CUE", mode: "child_authored_cue", contractVersion: 1 },
        canonicalWordIds: [word.id],
        payload: { canonicalWordId: word.id, targetWord: word.word, prompt: memoryTemplate.childFacingCopy },
      }) },
    });
  });
  if (middle.some((entry) => !entry)) return { ok: false, blockerCode: "generic_v3_first_impression_structure_incomplete" };
  const covers = governedWords.map(({ slot, id, word }) => item({
    sectionKey: "lesson_production", microSkillKey: skill, canonicalWordId: id,
    targetWord: word, learningItemId: slot.learningItemId,
    payload: { canonicalActivityV3: canonical({
      label: "Cover Check", canonical: { concept: "COVER_CHECK", mode: "whole_word", contractVersion: 1 },
      canonicalWordIds: [id], payload: { canonicalWordId: id, word, splitPoints: [] },
    }) },
  }));
  const dictations = governedWords.map(({ slot, id, word }) => {
    const authored = dictation.get(id)!;
    return item({
      sectionKey: "lesson_dictation", microSkillKey: skill, canonicalWordId: id,
      targetWord: word, learningItemId: slot.learningItemId,
      payload: { canonicalActivityV3: canonical({
        label: "Sentence Dictation", canonical: { concept: "DICTATION", mode: "whole_sentence", contractVersion: 1 },
        canonicalWordIds: [id], payload: {
          canonicalWordId: id, targetWord: word, audioText: authored.audioText,
          correctSentence: authored.sentence,
          targetBinding: { kind: "token", tokenIndex: authored.targetTokenIndex },
          contentSource: { sourceRowHash: authored.sourceRowHash },
        },
      }) },
    });
  });
  const reflectionRef = `teaching_content:${skill}:reflection:${reflection.promptKey}:${reflection.contentVersion}`;
  const reflectionItem = item({
    sectionKey: "lesson_reflection", microSkillKey: skill, canonicalWordId: null,
    targetWord: null, learningItemId: null,
    payload: { canonicalActivityV3: canonical({
      label: "Lesson Reflection", canonical: { concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1 },
      canonicalWordIds: [], payload: {
        prompt: reflection.promptText,
        promptSource: {
          kind: "teaching_content",
          contentRefId: reflectionRef,
          contentVersion: reflection.contentVersion,
          promptKey: reflection.promptKey,
          sourceRowHash: reflection.sourceRowHash,
        },
        mistakeSummary: { kind: "normalized_lesson_attempts", sections: ["lesson_production", "lesson_dictation"] },
        sentenceComparison: { kind: "feedback_only", enabled: true, spellingEvidence: false },
        responseBinding: { kind: "learning_reflection", field: "learningReflection" },
        resumeBinding: { kind: "assignment_activity_session" },
        completionBoundary: "part_submission",
      },
    }) },
  });

  return {
    ok: true,
    plan: {
      ...composed,
      lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
      partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] },
      partTwo: {
        ...composed.partTwo,
        sections: [
          { sectionKey: "lesson_intro", purpose: "Canonical TeachingPages", items: [intro] },
          { sectionKey: "guided_practice", purpose: "Canonical configured middle activity", items: middle as PlanItemCandidate[] },
          { sectionKey: "lesson_production", purpose: "Canonical Cover Check", items: covers },
          { sectionKey: "lesson_dictation", purpose: "Canonical Sentence Dictation", items: dictations },
          { sectionKey: "lesson_reflection", purpose: "Canonical Lesson Reflection", items: [reflectionItem] },
        ],
      },
    },
  };
}
