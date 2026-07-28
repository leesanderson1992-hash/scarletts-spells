import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import {
  compileDynamicAffixWordLabPayload,
  dynamicAffixExpectedItemCount,
  selectDynamicAffixWordLab,
  validateDynamicAffixWordLabPayload,
  type DynamicAffixProfile,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { normaliseMorphologyLessonResume } from "../lib/adle/morphology/resume";
import { normaliseSessionWord } from "../lib/adle/session-correctness";

const packagePath = resolve("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ful-less/reviewed-staging-package.json");
const reviewed = JSON.parse(readFileSync(packagePath, "utf8"));
const rendererSource = readFileSync(resolve("components/adle/morphology/morphology-guided-lesson.tsx"), "utf8");
const persistenceMigration = readFileSync(resolve("supabase/migrations/20260728100000_allow_ful_less_dynamic_suffix_18_item_plan.sql"), "utf8");
const meaningStatement = "The suffix -ful means full of or having. The suffix -less means without or not having.";

assert.equal(reviewed.profile.introContent.meaningStatement, meaningStatement);
assert.equal(JSON.stringify(reviewed).split(meaningStatement).length - 1, 1, "meaning statement appears once");
assert(reviewed.profile.introContent.paragraphs.includes("A suffix is a group of letters added to the end of a word."));
assert(reviewed.profile.introContent.spellingRules.includes("There is only one l in the suffix -ful."));
assert.deepEqual(
  reviewed.profile.introContent.examples.map((example: any) => example.word),
  ["careful", "hopeful", "helpful", "colourful", "careless", "hopeless", "helpless", "colourless"],
);
assert(rendererSource.includes("Decide what the suffix means"), "meaning sort uses suffix language");
assert(rendererSource.includes("introScreens!.length"), "introduction supports profile-driven screen counts");
assert(persistenceMigration.includes("D4_MOR_SUFFIXES_FUL_LESS")
  && persistenceMigration.includes("dynamic_affix_v3")
  && persistenceMigration.includes("includeMeaningSort")
  && persistenceMigration.includes("D4_MOR_PREFIXES_SUB_INTER_SUPER"),
  "database guard permits only the reviewed 18-item suffix and existing prefix exceptions");
assert.deepEqual(reviewed.words.map((word: any) => word.word), ["careful", "careless", "hopeful", "hopeless"]);
assert(reviewed.words.every((word: any) => !word.baseMeaning.startsWith(`${word.semanticBaseText}:`)), "base meanings do not repeat word labels");
assert.deepEqual(reviewed.words.map((word: any) => word.newWordMeaning), ["full of care", "without care", "full of hope", "without hope"]);
assert(reviewed.words.every((word: any) => word.reviewedFacts?.frequencyBand
  && word.reviewedFacts?.ageBand && word.reviewedFacts?.complexityBand
  && word.reviewedFacts?.phonemeHint && word.reviewedFacts?.stressPattern
  && typeof word.reviewedFacts?.hasSchwa === "boolean"), "reviewed dictionary facts are frozen");

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
  learningItemId: "ful-less-item",
  childId: "child",
  canonicalWordId: "careful",
  microSkillKey: profile.microSkillKey,
  itemStatus: "pending" as const,
  sourceKind: "verified_misspelling" as const,
  sourceRef: "reviewed-test",
  sourceAttemptText: "carefull",
  reteachPriority: false,
  ejectedOn: null,
  intakeOn: "2026-07-28",
  rowStatus: "active" as const,
};
const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: [authentic] });
assert(selection, "selects the reviewed -ful/-less profile");
const payload = compileDynamicAffixWordLabPayload(selection);
assert(payload && validateDynamicAffixWordLabPayload(payload), "compiles and validates the reviewed mixed-meaning payload");
assert.equal(payload.activities.guided.includeMeaningSort, true);
assert.deepEqual(payload.activities.meaningBins.map((bin) => bin.id), ["full_of", "without"]);
assert.equal(payload.activities.guided.splitCanonicalWordIds.length, 2);
assert.deepEqual(
  payload.activities.guided.splitCanonicalWordIds.map((id) => payload.words.lesson.find((word) => word.canonicalWordId === id)?.affixText),
  ["ful", "less"],
);
for (const id of payload.activities.guided.splitCanonicalWordIds) {
  const word = payload.words.lesson.find((entry) => entry.canonicalWordId === id)!;
  assert.deepEqual(word.splitPoints, [word.teachingBaseText.length]);
}
assert.deepEqual(
  payload.activities.discovery.map((entry) => [entry.baseMeaning, entry.derivedMeaning]),
  [
    ["kind attention or concern", "full of care"],
    ["kind attention or concern", "without care"],
    ["a feeling that something good may happen", "full of hope"],
    ["a feeling that something good may happen", "without hope"],
  ],
);
assert.deepEqual(payload.activities.guided.builds.map((build) => build.targetMeaning), ["full of hope", "without hope"]);
assert.deepEqual(payload.activities.guided.builds.map((build) => build.baseWord), ["hope", "hope"]);
const targetPositions = payload.activities.guided.builds.map((build) => {
  assert.deepEqual(new Set(build.choices.map((choice) => choice.text)), new Set(["ful", "less", "full", "les"]));
  return build.choices.findIndex((choice) => choice.status === "target");
});
assert(new Set(targetPositions).size > 1, "target suffix position varies deterministically");
assert.equal(dynamicAffixExpectedItemCount(payload), 18);

const runtime = dynamicAffixRuntime(payload);
assert(runtime, "adapts -ful/-less to the shared position-aware runtime");
assert.equal(runtime.activities.filter((activity) => activity.type === "meaning_sort").length, 1);
assert.equal(runtime.activities.find((activity) => activity.type === "meaning_sort")?.assignmentBindings.length, 4);
const intro = runtime.activities.find((activity) => activity.type === "introduction");
assert.equal(intro?.introScreens?.length, 5);
assert.equal(intro?.introScreens?.[0]?.meaningCallout, meaningStatement);
assert.deepEqual(intro?.introScreens?.slice(1, 3).flatMap((screen) => screen.examples?.map((example) => example.word) ?? []), [
  "careful", "hopeful", "helpful", "colourful", "careless", "hopeless", "helpless", "colourless",
]);
assert.equal(normaliseSessionWord("Careful"), normaliseSessionWord("careful"));
assert(normaliseMorphologyLessonResume({
  stage: "learn",
  introIndex: 4,
  discoverIndex: 0,
  discoverAddedPrefix: false,
  splitMisses: 0,
  splitCorrect: false,
  splitIndex: 0,
  matchComplete: false,
  buildIndex: 0,
  controlledIndex: 0,
  dictationIndex: 0,
  controlledAttempts: {},
  controlledChecked: {},
  sentenceAttempts: {},
  checkedSentence: false,
  guidedBindings: [],
  muted: false,
  helpLevel: 0,
  reflectionText: "",
}, payload.words.lesson.map((word) => word.canonicalWordId), [], {
  introScreenCount: 5,
  splitCount: 2,
  buildCount: 2,
}), "the final explainer screen survives reload/resume validation");

const basePlan = {
  childId: "child",
  planDate: "2026-07-28",
  composerPolicyVersion: "test",
  schedulePolicyVersion: "test",
  throttle: {},
  partOne: {},
  partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;
const plan = buildDynamicAffixAssignmentPlan({ basePlan, selection, payload });
const items = plan.partTwo.sections.flatMap((section) => section.items);
assert.equal(items.length, 18);
assert.equal(items.filter((item) => item.templateKey === "MOR_STRIP_BUILD").length, 2);
assert.equal(items.filter((item) => item.templateKey === "MOR_MEANING_MATCH").length, 4);
assert.equal(items.filter((item) => item.templateKey === "MOR_BUILD_WORD").length, 2);

const incompleteProfile = { ...profile, wordsByCanonicalId: new Map(profile.wordsByCanonicalId) };
incompleteProfile.wordsByCanonicalId.set("hopeless", {
  ...incompleteProfile.wordsByCanonicalId.get("hopeless")!,
  trueMorphology: { ...incompleteProfile.wordsByCanonicalId.get("hopeless")!.trueMorphology, provenance: {} },
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
console.log("Dynamic suffix -ful/-less regression passed.");
