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

const reviewed = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ity/reviewed-staging-package.json", "utf8"));
const statement = "-ity turns a describing word into the name of a quality or state.";
assert.equal(reviewed.profile.introContent.meaningStatement, statement);
assert.equal(JSON.stringify(reviewed).split(statement).length - 1, 1, "approved child rule appears exactly once");
assert.deepEqual(reviewed.words.map((word: any) => word.word), ["equality", "possibility", "responsibility", "curiosity"]);
assert.equal(reviewed.profile.includeMeaningSort, false);
assert.deepEqual(reviewed.profile.meaningBins, [{ id: "state_or_quality", label: "STATE OR QUALITY OF BEING", description: "the state or quality of being" }]);
assert.deepEqual(reviewed.words.map((word: any) => word.newWordMeaning), ["the state of being equal", "the state of being possible", "the state or duty of being responsible", "the quality of wanting to know"]);
const mapParts = (parts: any[]) => parts.map((part) => ({ id: part.id, role: part.kind, text: part.surfaceText, sourceText: part.sourceText, gloss: part.gloss, start: part.displayRange.start, end: part.displayRange.end }));
const mapJoins = (joins: any[]) => joins.map((join) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType }));
const toWord = (word: any): DynamicAffixWord => ({
  canonicalWordId: word.word, displayWord: word.word, audioText: word.dictation.audioText, semanticBaseText: word.semanticBaseText, semanticBaseKind: word.semanticBaseKind,
  teachingBaseText: word.teaching.parts.filter((part: any) => part.kind !== "suffix").map((part: any) => part.surfaceText).join(""), baseMeaning: word.baseMeaning, derivedMeaning: word.newWordMeaning, effect: word.meaningBinKey,
  affixVariant: word.suffixVariant, affixMeaning: "the state or quality of being", parts: mapParts(word.teaching.parts), joins: mapJoins(word.teaching.joins), splitPoints: [word.teaching.parts.find((part: any) => part.kind === "suffix").displayRange.start], dictationSentence: word.dictation.sentence, dictationTargetTokenIndex: word.dictation.targetTokenIndex,
  trueMorphology: { parts: mapParts(word.trueMorphology.parts), joins: mapJoins(word.trueMorphology.joins), transformations: word.trueMorphology.transformations, notes: word.trueMorphology.notes, provenance: word.trueMorphology.provenance }, approvedTransfer: true,
});
const words: DynamicAffixWord[] = (reviewed.words as any[]).map(toWord);
assert.deepEqual(words.map((word) => `${word.teachingBaseText}|${word.affixVariant}`), ["equal|ity", "possibil|ity", "responsibil|ity", "curios|ity"]);
for (const word of words) {
  assert.equal(word.splitPoints[0], word.teachingBaseText.length, `${word.displayWord}: suffix boundary is after teaching base`);
  assert.equal(`${word.teachingBaseText}${word.affixVariant}`, word.displayWord, `${word.displayWord}: child split reconstructs`);
  assert(word.trueMorphology.provenance && Object.keys(word.trueMorphology.provenance).length, `${word.displayWord}: provenance retained`);
}
assert.match(words[1].trueMorphology.notes, /possible/);
assert.match(words[2].trueMorphology.notes, /-ible/);
assert.match(words[3].trueMorphology.notes, /curious/);
const profile: DynamicAffixProfile = { microSkillKey: reviewed.profile.microSkillKey, position: "after", productionEnabled: true, affixLabel: "-ity", affixText: "ity", affixMeaning: "the state or quality of being", meaningBins: reviewed.profile.meaningBins, includeMeaningSort: false, wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])), choices: reviewed.profile.suffixChoices, reflection: reviewed.profile.reflection, introduction: reviewed.profile.introContent };
const item = { learningItemId: "ity", childId: "child", canonicalWordId: "equality", microSkillKey: profile.microSkillKey, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: "test", sourceAttemptText: "equalty", reteachPriority: false, ejectedOn: null, intakeOn: "2026-07-28", rowStatus: "active" as const };
const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: [item] });
assert(selection);
const payload = compileDynamicAffixWordLabPayload(selection);
assert(payload && validateDynamicAffixWordLabPayload(payload));
assertDynamicAffixSharedParity(selection, payload, "ITY reviewed fixture");
assert.deepEqual(payload.activities.guided.splitCanonicalWordIds, ["equality", "curiosity"], "direct and deterministically ranked spelling-change Cleavers are selected");
assert.equal(payload.activities.guided.builds.length, 4);
const positions = payload.activities.guided.builds.map((build) => { assert.deepEqual(new Set(build.choices.map((choice) => choice.text)), new Set(["ity", "ety", "ityy"])); return build.choices.findIndex((choice) => choice.status === "target"); });
assert(new Set(positions).size > 1, "target suffix position varies deterministically");
const runtime = dynamicAffixRuntime(payload);
assert(runtime && runtime.activities.filter((activity) => activity.type === "meaning_sort").length === 0, "no meaning sort or fallback cards");
assert.equal(runtime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[0]?.meaningCallout, statement);
assert.equal(normaliseSessionWord("Equality"), normaliseSessionWord("equality"), "capitalised spelling is correct");
const basePlan = { childId: "child", planDate: "2026-07-28", composerPolicyVersion: "test", schedulePolicyVersion: "test", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as any;
assert.equal(buildDynamicAffixAssignmentPlan({ basePlan, selection, payload }).partTwo.sections.flatMap((section: any) => section.items).length, 16);
const future = { ...words[0], canonicalWordId: "future-ity", displayWord: "clarity", audioText: "Clarity helps us understand.", semanticBaseText: "clear", teachingBaseText: "clar", dictationSentence: "Clarity helps us understand.", dictationTargetTokenIndex: 0, parts: [{ id: "base", role: "base" as const, text: "clar", sourceText: "clear", start: 0, end: 4 }, { id: "suffix", role: "suffix" as const, text: "ity", sourceText: "ity", start: 4, end: 7 }], joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" as const }], splitPoints: [4], trueMorphology: { ...words[0].trueMorphology, parts: [{ id: "base", role: "base" as const, text: "clar", sourceText: "clear", start: 0, end: 4 }, { id: "suffix", role: "suffix" as const, text: "ity", sourceText: "ity", start: 4, end: 7 }], notes: "clear → clar + ity", provenance: { reviewed: true } } };
const rosterProfile = { ...profile, wordsByCanonicalId: new Map([...profile.wordsByCanonicalId, [future.canonicalWordId, future]]) };
const rosterSelection = selectDynamicAffixWordLab({ profiles: [rosterProfile], learningItems: [{ ...item, canonicalWordId: future.canonicalWordId }] });
assert(rosterSelection && compileDynamicAffixWordLabPayload(rosterSelection), "a later complete, reviewed roster member can be assigned");
const incomplete = { ...profile, wordsByCanonicalId: new Map(profile.wordsByCanonicalId) }; incomplete.wordsByCanonicalId.set("curiosity", { ...incomplete.wordsByCanonicalId.get("curiosity")!, trueMorphology: { ...incomplete.wordsByCanonicalId.get("curiosity")!.trueMorphology, provenance: {} } });
const incompleteSelection = selectDynamicAffixWordLab({ profiles: [incomplete], learningItems: [item] });
assert.equal(incompleteSelection ? compileDynamicAffixWordLabPayload(incompleteSelection) : null, null, "incomplete provenance fails before compilation");
console.log("Dynamic suffix -ity regression passed.");
