/* Reviewed fixture objects are deliberately asserted at runtime. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compileDynamicAffixWordLabPayload,
  selectDynamicAffixWordLab,
  validateDynamicAffixWordLabPayload,
  type DynamicAffixProfile,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { normaliseSessionWord } from "../lib/adle/session-correctness";
import { assertDynamicAffixSharedParity } from "./lib/adle-shared-affix-parity-fixtures";

const reviewed = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-al/reviewed-staging-package.json", "utf8"));
const statement = "-al turns a naming word into a describing word meaning “connected with.”";
assert.equal(reviewed.profile.introContent.meaningStatement, statement);
assert.equal(JSON.stringify(reviewed).split(statement).length - 1, 1, "meaning statement appears exactly once");
assert.deepEqual(reviewed.words.map((word: any) => word.word), ["musical", "national", "personal", "seasonal"]);
assert.equal(reviewed.profile.includeMeaningSort, false);
assert.deepEqual(reviewed.profile.meaningBins, [{ id: "connected_with", label: "CONNECTED WITH", description: "connected with" }]);
const mapParts = (parts: any[]) => parts.map((part) => ({ id: part.id, role: part.kind, text: part.surfaceText, sourceText: part.sourceText, gloss: part.gloss, start: part.displayRange.start, end: part.displayRange.end }));
const mapJoins = (joins: any[]) => joins.map((join) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType }));
const words: DynamicAffixWord[] = reviewed.words.map((word: any) => ({
  canonicalWordId: word.word, displayWord: word.word, audioText: word.dictation.audioText, semanticBaseText: word.semanticBaseText, semanticBaseKind: word.semanticBaseKind,
  teachingBaseText: word.teaching.parts.filter((part: any) => part.kind !== "suffix").map((part: any) => part.surfaceText).join(""), baseMeaning: word.baseMeaning, derivedMeaning: word.newWordMeaning, effect: word.meaningBinKey,
  affixVariant: word.suffixVariant, affixMeaning: "connected with", parts: mapParts(word.teaching.parts), joins: mapJoins(word.teaching.joins), splitPoints: [word.teaching.parts.find((part: any) => part.kind === "suffix").displayRange.start], dictationSentence: word.dictation.sentence, dictationTargetTokenIndex: word.dictation.targetTokenIndex,
  trueMorphology: { parts: mapParts(word.trueMorphology.parts), joins: mapJoins(word.trueMorphology.joins), transformations: word.trueMorphology.transformations, notes: word.trueMorphology.notes, provenance: word.trueMorphology.provenance }, approvedTransfer: true,
}));
for (const word of words) {
  assert.equal(word.splitPoints[0], word.teachingBaseText.length, `${word.displayWord}: direct suffix boundary`);
  assert.equal(`${word.teachingBaseText}al`, word.displayWord, `${word.displayWord}: reconstructs`);
}
const profile: DynamicAffixProfile = { microSkillKey: reviewed.profile.microSkillKey, position: "after", productionEnabled: true, affixLabel: "-al", affixText: "al", affixMeaning: "related to or connected with", meaningBins: reviewed.profile.meaningBins, includeMeaningSort: false, wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])), choices: reviewed.profile.suffixChoices, reflection: reviewed.profile.reflection, introduction: reviewed.profile.introContent };
const item = { learningItemId: "al", childId: "child", canonicalWordId: "musical", microSkillKey: profile.microSkillKey, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: "test", sourceAttemptText: "musicel", reteachPriority: false, ejectedOn: null, intakeOn: "2026-07-28", rowStatus: "active" as const };
const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: [item] });
assert(selection);
const payload = compileDynamicAffixWordLabPayload(selection);
assert(payload && validateDynamicAffixWordLabPayload(payload));
assertDynamicAffixSharedParity(selection, payload, "AL reviewed fixture");
assert.equal(payload.activities.guided.splitCanonicalWordIds.length, 2);
assert.equal(payload.activities.guided.builds.length, 4);
assert.equal(payload.activities.guided.includeMeaningSort, false);
const positions = payload.activities.guided.builds.map((build) => { assert.deepEqual(new Set(build.choices.map((choice) => choice.text)), new Set(["al", "el", "il"])); return build.choices.findIndex((choice) => choice.status === "target"); });
assert(new Set(positions).size > 1, "target suffix position varies deterministically");
const runtime = dynamicAffixRuntime(payload);
assert(runtime && runtime.activities.filter((activity) => activity.type === "meaning_sort").length === 0, "no sort or fallback cards");
assert.deepEqual(runtime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[1]?.paragraphs, [
  ...reviewed.profile.introContent.paragraphs.filter(
    (paragraph: string) => paragraph !== "A suffix is added to the end of a base or root.",
  ),
  ...reviewed.profile.introContent.spellingRules,
]);
assert.equal(normaliseSessionWord("Musical"), normaliseSessionWord("musical"), "capitalised spelling is correct");
const basePlan = { childId: "child", planDate: "2026-07-28", composerPolicyVersion: "test", schedulePolicyVersion: "test", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as any;
assert.equal(buildDynamicAffixAssignmentPlan({ basePlan, selection, payload }).partTwo.sections.flatMap((section: any) => section.items).length, 16);
const incomplete = { ...profile, wordsByCanonicalId: new Map(profile.wordsByCanonicalId) }; incomplete.wordsByCanonicalId.set("seasonal", { ...incomplete.wordsByCanonicalId.get("seasonal")!, trueMorphology: { ...incomplete.wordsByCanonicalId.get("seasonal")!.trueMorphology, provenance: {} } });
const incompleteSelection = selectDynamicAffixWordLab({ profiles: [incomplete], learningItems: [item] });
assert.equal(incompleteSelection ? compileDynamicAffixWordLabPayload(incompleteSelection) : null, null, "incomplete provenance fails before compilation");
console.log("Dynamic suffix -al regression passed.");
