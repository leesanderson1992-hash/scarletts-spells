import assert from "node:assert/strict";
import { compileDynamicAffixWordLabPayload, selectDynamicAffixWordLab, validateDynamicAffixWordLabPayload, type DynamicAffixProfile, type DynamicAffixWord } from "../lib/adle/morphology/affix-word-lab";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import { normaliseSessionWord } from "../lib/adle/session-correctness";

function word(id: string, base: string, teaching: string, display: string, transfer = true): DynamicAffixWord {
  const sentence = `Please spell ${display}.`;
  const part = (role: "base" | "suffix", text: string, sourceText: string, start: number, end: number) => ({ id: `${id}-${role}`, role, text, sourceText, start, end });
  const parts = [part("base", teaching, base, 0, teaching.length), part("suffix", "ness", "ness", teaching.length, display.length)];
  // Canonical morphology retains sourceText=happy while surfaceText=happi so
  // it still reconstructs the displayed word and records the transformation.
  const trueParts = [part("base", teaching, base, 0, teaching.length), part("suffix", "ness", "ness", teaching.length, display.length)];
  return { canonicalWordId: id, displayWord: display, audioText: sentence, semanticBaseText: base, semanticBaseKind: "base", teachingBaseText: teaching, baseMeaning: `the quality of being ${base}`, derivedMeaning: `the state of being ${base}`, effect: "state", affixVariant: "ness", parts, joins: [{ afterPartId: `${id}-base`, beforePartId: `${id}-suffix`, joinType: "none" }], splitPoints: [teaching.length], dictationSentence: sentence, dictationTargetTokenIndex: 2, trueMorphology: { parts: trueParts, joins: [{ afterPartId: `${id}-base`, beforePartId: `${id}-suffix`, joinType: "none" }], transformations: teaching === base ? [] : [{ type: "change_final_y_to_i" }], notes: teaching === base ? "No spelling change." : "Change final y to i before adding ness.", provenance: { source: "reviewed-test" } }, approvedTransfer: transfer };
}
const words = [word("kindness", "kind", "kind", "kindness"), word("darkness", "dark", "dark", "darkness"), word("sadness", "sad", "sad", "sadness"), word("happiness", "happy", "happi", "happiness")];
const profile: DynamicAffixProfile = { microSkillKey: "D4_MOR_SUFFIXES_NESS", position: "after", productionEnabled: true, affixLabel: "-ness", affixText: "ness", affixMeaning: "state or quality", meaningBins: [{ id: "state", label: "STATE OR QUALITY", description: "a state or quality" }], includeMeaningSort: false, wordsByCanonicalId: new Map(words.map((entry) => [entry.canonicalWordId, entry])), transferCanonicalWordIds: words.map((entry) => entry.canonicalWordId), choices: [{ text: "ness", label: "-ness", outcome: null, meaning: "state or quality", status: "target" }, { text: "nes", label: "-nes", outcome: null, meaning: null, status: "unsupported" }, { text: "niss", label: "-niss", outcome: null, meaning: null, status: "unsupported" }], reflection: { promptKey: "ness-notice", promptText: "What did -ness do to the word?" }, introduction: { title: "What is a suffix?", paragraphs: ["A suffix is added to the end of a word."], spellingRules: ["-ness is spelled n-e-s-s."], examples: [{ affix: "ness", base: "kind", word: "kindness", meaning: "the state of being kind" }] } };
const item = (id: string, date: string) => ({ learningItemId: id, childId: "child", canonicalWordId: id, microSkillKey: profile.microSkillKey, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: "verified", sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active" as const });
for (const count of [1, 2, 3, 4, 5]) {
  const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: words.slice(0, Math.min(count, 4)).map((entry, index) => item(entry.canonicalWordId, `2026-07-0${index + 1}`)) });
  assert(selection, `selects ${count} authentic targets with reviewed transfers`);
  const payload = compileDynamicAffixWordLabPayload(selection);
  assert(payload, `compiles immutable NESS payload at ${count}`);
  assert(validateDynamicAffixWordLabPayload(payload), `validates immutable NESS payload at ${count}`);
  assert.equal(payload.activities.guided.splitCanonicalWordIds.length, 2);
  assert.equal(payload.activities.guided.builds.length, 4);
  assert.equal(payload.activities.guided.includeMeaningSort, false);
}
const payload = compileDynamicAffixWordLabPayload(selectDynamicAffixWordLab({ profiles: [profile], learningItems: [item("happiness", "2026-07-01")] })!);
assert(payload);
const happiness = payload.words.lesson.find((entry) => entry.canonicalWordId === "happiness")!;
assert.equal(happiness.semanticBaseText, "happy");
assert.equal(happiness.teachingBaseText, "happi");
assert.deepEqual(happiness.splitPoints, [5]);
assert.equal(happiness.affixText, "ness");
assert.equal(`${happiness.teachingBaseText}${happiness.affixText}`, happiness.displayWord);
const runtime = dynamicAffixRuntime(payload);
assert(runtime, "adapts a valid suffix snapshot for the shared Word Lab");
assert.equal(runtime.activities.find((activity) => activity.type === "strip_build")?.assignmentBindings.length, 2);
assert.equal(runtime.activities.find((activity) => activity.type === "prefix_choice")?.affixTerm, "suffix");
assert.deepEqual(runtime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[0]?.paragraphs.slice(0, 2), ["A suffix is added to the end of a word.", "-ness is spelled n-e-s-s."]);
assert.equal(runtime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[0]?.meaningCallout, "The suffix -ness means state or quality.");
const builds = payload.activities.guided.builds;
assert.notDeepEqual(builds[0]!.choices.map((choice) => choice.text), builds[1]!.choices.map((choice) => choice.text), "suffix choices rotate deterministically between builds");
assert.equal(normaliseSessionWord("Happiness"), normaliseSessionWord("happiness"), "capitalised controlled spelling is correct");
assert.equal(selectDynamicAffixWordLab({ profiles: [{ ...profile, productionEnabled: false }], learningItems: [item("kindness", "2026-07-01")] }), null);

function ableIbleWord(id: string, base: string, display: string, affix: "able" | "ible", root = false): DynamicAffixWord {
  const sentence = `Please spell ${display}.`;
  const part = (role: "base" | "suffix", text: string, start: number, end: number) => ({ id: `${id}-${role}`, role, text, sourceText: text, start, end });
  const parts = [part("base", base, 0, base.length), part("suffix", affix, base.length, display.length)];
  return { canonicalWordId: id, displayWord: display, audioText: sentence, semanticBaseText: base, semanticBaseKind: root ? "root" : "base", teachingBaseText: base, baseMeaning: `${base} meaning`, derivedMeaning: `can be ${base}`, effect: "can_be", affixVariant: affix, parts, joins: [{ afterPartId: `${id}-base`, beforePartId: `${id}-suffix`, joinType: "none" }], splitPoints: [base.length], dictationSentence: sentence, dictationTargetTokenIndex: 2, trueMorphology: { parts, joins: [{ afterPartId: `${id}-base`, beforePartId: `${id}-suffix`, joinType: "none" }], transformations: [], notes: root ? `${base}- is a bound root.` : `${base} is a complete standalone word.`, provenance: { source: "reviewed-test" } }, approvedTransfer: true };
}
const ableIbleWords = [
  ableIbleWord("comfortable", "comfort", "comfortable", "able"),
  ableIbleWord("enjoyable", "enjoy", "enjoyable", "able"),
  ableIbleWord("possible", "poss", "possible", "ible", true),
  ableIbleWord("visible", "vis", "visible", "ible", true),
];
const ableIbleProfile: DynamicAffixProfile = {
  microSkillKey: "D4_MOR_SUFFIXES_ABLE_IBLE", position: "after", productionEnabled: true,
  affixLabel: "-able and -ible", affixText: "able/ible", affixMeaning: "can be",
  meaningBins: [{ id: "can_be", label: "CAN BE", description: "can be" }], includeMeaningSort: false,
  wordsByCanonicalId: new Map(ableIbleWords.map((entry) => [entry.canonicalWordId, entry])), transferCanonicalWordIds: ableIbleWords.map((entry) => entry.canonicalWordId),
  choices: [{ text: "able", label: "-able", outcome: null, meaning: "can be", status: "target" }, { text: "ible", label: "-ible", outcome: null, meaning: "can be", status: "target" }, { text: "abel", label: "-abel", outcome: null, meaning: null, status: "unsupported" }, { text: "ibel", label: "-ibel", outcome: null, meaning: null, status: "unsupported" }],
  reflection: { promptKey: "able-ible-base-test", promptText: "How did the complete-word or bound-root test help you choose -able or -ible?" },
  introduction: { title: "What are -able and -ible?", paragraphs: ["The suffixes -able and -ible both mean can be."], spellingRules: ["Use -able when the root word is a complete, recognisable standalone word: wash → washable.", "Use -ible when the base is not a full standalone word: sens- → sensible."], examples: [] },
};
const ableIbleItem = { ...item("comfortable", "2026-07-01"), microSkillKey: ableIbleProfile.microSkillKey };
const ableIbleSelection = selectDynamicAffixWordLab({ profiles: [ableIbleProfile], learningItems: [ableIbleItem] })!;
const ableIblePayload = compileDynamicAffixWordLabPayload(ableIbleSelection);
assert(ableIblePayload, "compiles complete -able/-ible facts");
assert.deepEqual(ableIblePayload.activities.guided.splitCanonicalWordIds.map((id) => ableIblePayload.words.lesson.find((word) => word.canonicalWordId === id)!.affixText), ["able", "ible"], "uses one cleaver per selected suffix form");
assert.equal(ableIblePayload.activities.guided.builds.length, 4);
assert.equal(ableIblePayload.activities.guided.includeMeaningSort, false);
assert(ableIblePayload.activities.introduction.spellingRules.includes("Use -able when the root word is a complete, recognisable standalone word: wash → washable."));
assert(ableIblePayload.activities.introduction.spellingRules.includes("Use -ible when the base is not a full standalone word: sens- → sensible."));
assert.notDeepEqual(ableIblePayload.activities.guided.builds[0]!.choices.map((choice) => choice.text), ableIblePayload.activities.guided.builds[1]!.choices.map((choice) => choice.text), "mixed suffix choices rotate deterministically");
const ableIbleRuntime = dynamicAffixRuntime(ableIblePayload)!;
assert.equal(ableIbleRuntime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[0]?.meaningCallout, "The suffixes -able and -ible mean can be.");
const basePlan = { childId: "child", planDate: "2026-07-27", composerPolicyVersion: "test", schedulePolicyVersion: "test", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as unknown as ComposedDailyPlan;
assert.equal(buildDynamicAffixAssignmentPlan({ basePlan, selection: ableIbleSelection, payload: ableIblePayload }).partTwo.sections.flatMap((section) => section.items).length, 16, "keeps the 16-item contract");
const incomplete = { ...ableIbleProfile, wordsByCanonicalId: new Map(ableIbleProfile.wordsByCanonicalId) };
incomplete.wordsByCanonicalId.set("visible", { ...ableIbleWords[3]!, dictationTargetTokenIndex: 0 });
assert.equal(compileDynamicAffixWordLabPayload(selectDynamicAffixWordLab({ profiles: [incomplete], learningItems: [ableIbleItem] })!), null, "fails closed when reviewed dictation facts are incomplete");
console.log("Dynamic suffix Word Lab regression passed.");
