/* Reviewed fixture objects are deliberately asserted at runtime. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileDynamicAffixWordLabPayload, selectDynamicAffixWordLab, validateDynamicAffixWordLabPayload, type DynamicAffixProfile, type DynamicAffixWord } from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { normaliseSessionWord } from "../lib/adle/session-correctness";
import { assertDynamicAffixSharedParity } from "./lib/adle-shared-affix-parity-fixtures";

const packagePath = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-29-dynamic-suffix-sion/reviewed-staging-package.json";
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const loader = readFileSync("lib/adle/morphology/dynamic-suffix-profile-loader.ts", "utf8");
const importer = readFileSync("scripts/import-adle-dynamic-suffix-sion-staging-package.ts", "utf8");
const rule = "-sion turns an action into the name of the action or result.";
const reflectionPrompt = "We have been learning about -sion. How does -sion affect the word when it is added on?";

assert(loader.includes('"D4_MOR_SUFFIXES_SION"'), "-sion is allowlisted");
assert.equal(pkg.profile.microSkillKey, "D4_MOR_SUFFIXES_SION");
assert.equal(pkg.profile.introContent.meaningStatement, rule);
assert.equal(JSON.stringify(pkg).split(rule).length - 1, 1, "approved rule appears once");
assert(pkg.profile.introContent.paragraphs.includes("The suffix -sion usually means the action, process or result of."));
assert(pkg.profile.introContent.spellingRules.some((text: string) => text.includes("-d or -de")));
assert(pkg.profile.introContent.spellingRules.some((text: string) => text.includes("-s or -se") && text.includes("-mit")));
assert(pkg.profile.introContent.spellingRules.some((text: string) => text.includes("zhun") && text.includes("vision") && text.includes("explosion")));
assert(pkg.profile.introContent.examples.some((example: any) => example.word === "revision"), "revision remains explainer-only");
assert.deepEqual(pkg.words.map((word: any) => word.word), ["decision", "division", "confusion", "expansion"]);
assert.equal(pkg.profile.includeMeaningSort, false);
assert.deepEqual(pkg.profile.meaningBins, [{ id: "action_process_result", label: "ACTION, PROCESS OR RESULT", description: "the action, process or result of" }]);
assert.equal(pkg.profile.reflection.promptText, reflectionPrompt);
assert(importer.includes('expectedWords: ["decision", "division", "confusion", "expansion"]'));

const parts = (value: any[]) => value.map((part) => ({ id: part.id, role: part.kind, text: part.surfaceText, sourceText: part.sourceText, gloss: part.gloss, start: part.displayRange.start, end: part.displayRange.end }));
const joins = (value: any[]) => value.map((join) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType }));
const words: DynamicAffixWord[] = pkg.words.map((word: any) => ({ canonicalWordId: word.word, displayWord: word.word, audioText: word.dictation.audioText, semanticBaseText: word.semanticBaseText, semanticBaseKind: word.semanticBaseKind, teachingBaseText: word.teaching.parts.filter((part: any) => part.kind !== "suffix").map((part: any) => part.surfaceText).join(""), baseMeaning: word.baseMeaning, derivedMeaning: word.newWordMeaning, effect: word.meaningBinKey, affixVariant: word.suffixVariant, affixMeaning: word.teaching.parts.find((part: any) => part.kind === "suffix")?.gloss, parts: parts(word.teaching.parts), joins: joins(word.teaching.joins), splitPoints: [word.teaching.parts.find((part: any) => part.kind === "suffix").displayRange.start], dictationSentence: word.dictation.sentence, dictationTargetTokenIndex: word.dictation.targetTokenIndex, trueMorphology: { parts: parts(word.trueMorphology.parts), joins: joins(word.trueMorphology.joins), transformations: word.trueMorphology.transformations, notes: word.trueMorphology.notes, provenance: word.trueMorphology.provenance }, approvedTransfer: true }));
const expected = new Map([["decision", "deci"], ["division", "divi"], ["confusion", "confu"], ["expansion", "expan"]]);
for (const word of words) {
  assert.equal(word.affixVariant, "sion");
  assert.equal(word.teachingBaseText, expected.get(word.displayWord));
  assert.equal(word.splitPoints[0], word.teachingBaseText.length);
  assert.equal(word.displayWord.slice(word.splitPoints[0]), "sion", `${word.displayWord} cleaves before -sion`);
  assert.equal(`${word.teachingBaseText}sion`, word.displayWord);
  assert.notEqual(word.semanticBaseText, word.teachingBaseText, "semantic base stays separate");
  assert.equal(word.parts.map((part) => part.text).join(""), word.displayWord);
  assert.equal(word.trueMorphology.parts.map((part) => part.text).join(""), word.displayWord);
  assert(word.trueMorphology.provenance && Object.keys(word.trueMorphology.provenance).length > 0);
}
assert.deepEqual(pkg.words.map((word: any) => [word.baseMeaning, word.newWordMeaning]), [["to choose after thinking", "the result of deciding"], ["to separate into parts", "the action of dividing"], ["to make someone unable to understand", "the state of being confused"], ["to become larger", "the process of expanding"]]);

const profile: DynamicAffixProfile = { microSkillKey: pkg.profile.microSkillKey, position: "after", productionEnabled: true, affixLabel: "-sion", affixText: "sion", affixMeaning: pkg.profile.suffixMeaning, meaningBins: pkg.profile.meaningBins, includeMeaningSort: false, wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])), transferCanonicalWordIds: words.map((word) => word.canonicalWordId), choices: pkg.profile.suffixChoices, reflection: pkg.profile.reflection, introduction: pkg.profile.introContent };
const item = { learningItemId: "sion-item", childId: "child", canonicalWordId: "decision", microSkillKey: profile.microSkillKey, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: "test", sourceAttemptText: "decishun", reteachPriority: false, ejectedOn: null, intakeOn: "2026-07-29", rowStatus: "active" as const };
const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: [item] }); assert(selection);
const payload = compileDynamicAffixWordLabPayload(selection); assert(payload && validateDynamicAffixWordLabPayload(payload));
assertDynamicAffixSharedParity(selection, payload, "SION reviewed fixture");
assert.equal(payload.activities.guided.includeMeaningSort, false); assert.equal(payload.activities.guided.splitCanonicalWordIds.length, 2); assert.equal(payload.activities.guided.builds.length, 4);
const positions = payload.activities.guided.builds.map((build) => { assert.deepEqual(new Set(build.choices.map((choice) => choice.text)), new Set(["sion", "tion", "cion"])); assert.equal(build.baseWord + "sion", payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId)?.displayWord); return build.choices.findIndex((choice) => choice.status === "target"); });
assert(new Set(positions).size > 1, "correct suffix tile ordering varies deterministically");
const runtime = dynamicAffixRuntime(payload); assert(runtime && runtime.activities.filter((activity) => activity.type === "meaning_sort").length === 0); assert.equal(runtime.activities.find((activity) => activity.type === "introduction")?.introScreens?.[0]?.meaningCallout, rule); assert.equal(runtime.activities.find((activity) => activity.type === "reflection")?.promptText, reflectionPrompt);
assert.equal(normaliseSessionWord("Decision"), normaliseSessionWord("decision"));
const basePlan = { childId: "child", planDate: "2026-07-29", composerPolicyVersion: "test", schedulePolicyVersion: "test", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as any;
assert.equal(buildDynamicAffixAssignmentPlan({ basePlan, selection, payload }).partTwo.sections.flatMap((section: any) => section.items).length, 16);
const incomplete = { ...profile, wordsByCanonicalId: new Map(profile.wordsByCanonicalId) }; incomplete.wordsByCanonicalId.set("decision", { ...incomplete.wordsByCanonicalId.get("decision")!, trueMorphology: { ...incomplete.wordsByCanonicalId.get("decision")!.trueMorphology, provenance: {} } });
assert.equal(compileDynamicAffixWordLabPayload(selectDynamicAffixWordLab({ profiles: [incomplete], learningItems: [item] })!), null, "missing provenance fails closed");
assert.equal(selectDynamicAffixWordLab({ profiles: [{ ...profile, productionEnabled: false }], learningItems: [item] }), null, "production-disabled profile is isolated outside staging");
console.log("Dynamic suffix -sion regression passed.");
