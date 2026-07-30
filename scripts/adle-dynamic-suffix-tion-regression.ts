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

const packagePath = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-29-dynamic-suffix-tion/reviewed-staging-package.json";
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const loader = readFileSync("lib/adle/morphology/dynamic-suffix-profile-loader.ts", "utf8");
const importer = readFileSync("scripts/import-adle-dynamic-suffix-tion-staging-package.ts", "utf8");
const statement = "The suffix -tion usually means the action, process or result of.";
const reflectionPrompt = "We have been learning about -tion. How does -tion affect the word when it is added on?";

assert(loader.includes('"D4_MOR_SUFFIXES_TION"'), "-tion is an allowlisted dynamic suffix profile");
assert.equal(pkg.profile.microSkillKey, "D4_MOR_SUFFIXES_TION");
assert.equal(pkg.profile.introContent.meaningStatement, statement);
assert.equal(JSON.stringify(pkg).split(statement).length - 1, 1, "prominent suffix meaning appears exactly once");
assert(pkg.profile.introContent.paragraphs.includes("It often changes a verb into a noun — a naming word."), "introduction teaches the verb-to-noun change");
assert(pkg.profile.introContent.spellingRules.includes("General rule: -tion is often used after words ending in -t, -te or -ct."), "introduction teaches the reviewed ending pattern");
assert(!JSON.stringify(pkg.profile.introContent).includes("overlap or change"), "introduction omits the unnecessary Cleaver explanation");
assert.equal(pkg.profile.reflection.promptText, reflectionPrompt, "profile carries the shared reflection wording");
assert(pkg.profile.introContent.examples.some((example: any) => example.word === "collection"), "collection remains explainer-only");
assert.deepEqual(pkg.words.map((word: any) => word.word), ["action", "invention", "education", "celebration"]);
assert.equal(pkg.profile.includeMeaningSort, false);
assert.deepEqual(pkg.profile.meaningBins, [{ id: "action_process_result", label: "ACTION, PROCESS OR RESULT", description: "the action, process or result of" }]);
assert(importer.includes("expectedWords: [\"action\", \"invention\", \"education\", \"celebration\"]"), "guarded importer freezes the initial reviewed roster");

const parts = (value: any[]) => value.map((part) => ({ id: part.id, role: part.kind, text: part.surfaceText, sourceText: part.sourceText, gloss: part.gloss, start: part.displayRange.start, end: part.displayRange.end }));
const joins = (value: any[]) => value.map((join) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType }));
const words: DynamicAffixWord[] = pkg.words.map((word: any) => ({
  canonicalWordId: word.word, displayWord: word.word, audioText: word.dictation.audioText,
  semanticBaseText: word.semanticBaseText, semanticBaseKind: word.semanticBaseKind,
  teachingBaseText: word.teaching.parts.filter((part: any) => part.kind !== "suffix").map((part: any) => part.surfaceText).join(""),
  baseMeaning: word.baseMeaning, derivedMeaning: word.newWordMeaning, effect: word.meaningBinKey,
  affixVariant: word.suffixVariant, affixMeaning: word.teaching.parts.find((part: any) => part.kind === "suffix")?.gloss,
  parts: parts(word.teaching.parts), joins: joins(word.teaching.joins), splitPoints: [word.teaching.parts.find((part: any) => part.kind === "suffix").displayRange.start],
  dictationSentence: word.dictation.sentence, dictationTargetTokenIndex: word.dictation.targetTokenIndex,
  trueMorphology: { parts: parts(word.trueMorphology.parts), joins: joins(word.trueMorphology.joins), transformations: word.trueMorphology.transformations, notes: word.trueMorphology.notes, provenance: word.trueMorphology.provenance }, approvedTransfer: true,
}));
const expected = new Map([["action", "ac"], ["invention", "inven"], ["education", "educa"], ["celebration", "celebra"]]);
for (const word of words) {
  assert.equal(word.affixVariant, "tion");
  assert.equal(word.teachingBaseText, expected.get(word.displayWord));
  assert.equal(word.splitPoints[0], word.teachingBaseText.length);
  assert.equal(word.displayWord.slice(word.splitPoints[0]), "tion", `${word.displayWord} cleaves immediately before -tion`);
  assert.equal(`${word.teachingBaseText}tion`, word.displayWord);
  assert.notEqual(word.semanticBaseText, word.teachingBaseText, "semantic verb is never simplified for the child cleaver");
  assert.equal(word.parts.map((part) => part.text).join(""), word.displayWord);
  assert.equal(word.trueMorphology.parts.map((part) => part.text).join(""), word.displayWord);
  assert(word.trueMorphology.provenance && Object.keys(word.trueMorphology.provenance).length > 0);
}
assert.deepEqual(pkg.words.map((word: any) => [word.baseMeaning, word.newWordMeaning]), [
  ["to do something", "the process of acting"],
  ["to create something new", "something that has been invented"],
  ["to teach or give knowledge", "the process of educating"],
  ["to do something special because of a happy event", "the act of celebrating"],
]);

const profile: DynamicAffixProfile = {
  microSkillKey: pkg.profile.microSkillKey, position: "after", productionEnabled: true, affixLabel: "-tion", affixText: "tion", affixMeaning: pkg.profile.suffixMeaning,
  meaningBins: pkg.profile.meaningBins, includeMeaningSort: false, wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])), transferCanonicalWordIds: words.map((word) => word.canonicalWordId), choices: pkg.profile.suffixChoices, reflection: pkg.profile.reflection, introduction: pkg.profile.introContent,
};
const item = { learningItemId: "tion-item", childId: "child", canonicalWordId: "invention", microSkillKey: profile.microSkillKey, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: "test", sourceAttemptText: "invenshun", reteachPriority: false, ejectedOn: null, intakeOn: "2026-07-29", rowStatus: "active" as const };
const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: [item] });
assert(selection, "reviewed -tion profile is selected only for its own learning item");
const payload = compileDynamicAffixWordLabPayload(selection);
assert(payload && validateDynamicAffixWordLabPayload(payload), "valid reviewed profile compiles");
assert.equal(payload.activities.guided.includeMeaningSort, false);
assert.equal(payload.activities.guided.splitCanonicalWordIds.length, 2);
assert.equal(payload.activities.guided.builds.length, 4);
const targetPositions = payload.activities.guided.builds.map((build) => {
  assert.deepEqual(new Set(build.choices.map((choice) => choice.text)), new Set(["tion", "sion", "cion"]));
  assert.equal(build.baseWord + "tion", payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId)?.displayWord);
  return build.choices.findIndex((choice) => choice.status === "target");
});
assert(new Set(targetPositions).size > 1, "correct suffix tile ordering varies deterministically");
const runtime = dynamicAffixRuntime(payload);
assert(runtime && runtime.activities.filter((activity) => activity.type === "meaning_sort").length === 0, "no sort or fallback meaning cards");
assert.equal(runtime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[0]?.meaningCallout, statement);
assert.equal(runtime.activities.find((activity) => activity.type === "reflection")?.promptText, reflectionPrompt, "shared runtime uses the child-friendly affix reflection question");
assert.equal(normaliseSessionWord("Invention"), normaliseSessionWord("invention"), "capitalised controlled spelling is correct");
const basePlan = { childId: "child", planDate: "2026-07-29", composerPolicyVersion: "test", schedulePolicyVersion: "test", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as any;
assert.equal(buildDynamicAffixAssignmentPlan({ basePlan, selection, payload }).partTwo.sections.flatMap((section: any) => section.items).length, 16, "keeps immutable sixteen-item contract");
const incomplete = { ...profile, wordsByCanonicalId: new Map(profile.wordsByCanonicalId) };
incomplete.wordsByCanonicalId.set("invention", { ...incomplete.wordsByCanonicalId.get("invention")!, trueMorphology: { ...incomplete.wordsByCanonicalId.get("invention")!.trueMorphology, provenance: {} } });
assert.equal(compileDynamicAffixWordLabPayload(selectDynamicAffixWordLab({ profiles: [incomplete], learningItems: [item] })!), null, "missing provenance fails closed");
assert.equal(selectDynamicAffixWordLab({ profiles: [{ ...profile, productionEnabled: false }], learningItems: [item] }), null, "production-disabled profile is isolated outside staging");
console.log("Dynamic suffix -tion regression passed.");
