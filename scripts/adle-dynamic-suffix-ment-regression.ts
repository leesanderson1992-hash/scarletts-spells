/* Reviewed fixture objects are deliberately asserted at runtime. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import {
  compileDynamicAffixWordLabPayload,
  selectDynamicAffixWordLab,
  validateDynamicAffixWordLabPayload,
  type DynamicAffixLessonPayloadV3,
  type DynamicAffixProfile,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { normaliseSessionWord } from "../lib/adle/session-correctness";
import { assertDynamicAffixSharedParity } from "./lib/adle-shared-affix-parity-fixtures";

const packageFile = resolve("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ment/reviewed-staging-package.json");
const guidedLessonSource = readFileSync(resolve("components/adle/morphology/morphology-guided-lesson.tsx"), "utf8");
const completionActionSource = readFileSync(resolve("app/learn/week/adle/actions.ts"), "utf8");
const reviewed = JSON.parse(readFileSync(packageFile, "utf8"));
const meaningStatement = "-ment turns something you do into the name of the action or result.";
assert.equal(reviewed.profile.introContent.meaningStatement, meaningStatement);
assert.equal(JSON.stringify(reviewed).split(meaningStatement).length - 1, 1, "approved meaning statement appears exactly once");
assert(reviewed.profile.introContent.paragraphs.includes("The suffix -ment is a noun maker. We can take a verb like enjoy and, when we add -ment to the end, it turns it into a noun."), "introduction teaches -ment as a noun maker");
assert(guidedLessonSource.includes("window.setTimeout(() =>"), "resume hydration is not animation-frame gated");
assert(!guidedLessonSource.includes("window.requestAnimationFrame(() =>"), "background reload cannot stall resume hydration");
assert(guidedLessonSource.includes('return "Try another split"'), "intermediate cleavers announce another split");
assert(guidedLessonSource.includes('hasMeaningSort ? "Continue to meanings" : "Build a word"'), "final suffix cleaver advances directly to build");
assert(completionActionSource.includes("dynamicSuffix !== null\n    ? productionItems")
  && completionActionSource.includes("scheduleAllProducedWords: dynamicSuffix !== null"),
  "suffix completion teaches and schedules all four selected lesson words");
assert.deepEqual(reviewed.words.map((word: any) => word.word), ["enjoyment", "payment", "agreement", "movement"]);
assert(reviewed.words.every((word: any) => word.reviewedFacts?.frequencyBand
  && word.reviewedFacts?.ageBand && word.reviewedFacts?.complexityBand
  && word.reviewedFacts?.phonemeHint && word.reviewedFacts?.stressPattern
  && typeof word.reviewedFacts?.hasSchwa === "boolean"), "all reviewed dictionary facts are frozen");

const convertParts = (parts: any[]) => parts.map((part) => ({
  id: part.id,
  role: part.kind,
  text: part.surfaceText,
  sourceText: part.sourceText,
  gloss: part.gloss,
  start: part.displayRange.start,
  end: part.displayRange.end,
}));
const convertJoins = (joins: any[]) => joins.map((join) => ({
  afterPartId: join.afterPartId,
  beforePartId: join.beforePartId,
  joinType: join.joinType,
}));
const words: DynamicAffixWord[] = reviewed.words.map((word: any): DynamicAffixWord => ({
  canonicalWordId: word.word,
  displayWord: word.word,
  audioText: word.dictation.audioText,
  semanticBaseText: word.semanticBaseText,
  semanticBaseKind: word.semanticBaseKind,
  teachingBaseText: word.teaching.parts.filter((part: any) => part.kind !== "suffix").map((part: any) => part.surfaceText).join(""),
  baseMeaning: word.baseMeaning,
  derivedMeaning: word.newWordMeaning,
  effect: word.meaningBinKey,
  affixVariant: word.suffixVariant,
  affixMeaning: word.teaching.parts.find((part: any) => part.kind === "suffix")?.gloss,
  parts: convertParts(word.teaching.parts),
  joins: convertJoins(word.teaching.joins),
  splitPoints: word.teaching.parts.filter((part: any) => part.kind === "suffix").map((part: any) => part.displayRange.start),
  dictationSentence: word.dictation.sentence,
  dictationTargetTokenIndex: word.dictation.targetTokenIndex,
  trueMorphology: {
    parts: convertParts(word.trueMorphology.parts),
    joins: convertJoins(word.trueMorphology.joins),
    transformations: word.trueMorphology.transformations,
    notes: word.trueMorphology.notes,
    provenance: word.trueMorphology.provenance,
  },
  approvedTransfer: true,
}));
const profile: DynamicAffixProfile = {
  microSkillKey: reviewed.profile.microSkillKey,
  position: "after",
  productionEnabled: true,
  affixLabel: reviewed.profile.suffixLabel,
  affixText: reviewed.profile.suffixText,
  affixMeaning: reviewed.profile.suffixMeaning,
  meaningBins: reviewed.profile.meaningBins,
  includeMeaningSort: reviewed.profile.includeMeaningSort,
  wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])),
  transferCanonicalWordIds: words.map((word) => word.canonicalWordId),
  choices: reviewed.profile.suffixChoices,
  reflection: reviewed.profile.reflection,
  introduction: reviewed.profile.introContent,
};
const authentic = {
  learningItemId: "ment-item",
  childId: "child",
  canonicalWordId: "enjoyment",
  microSkillKey: profile.microSkillKey,
  itemStatus: "pending" as const,
  sourceKind: "verified_misspelling" as const,
  sourceRef: "reviewed-test",
  sourceAttemptText: "enjoymant",
  reteachPriority: false,
  ejectedOn: null,
  intakeOn: "2026-07-27",
  rowStatus: "active" as const,
};
const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: [authentic] });
assert(selection, "selects the reviewed -ment profile");
const payload = compileDynamicAffixWordLabPayload(selection);
assert(payload && validateDynamicAffixWordLabPayload(payload), "compiles and validates the reviewed -ment payload");
assertDynamicAffixSharedParity(selection, payload, "MENT reviewed fixture");
assert.equal(payload.words.lesson.length, 4);
assert.equal(payload.activities.guided.includeMeaningSort, false);
assert.equal(payload.activities.meaningBins.length, 1);
assert.equal(payload.activities.guided.splitCanonicalWordIds.length, 2);
for (const id of payload.activities.guided.splitCanonicalWordIds) {
  const lessonWord: DynamicAffixLessonPayloadV3["words"]["lesson"][number] = payload.words.lesson.find((entry) => entry.canonicalWordId === id)!;
  assert.deepEqual(lessonWord.splitPoints, [lessonWord.teachingBaseText.length]);
  assert.equal(lessonWord.displayWord.slice(lessonWord.splitPoints[0]), "ment");
}
assert.equal(payload.words.lesson.find((word) => word.displayWord === "agreement")?.teachingBaseText, "agree");
assert.equal(payload.words.lesson.find((word) => word.displayWord === "movement")?.teachingBaseText, "move");
assert.deepEqual(payload.activities.discovery.map((entry) => [entry.baseMeaning, entry.derivedMeaning]), [
  ["to take pleasure in something", "the feeling or process of enjoying"],
  ["to give money for something", "money given, or the act of paying"],
  ["to share an opinion or decision", "a result reached by agreeing"],
  ["to change position", "the action or process of moving"],
]);
const targetPositions = payload.activities.guided.builds.map((build) => {
  assert.equal(build.baseWord + "ment", payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId)?.displayWord);
  assert.deepEqual(new Set(build.choices.map((choice) => choice.text)), new Set(["ment", "mant", "mint"]));
  return build.choices.findIndex((choice) => choice.status === "target");
});
assert(new Set(targetPositions).size > 1, "target suffix position varies deterministically");
const runtime = dynamicAffixRuntime(payload);
assert(runtime, "adapts -ment to the shared position-aware runtime");
assert.equal(runtime.guide.displayName, "Suffix Scout");
const introduction = runtime.activities.find((activity) => activity.type === "introduction");
assert.equal(introduction?.introScreens?.[0]?.meaningCallout, meaningStatement);
assert.equal(runtime.activities.filter((activity) => activity.type === "meaning_sort").length, 0);
assert.equal(normaliseSessionWord("Movement"), normaliseSessionWord("movement"));
const basePlan = {
  childId: "child",
  planDate: "2026-07-27",
  composerPolicyVersion: "test",
  schedulePolicyVersion: "test",
  throttle: {},
  partOne: {},
  partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;
assert.equal(
  buildDynamicAffixAssignmentPlan({ basePlan, selection, payload }).partTwo.sections.flatMap((section) => section.items).length,
  16,
  "keeps the immutable 16-item assignment",
);
const incompleteProfile = { ...profile, wordsByCanonicalId: new Map(profile.wordsByCanonicalId) };
incompleteProfile.wordsByCanonicalId.set("movement", {
  ...incompleteProfile.wordsByCanonicalId.get("movement")!,
  trueMorphology: { ...incompleteProfile.wordsByCanonicalId.get("movement")!.trueMorphology, provenance: {} },
});
assert.equal(
  compileDynamicAffixWordLabPayload(selectDynamicAffixWordLab({ profiles: [incompleteProfile], learningItems: [authentic] })!),
  null,
  "fails closed when canonical provenance is incomplete",
);
assert.equal(
  selectDynamicAffixWordLab({ profiles: [{ ...profile, productionEnabled: false }], learningItems: [authentic] }),
  null,
  "production-disabled profiles do not activate without the staging gate",
);
console.log("Dynamic suffix -ment regression passed.");
