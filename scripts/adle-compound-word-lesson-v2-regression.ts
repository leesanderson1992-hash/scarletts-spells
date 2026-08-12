import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { assembleSnapRailWord } from "../components/adle/activities/shared/snap-rail";
import { splitHandleDisplayParts } from "../components/adle/activities/shared/split-handle";
import { reconstructCompoundJigsawTarget } from "../components/adle/morphology/compound-jigsaw-activity";
import { EXACT_GOVERNED_FORM_ANSWER_POLICY, isAnswerCorrectUnderPolicy } from "../lib/adle/answer-policy";
import { listRegisteredActivityTemplateKeys } from "../lib/adle/activity-template-registry";
import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import type { LearningItemFact } from "../lib/adle/learning-items";
import { buildCompoundWordAssignmentPlanV2, COMPOUND_WORD_LAB_V2_ROUTE_METADATA } from "../lib/adle/morphology/compound-word-assignment-plan-v2";
import {
  compileCompoundWordLessonV2,
  validateCompoundWordLessonPayloadV2,
  type CompoundWordDictationSourceV2,
  type CompoundWordLessonPayloadV2,
  type CompoundWordLessonRecipeV2,
} from "../lib/adle/morphology/compound-word-lesson-v2";
import { SEPARATED_HYPHENATED_READING_PAGES_V2 } from "../lib/adle/morphology/compound-word-reading-content-v2";
import { governedCompoundSplitPoints } from "../lib/adle/morphology/compound-word-task-config";
import {
  DICTATION_TARGET_SPAN_SCHEMA_VERSION,
  extractAuthoredTargetSpan,
} from "../lib/adle/morphology/dictation-target-span";
import {
  validateClosedCompoundLessonPayload,
  type ClosedCompoundLessonPayloadV1,
} from "../lib/adle/morphology/closed-compound-word-lab";
import type {
  CompoundWordJoinKind,
  CompoundWordMicroSkillKey,
  CompoundWordStructureV2,
} from "../lib/adle/morphology/compound-word-structure-v2";

const CLOSED = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS" as const;
const SEPARATED = "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED" as const;
let uuidOrdinal = 1;
const uuid = () => `00000000-0000-4000-8000-${(uuidOrdinal++).toString(16).padStart(12, "0")}`;

function structure(input: {
  word: string;
  components: readonly string[];
  joins: readonly CompoundWordJoinKind[];
  microSkillKey: CompoundWordMicroSkillKey;
}): CompoundWordStructureV2 {
  return {
    schemaVersion: 2,
    wholeCanonicalWordId: uuid(),
    microSkillKey: input.microSkillKey,
    wholeWord: input.word,
    components: input.components.map((surface, index) => ({
      ordinal: index + 1,
      canonicalWordId: uuid(),
      displaySurface: surface,
      meaning: `Reviewed fixture meaning ${index + 1}`,
      sense: `reviewed-fixture-sense-${index + 1}`,
    })),
    joins: input.joins.map((kind, index) => ({ ordinal: index + 1, kind })),
    childFriendlyMeaning: `Reviewed fixture whole meaning for ${input.word}`,
    componentToWholeRelationship: "Reviewed fixture component-to-whole relationship.",
    morphologyProvenance: { source: "CW-1 governed regression fixture" },
    assignmentEligible: true,
    transferEligible: true,
    review: { status: "approved_for_first_exposure", reviewedBy: "Regression fixture", reviewedAt: "2026-08-11T00:00:00.000Z" },
    source: { artifact: "compound-word-v2-readiness-review.json", sourceRowHash: `fixture-${input.word}`, sheet: "CW-2 regression", row: uuidOrdinal },
  };
}

function dictationFor(value: CompoundWordStructureV2): CompoundWordDictationSourceV2 {
  const tokenCount = value.wholeWord.split(/\s+/u).length;
  return {
    canonicalWordId: value.wholeCanonicalWordId,
    sentence: value.wholeWord,
    audioText: value.wholeWord,
    targetSpan: {
      schemaVersion: DICTATION_TARGET_SPAN_SCHEMA_VERSION,
      startTokenIndex: 0,
      endTokenIndexExclusive: tokenCount,
      exactAnswer: value.wholeWord,
    },
    review: { status: "approved_for_first_exposure", reviewedBy: "Regression fixture", reviewedAt: "2026-08-11T00:00:00.000Z" },
    source: { artifact: "CW-2 regression fixture", sourceRowHash: `dictation-${value.wholeWord}` },
  };
}

function recipe(microSkillKey: CompoundWordMicroSkillKey): CompoundWordLessonRecipeV2 {
  return {
    recipeKey: "compound_word_lab",
    recipeVersion: "v2",
    contentVersion: `cw2-regression-${microSkillKey}`,
    microSkillKey,
    introduction: {
      title: "Compound words",
      childFriendlyExplanation: "Reviewed fixture introduction.",
      summary: "Keep each governed join.",
      ...(microSkillKey === SEPARATED
        ? { readingPages: SEPARATED_HYPHENATED_READING_PAGES_V2 }
        : {}),
    },
    reflection: { promptKey: "compound-word-v2-reflection", promptText: "How do the parts contribute to the whole?" },
  };
}

function itemFor(target: CompoundWordStructureV2, learningItemId: string): LearningItemFact {
  return {
    learningItemId,
    childId: "child-cw2",
    canonicalWordId: target.wholeCanonicalWordId,
    microSkillKey: target.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "verified-cw2-fixture",
    sourceAttemptText: "fixture attempt",
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-08-11",
    rowStatus: "active",
  };
}

const sunflower = structure({ word: "sunflower", components: ["sun", "flower"], joins: ["none"], microSkillKey: CLOSED });
const closedPool = [
  sunflower,
  structure({ word: "bedroom", components: ["bed", "room"], joins: ["none"], microSkillKey: CLOSED }),
  structure({ word: "football", components: ["foot", "ball"], joins: ["none"], microSkillKey: CLOSED }),
  structure({ word: "playground", components: ["play", "ground"], joins: ["none"], microSkillKey: CLOSED }),
];
const iceCream = structure({ word: "ice cream", components: ["ice", "cream"], joins: ["space"], microSkillKey: SEPARATED });
const twentyOne = structure({ word: "twenty-one", components: ["twenty", "one"], joins: ["hyphen"], microSkillKey: SEPARATED });
const motherInLaw = structure({ word: "mother-in-law", components: ["mother", "in", "law"], joins: ["hyphen", "hyphen"], microSkillKey: SEPARATED });
const separatedPool = [
  iceCream,
  twentyOne,
  motherInLaw,
  structure({ word: "part-time", components: ["part", "time"], joins: ["hyphen"], microSkillKey: SEPARATED }),
];

function compilePool(pool: readonly CompoundWordStructureV2[], authentic: CompoundWordStructureV2) {
  return compileCompoundWordLessonV2({
    recipe: recipe(authentic.microSkillKey),
    structures: pool,
    dictationByCanonicalId: new Map(pool.map((entry) => [entry.wholeCanonicalWordId, dictationFor(entry)])),
    learningItems: [itemFor(authentic, "learning-item-cw2-authentic")],
  });
}

const closedPayload = compilePool(closedPool, sunflower);
const separatedPayload = compilePool(separatedPool, iceCream);
assert(closedPayload && validateCompoundWordLessonPayloadV2(closedPayload), "v2 closed lesson compiles");
assert(separatedPayload && validateCompoundWordLessonPayloadV2(separatedPayload), "one v2 path compiles open, hyphenated, and three-part words");
assert.equal(closedPayload.activities.introduction.readingPages, undefined, "closed v2 can retain its existing introduction");
assert.equal(separatedPayload.activities.introduction.readingPages?.length, 3, "separated/hyphenated reading is split across three pages");
assert.deepEqual(
  separatedPayload.activities.introduction.readingPages?.map((page) => page.title),
  [
    "Hyphens: When Do We Join Words Together?",
    "2. Phrasal verbs can turn into nouns",
    "3. Compound nouns",
  ],
);
assert(
  separatedPayload.activities.introduction.readingPages?.[0].sections
    .flatMap((section) => section.examples ?? [])
    .some((example) => example.text === "a well-known rule"),
  "page one preserves the before-a-noun example",
);
assert(
  separatedPayload.activities.introduction.readingPages?.[1].sections
    .flatMap((section) => section.examples ?? [])
    .some((example) => example.text === "There was a break-in." && example.explanation === "noun: the name of the event"),
  "page two preserves the phrasal-verb/noun contrast",
);
assert(
  separatedPayload.activities.introduction.readingPages?.[2].sections
    .flatMap((section) => section.examples ?? [])
    .some((example) => example.text.endsWith("apple pie, toothbrush, brother-in-law.")),
  "page three preserves open, closed, and hyphenated recall",
);

for (const expected of [
  { value: sunflower, parts: ["sun", "flower"], joins: ["none"], split: [3] },
  { value: iceCream, parts: ["ice", "cream"], joins: ["space"], split: [3] },
  { value: twentyOne, parts: ["twenty", "one"], joins: ["hyphen"], split: [6] },
  { value: motherInLaw, parts: ["mother", "in", "law"], joins: ["hyphen", "hyphen"], split: [6, 9] },
] as const) {
  const payload: CompoundWordLessonPayloadV2 = expected.value.microSkillKey === CLOSED ? closedPayload : separatedPayload;
  const word: CompoundWordLessonPayloadV2["words"]["lesson"][number] | undefined = payload.words.lesson.find((entry) => entry.structure.wholeWord === expected.value.wholeWord);
  assert(word, `${expected.value.wholeWord} remains in the deterministic lesson`);
  assert.deepEqual(word.tasks.jigsaw.components, expected.parts);
  assert.deepEqual(word.tasks.jigsaw.joins, expected.joins);
  assert.equal(word.tasks.jigsaw.exactAnswer, expected.value.wholeWord);
  assert.deepEqual(word.tasks.split.splitPoints, expected.split);
  assert.deepEqual(governedCompoundSplitPoints(expected.parts, expected.joins), expected.split);
  assert.deepEqual(splitHandleDisplayParts(expected.value.wholeWord, expected.split, expected.parts), expected.parts);
  assert.equal(assembleSnapRailWord(expected.parts, expected.joins), expected.value.wholeWord);
  assert.equal(reconstructCompoundJigsawTarget({ canonicalWordId: expected.value.wholeCanonicalWordId, word: expected.value.wholeWord, components: expected.parts, joins: expected.joins }), expected.value.wholeWord);
  assert.equal(word.tasks.recall.exactAnswer, expected.value.wholeWord);
  assert.equal(word.tasks.recall.answerPolicy.separatorsSignificant, true);
  assert.equal(extractAuthoredTargetSpan(word.dictation.sentence, word.dictation.targetSpan), expected.value.wholeWord.toLocaleLowerCase("en-GB"));
}
assert.equal(assembleSnapRailWord(["ice", "cream"], []), "icecream", "legacy assembly defaults to concatenation");
assert.equal(assembleSnapRailWord(["mother", "in", "law"], ["hyphen"]), null, "invalid join cardinality fails closed");
assert.equal(assembleSnapRailWord(["ice", "cream"], ["slash" as "hyphen"]), null, "unsupported join kind fails closed");
assert(isAnswerCorrectUnderPolicy("Ice Cream", "ice cream", EXACT_GOVERNED_FORM_ANSWER_POLICY));
assert(!isAnswerCorrectUnderPolicy("icecream", "ice cream", EXACT_GOVERNED_FORM_ANSWER_POLICY));
assert(!isAnswerCorrectUnderPolicy("twenty one", "twenty-one", EXACT_GOVERNED_FORM_ANSWER_POLICY));

const authenticWord = separatedPayload.words.lesson.find((word) => word.structure.wholeWord === "ice cream")!;
assert.equal(authenticWord.tasks.meaning.wholeMeaning, iceCream.childFriendlyMeaning, "whole meaning uses the shared meaning configuration");
assert.equal(authenticWord.lineage.kind, "learner_target");
assert.equal(authenticWord.lineage.learningItemId, "learning-item-cw2-authentic");
for (const word of separatedPayload.words.lesson.filter((entry) => entry.structure.wholeWord !== "ice cream")) {
  assert.deepEqual(word.lineage, { kind: "generated_transfer", learningItemId: null });
}

const basePlan = {
  childId: "child-cw2",
  planDate: "2026-08-11",
  composerPolicyVersion: "fixture",
  schedulePolicyVersion: "fixture",
  throttle: {},
  partOne: {},
  partTwo: {},
  budget: { budgetResponses: 18, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;
const plan = buildCompoundWordAssignmentPlanV2(basePlan, separatedPayload);
const items = plan.partTwo.sections.flatMap((section) => section.items);
assert.equal(items.length, 18);
assert.equal(plan.lessonRouteMetadata?.route.routeId, "compound_word_lab");
assert.equal(plan.partTwo.lessonWords.find((word) => word.canonicalWordId === iceCream.wholeCanonicalWordId)?.learningItemId, "learning-item-cw2-authentic");
assert(plan.partTwo.lessonWords.filter((word) => word.canonicalWordId !== iceCream.wholeCanonicalWordId).every((word) => word.learningItemId === null));
for (const item of items.filter((entry) => entry.canonicalWordId === iceCream.wholeCanonicalWordId)) assert.equal(item.learningItemId, "learning-item-cw2-authentic");
for (const item of items.filter((entry) => entry.canonicalWordId !== null && entry.canonicalWordId !== iceCream.wholeCanonicalWordId)) assert.equal(item.learningItemId, null);

const resolution = resolvePersistedLessonRoute({
  lessonRouteMetadata: COMPOUND_WORD_LAB_V2_ROUTE_METADATA,
  items: items.map((item, index) => ({ id: `cw2-${index}`, sectionKey: item.sectionKey, templateKey: item.templateKey, canonicalWordId: item.canonicalWordId, targetWord: item.targetWord, promptData: item.payload })),
  runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert.equal(resolution.status, "resolved_explicit");
assert(resolution.status === "resolved_explicit" && resolution.runtime.adapterKey === "compound_word_v2");

const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((entry) => entry.routeId === "compound_word_lab" && entry.routeVersion === "v2");
assert(route);
assert.deepEqual(route.supportedMicroSkillKeys, [CLOSED, SEPARATED]);
assert.equal(route.newAssignmentCapable, false);
assert.deepEqual(route.routeOwnership, { kind: "skill_clusters", skillClusterKeys: ["D4_MOR_COMPOUND_WORDS"] });
const templates = listRegisteredActivityTemplateKeys();
assert.equal(templates.filter((key) => key === "MOR_COMPOUND_JIGSAW").length, 1);
assert.equal(templates.filter((key) => key === "MOR_COMPOUND_MEANING_CONNECTION").length, 1);

const v1Word = (word: string, firstWord: string, secondWord: string, index: number) => ({
  canonicalWordId: `v1-${word}`,
  displayWord: word,
  firstWord,
  secondWord,
  firstWordMeaning: "fixture first meaning",
  secondWordMeaning: "fixture second meaning",
  childFriendlyDefinition: "fixture whole meaning",
  audioText: `${word} ${index}`,
  dictationSentence: `${word} ${index}`,
  dictationTargetTokenIndex: 0,
  parts: [{ id: "first", text: firstWord }, { id: "second", text: secondWord }],
  joins: [{ afterPartId: "first", beforePartId: "second", joinType: "none" }],
  trueMorphology: { parts: [{ id: "first", text: firstWord }, { id: "second", text: secondWord }], joins: [{ afterPartId: "first", beforePartId: "second", joinType: "none" }], transformations: [], notes: "", provenance: { source: "v1 fixture" } },
  approvedTransfer: true,
});
const v1Words = [v1Word("bedroom", "bed", "room", 1), v1Word("football", "foot", "ball", 2), v1Word("playground", "play", "ground", 3), v1Word("rainbow", "rain", "bow", 4)];
const v1Payload = {
  schemaVersion: 1,
  experience: "D4_MOR_CLOSED_COMPOUND",
  contentVersion: "d4_mor_closed_compounds_v1",
  microSkillId: CLOSED,
  experienceProfile: "closed_compound_word_lab_v1",
  words: { lesson: v1Words },
  activities: {
    introduction: { title: "v1", childFriendlyExplanation: "v1", summary: "v1", examples: [] },
    reflection: { promptKey: "v1", promptText: "v1" },
    dictation: v1Words.map((word) => ({ canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, sentence: word.dictationSentence, targetTokenIndex: 0 })),
  },
} as unknown as ClosedCompoundLessonPayloadV1;
assert(validateClosedCompoundLessonPayload(v1Payload), "closed v1 payload remains valid");
const invalidIdentity = structuredClone(separatedPayload) as CompoundWordLessonPayloadV2;
invalidIdentity.words.lesson[0].structure.components[0].canonicalWordId = "";
assert(!validateCompoundWordLessonPayloadV2(invalidIdentity), "v2 payload rejects missing canonical component identity");
const invalidJoinCount = structuredClone(separatedPayload) as CompoundWordLessonPayloadV2;
invalidJoinCount.words.lesson[0].structure.joins = [];
assert(!validateCompoundWordLessonPayloadV2(invalidJoinCount), "v2 payload rejects invalid join cardinality");
const invalidReadingPageCount = structuredClone(separatedPayload) as CompoundWordLessonPayloadV2;
invalidReadingPageCount.activities.introduction.readingPages = invalidReadingPageCount.activities.introduction.readingPages?.slice(0, 2);
assert(!validateCompoundWordLessonPayloadV2(invalidReadingPageCount), "configured reading content requires exactly three pages");
const duplicateReadingPageKey = structuredClone(separatedPayload) as CompoundWordLessonPayloadV2;
if (duplicateReadingPageKey.activities.introduction.readingPages) {
  duplicateReadingPageKey.activities.introduction.readingPages[1].key = duplicateReadingPageKey.activities.introduction.readingPages[0].key;
}
assert(!validateCompoundWordLessonPayloadV2(duplicateReadingPageKey), "reading page identity fails closed");

const todayService = readFileSync("lib/adle/today-assignment-service.ts", "utf8");
assert(!todayService.includes("compileCompoundWordLessonV2"), "CW-2 does not activate the Today writer");
const compoundRenderer = readFileSync("components/adle/morphology/closed-compound-guided-lesson.tsx", "utf8");
assert(!compoundRenderer.includes("The burglar tried to break in."), "reviewed reading copy remains payload configuration, not renderer code");
for (const unchanged of ["base_word_lab:v2", "dynamic_prefix_word_lab:v2", "dynamic_affix_word_lab:v3", "generic_composer:v1"]) {
  const [routeId, routeVersion] = unchanged.split(":");
  assert(ADLE_CURRICULUM_ROUTE_REGISTRY.some((entry) => entry.routeId === routeId && entry.routeVersion === routeVersion && entry.newAssignmentCapable), `${unchanged} remains assignment-capable`);
}

console.log("generalized Compound Word lesson v2 regression passed");
