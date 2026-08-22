import assert from "node:assert/strict";

import { listCanonicalActivityRendererRegistrations } from "../components/adle/activities/canonical-renderer-registry";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import {
  GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
  type CanonicalActivitySnapshotV3,
  type CompiledLessonSnapshotV3,
  type LessonWordSnapshotV3,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-contracts";
import {
  GENERIC_SNAPSHOT_V3_WRITER_ENABLED,
  PROPOSED_GENERIC_SNAPSHOT_V3_GENERATION_ALLOW_LIST,
  getGenericSnapshotV3ReaderContract,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-registry";
import {
  fingerprintCompiledLessonSnapshotV3,
  fingerprintLessonWordV3,
  validateCompiledGenericLessonSnapshotV3,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-validator";
import { extractCanonicalSentenceTarget } from "../lib/adle/sentence-dictation-contract";

function contract(concept: string, mode: string) {
  const value = getGenericSnapshotV3ReaderContract({ concept, mode, contractVersion: 1 });
  assert(value, `missing ${concept}.${mode}@1`);
  return value;
}

const onePage = {
  config: {
    pages: [{ id: "page-1", type: "teaching", title: "A governed idea", paragraphs: ["Read this authored explanation."] }],
    meetWords: { title: "Today’s words", words: [{ id: "word-1", word: "helpful", provenance: "approved teaching content" }] },
  },
  progression: { kind: "first_impression_sequence", meetWordsPosition: "final" },
} as const;
const threePages = {
  ...onePage,
  config: {
    ...onePage.config,
    pages: [
      ...onePage.config.pages,
      { id: "page-2", type: "teaching", title: "A model", paragraphs: [], model: { first: "help", second: "ful", result: "helpful" } },
      { id: "page-3", type: "teaching", title: "An example", paragraphs: [], examples: [{ text: "help + ful → helpful" }] },
    ],
  },
} as const;
const teaching = contract("INTRODUCTION", "teaching_page");
assert.equal(teaching.validatePayload(onePage), null, "one authored teaching page plus Meet the Words is valid");
assert.equal(teaching.validatePayload(threePages), null, "three authored teaching pages plus Meet the Words are valid");
assert.equal(teaching.validatePayload({ ...onePage, config: { ...onePage.config, meetWords: { words: [] } } })?.kind, "missing_authored_content");
assert.equal(teaching.validatePayload({ ...onePage, config: { ...onePage.config, pages: [] } })?.kind, "malformed_canonical_payload");
assert.equal(teaching.validatePayload({ ...onePage, progression: { kind: "first_impression_sequence", meetWordsPosition: "separate_activity" } })?.kind, "malformed_canonical_payload");
assert.equal(teaching.validatePayload({ ...onePage, config: { ...onePage.config, meetWords: { words: [{ id: "word-1", word: "helpful", audioText: "helpful" }] } } })?.kind, "missing_authored_content", "Meet the Words deliberately has no audio contract");

const reflectionPayload = {
  prompt: "What did you learn about spelling with -ful?",
  promptSource: { kind: "teaching_content", contentRefId: "teaching_content:D4_AFFIX_FUL:v1", contentVersion: "v1", promptKey: "affix-ful-reflection-v1" },
  mistakeSummary: { kind: "normalized_lesson_attempts", sections: ["lesson_production", "lesson_dictation"] },
  sentenceComparison: { kind: "feedback_only", enabled: true, spellingEvidence: false },
  responseBinding: { kind: "learning_reflection", field: "learningReflection" },
  resumeBinding: { kind: "assignment_activity_session" },
  completionBoundary: "part_submission",
} as const;
const reflection = contract("LESSON_REFLECTION", "standard_lesson_reflection");
assert.equal(reflection.validatePayload(reflectionPayload), null, "governed reflection prompt and lifecycle bindings are valid");
assert.equal(reflection.validatePayload({ ...reflectionPayload, prompt: "" })?.kind, "missing_authored_content");
assert.equal(reflection.validatePayload({ ...reflectionPayload, sentenceComparison: { ...reflectionPayload.sentenceComparison, spellingEvidence: true } })?.kind, "malformed_canonical_payload");
assert.equal(reflection.validatePayload({ ...reflectionPayload, completionBoundary: "activity_click" })?.kind, "malformed_canonical_payload");

const completeTargets = { targets: [{ canonicalWordId: "word-1", word: "helpful", definition: "giving help" }] } as const;
assert.equal(contract("MEANING_MATCH", "word_to_definition").validatePayload(completeTargets), null);
assert.equal(contract("MEANING_MATCH", "word_to_definition").validatePayload({ targets: [{ canonicalWordId: "word-1", word: "helpful" }] })?.kind, "missing_authored_content");

const cover = contract("COVER_CHECK", "whole_word");
assert.equal(cover.validatePayload({ canonicalWordId: "word-1", word: "helpful", splitPoints: [4], components: ["help", "ful"], closePolicy: { kind: "track_ratio", threshold: 0.6 } }), null);
assert.equal(cover.validatePayload({ canonicalWordId: "word-1", word: "helpful", splitPoints: [], closePolicy: { kind: "track_ratio", threshold: 2 } })?.kind, "malformed_canonical_payload");

const dictation = contract("DICTATION", "whole_sentence");
assert.equal(dictation.validatePayload({ canonicalWordId: "word-1", targetWord: "helpful", audioText: "The helpful child smiled.", correctSentence: "The helpful child smiled.", targetBinding: { kind: "token", tokenIndex: 1 } }), null);
assert.equal(dictation.validatePayload({ canonicalWordId: "word-2", targetWord: "football pitch", audioText: "We crossed the football pitch.", correctSentence: "We crossed the football pitch.", targetBinding: { kind: "span", startTokenIndex: 3, endTokenIndexExclusive: 5, exactAnswer: "football pitch" } }), null);
assert.equal(dictation.validatePayload({ canonicalWordId: "word-2", targetWord: "football pitch", audioText: "We crossed the football pitch.", correctSentence: "We crossed the football pitch.", targetBinding: { kind: "span", startTokenIndex: 3, endTokenIndexExclusive: 5, exactAnswer: "wrong span" } })?.kind, "malformed_canonical_payload");
assert.equal(extractCanonicalSentenceTarget("We crossed the football pitch.", { kind: "span", startTokenIndex: 3, endTokenIndexExclusive: 5, exactAnswer: "football pitch" }), "football pitch");

const allowList = PROPOSED_GENERIC_SNAPSHOT_V3_GENERATION_ALLOW_LIST.map((entry) => `${entry.concept}.${entry.mode}@${entry.contractVersion}`).sort();
assert.deepEqual(allowList, [
  "COLD_WORD_RECALL.diagnostic_probe@1",
  "COLD_WORD_RECALL.scheduled_review@1",
  "COVER_CHECK.whole_word@1",
  "DICTATION.whole_sentence@1",
  "ERROR_REPAIR.reveal_hide_retry@1",
  "INTRODUCTION.teaching_page@1",
  "LESSON_REFLECTION.standard_lesson_reflection@1",
  "MEANING_MATCH.component_clues@1",
  "MEANING_MATCH.word_to_definition@1",
  "MEMORY_CUE.child_authored_cue@1",
]);
const rendererContracts = listCanonicalActivityRendererRegistrations().map((entry) => `${entry.concept}.${entry.mode}@${entry.contractVersion}`);
for (const key of [
  "MEANING_MATCH.word_to_definition@1",
  "COVER_CHECK.component_marked@1",
  "COVER_CHECK.ratio_close_policy@1",
  "DICTATION.target_token@1",
  "DICTATION.target_span@1",
]) assert(rendererContracts.includes(key), `${key} remains representable in the canonical specialist registry`);
assert.equal(GENERIC_SNAPSHOT_V3_WRITER_ENABLED, false, "D1 must not enable the v3 writer");

const teachingContentRef = "teaching_content:D4_AFFIX_FUL:v1";
const wordDraft: Omit<LessonWordSnapshotV3, "factFingerprint"> = {
  contractVersion: 3,
  wordSnapshotId: "word:helpful",
  order: 1,
  canonicalWordId: "word-1",
  displayWord: "helpful",
  familyKey: "D4_AFFIX",
  microSkillKey: "D4_AFFIX_FUL",
  learningItemId: null,
  role: "authentic_target",
  selectionProvenance: "teaching_content",
  source: { kind: "teaching_content", referenceId: teachingContentRef },
  contentVersionRefs: [teachingContentRef],
};
const lessonWord: LessonWordSnapshotV3 = { ...wordDraft, factFingerprint: fingerprintLessonWordV3(wordDraft) };
const activityBase = (input: Pick<CanonicalActivitySnapshotV3, "activityId" | "label" | "order" | "sectionKey" | "canonical" | "payload" | "evidence" | "answerVisibility" | "scheduleRole" | "rewardRole"> & { bindsWord?: boolean }): CanonicalActivitySnapshotV3 => ({
  contractVersion: 3,
  activityId: input.activityId,
  label: input.label,
  order: input.order,
  part: "lesson",
  sectionKey: input.sectionKey,
  canonical: input.canonical,
  payload: input.payload,
  itemBinding: { sourceEntityId: `source-${input.order}`, position: input.order, inputSource: "assignment_items.prompt_data" },
  wordSnapshotIds: input.bindsWord === false ? [] : [lessonWord.wordSnapshotId],
  contentVersionRefs: [teachingContentRef],
  condition: { kind: "always" },
  answerVisibility: input.answerVisibility,
  evidence: input.evidence,
  completion: { binding: "part_submission", part: "lesson" },
  scheduleRole: input.scheduleRole,
  rewardRole: input.rewardRole,
});
const activities: CanonicalActivitySnapshotV3[] = [
  activityBase({ activityId: "activity:teaching", label: "Teaching", order: 1, sectionKey: "lesson_intro", canonical: { concept: "INTRODUCTION", mode: "teaching_page", contractVersion: 1 }, payload: onePage, answerVisibility: "teaching", evidence: { mode: "none", capture: "none", attemptKind: null, evidenceClass: null }, scheduleRole: "none", rewardRole: "none" }),
  activityBase({ activityId: "activity:meaning", label: "Meaning", order: 2, sectionKey: "guided_practice", canonical: { concept: "MEANING_MATCH", mode: "word_to_definition", contractVersion: 1 }, payload: completeTargets, answerVisibility: "guided", evidence: { mode: "guided_completion", capture: "optional", attemptKind: "guided_practice", evidenceClass: "guided_practice_attempt" }, scheduleRole: "none", rewardRole: "none" }),
  activityBase({ activityId: "activity:cover", label: "Cover", order: 3, sectionKey: "lesson_production", canonical: { concept: "COVER_CHECK", mode: "whole_word", contractVersion: 1 }, payload: { canonicalWordId: "word-1", word: "helpful", splitPoints: [4], components: ["help", "ful"] }, answerVisibility: "recall_neutral", evidence: { mode: "independent_word", capture: "submitted_on_part_finish", attemptKind: "lesson_production", evidenceClass: "first_exposure_lesson_attempt" }, scheduleRole: "lesson_final_if_no_dictation", rewardRole: "lesson_taught_word" }),
  activityBase({ activityId: "activity:dictation", label: "Dictation", order: 4, sectionKey: "lesson_dictation", canonical: { concept: "DICTATION", mode: "whole_sentence", contractVersion: 1 }, payload: { canonicalWordId: "word-1", targetWord: "helpful", audioText: "The helpful child smiled.", correctSentence: "The helpful child smiled.", targetBinding: { kind: "token", tokenIndex: 1 } }, answerVisibility: "recall_neutral", evidence: { mode: "independent_word", capture: "submitted_on_part_finish", attemptKind: "lesson_dictation", evidenceClass: "first_exposure_lesson_attempt" }, scheduleRole: "lesson_final", rewardRole: "none" }),
  activityBase({ activityId: "activity:reflection", label: "Reflection", order: 5, sectionKey: "lesson_reflection", canonical: { concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1 }, payload: reflectionPayload, answerVisibility: "post_submit", evidence: { mode: "reflection", capture: "none", attemptKind: null, evidenceClass: null }, scheduleRole: "none", rewardRole: "none", bindsWord: false }),
];
const snapshotBase: Omit<CompiledLessonSnapshotV3, "provenance"> = {
  snapshotSchemaVersion: 3,
  compilerVersion: GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
  validatorVersion: GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
  canonicalContractRegistryVersion: GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
  route: { routeId: "generic_composer", routeVersion: "v1" },
  recipe: { recipeKey: "generic_first_exposure", recipeVersion: "v1" },
  payload: { kind: "composed_daily_plan", version: 1 },
  runtime: { adapterKey: "generic_composer_v1", rendererKey: "canonical_activity_host_v1" },
  assignment: { generationSource: "adle_composer_v1", itemCount: activities.length },
  taxonomy: { lesson: { familyKey: "D4_AFFIX", microSkillKey: "D4_AFFIX_FUL" }, reviewFamilyKeys: [], reviewMicroSkillKeys: [] },
  words: [lessonWord],
  activities,
  segments: [{ segmentId: "lesson", wordSnapshotIds: [lessonWord.wordSnapshotId], activityIds: activities.map((activity) => activity.activityId) }],
  contentVersions: [
    { contentRefId: "composer_policy:composer-v1:composer-v1", kind: "composer_policy", key: "composer-v1", version: "composer-v1", sourceRowHash: null },
    { contentRefId: "schedule_policy:schedule-v1:schedule-v1", kind: "schedule_policy", key: "schedule-v1", version: "schedule-v1", sourceRowHash: null },
    { contentRefId: "banding:banding-v1:banding-v1", kind: "banding", key: "banding-v1", version: "banding-v1", sourceRowHash: null },
    { contentRefId: teachingContentRef, kind: "teaching_content", key: "D4_AFFIX_FUL", version: "v1", sourceRowHash: "governed-content-hash" },
  ],
};
const provenance = { sourceKind: "compiled_generic_canonical_assignment" as const, fingerprintAlgorithm: "sha256" as const, fingerprintVersion: 1 as const };
const completeFirstImpressionSnapshot: CompiledLessonSnapshotV3 = {
  ...snapshotBase,
  provenance: { ...provenance, sourceFingerprint: fingerprintCompiledLessonSnapshotV3({ ...snapshotBase, provenance }) },
};
const validationItems = activities.map((activity) => ({
  sourceEntityId: activity.itemBinding.sourceEntityId,
  position: activity.itemBinding.position,
  sectionKey: activity.sectionKey,
  canonicalWordId: typeof activity.payload.canonicalWordId === "string" ? activity.payload.canonicalWordId : null,
  targetWord: typeof activity.payload.targetWord === "string" ? activity.payload.targetWord : typeof activity.payload.word === "string" ? activity.payload.word : null,
}));
assert.equal(validateCompiledGenericLessonSnapshotV3(completeFirstImpressionSnapshot, {
  lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
  assignmentGenerationSource: "adle_composer_v1",
  items: validationItems,
}).ok, true, "the revised contracts represent a complete Teaching → middle → Cover → Dictation → Reflection First Impression snapshot");

console.log("PASS: Generic Snapshot v3 D1 contracts (TeachingPages, LessonReflection, Meaning Match, Cover/Dictation policies, writer OFF)");
