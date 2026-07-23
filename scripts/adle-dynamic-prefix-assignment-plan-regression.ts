import { strict as assert } from "node:assert";
import { buildDynamicPrefixAssignmentPlan } from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab, type DynamicPrefixProfile } from "../lib/adle/morphology/dynamic-prefix-word-lab";

const makeWord = (id: string, displayWord: string) => { const dictationSentence = `Use ${displayWord}.`; return { canonicalWordId: id, displayWord, audioText: dictationSentence, baseWord: displayWord.slice(2), baseMeaning: "base", derivedMeaning: "derived", effect: "not" as const, parts: [{ id: `${id}:p`, text: "un", sourceText: "un", role: "prefix" as const, start: 0, end: 2 }, { id: `${id}:b`, text: displayWord.slice(2), sourceText: displayWord.slice(2), role: "base" as const, start: 2, end: displayWord.length }], joins: [{ afterPartId: `${id}:p`, beforePartId: `${id}:b`, joinType: "none" as const }], splitPoints: [2], dictationSentence, dictationTargetTokenIndex: 1, approvedTransfer: true }; };
const profile: DynamicPrefixProfile = { microSkillKey: "D4_MOR_PREFIXES_UN", productionEnabled: true, prefixText: "un", prefixLabel: "un-", prefixMeaning: "not", meaningBins: [{ id: "not", label: "NOT", description: "not" }, { id: "reverse", label: "REVERSE", description: "reverse" }], wordsByCanonicalId: new Map([makeWord("a", "unone"), makeWord("t1", "untwo"), makeWord("t2", "unthree"), makeWord("t3", "unfour")].map((word) => [word.canonicalWordId, word])), transferCanonicalWordIds: ["t1", "t2", "t3"], prefixChoices: [{ text: "un", label: "un-", outcome: "correct", meaning: "not", status: "target" }], reflection: { promptKey: "test", promptText: "Notice it." } };
const authentic = { learningItemId: "li-authentic", childId: "child", canonicalWordId: "a", microSkillKey: profile.microSkillKey, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: "verified", sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: "2026-07-21", rowStatus: "active" as const };
const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [authentic] })!;
const payload = compileDynamicPrefixWordLabPayload(selection)!;
const base: any = { childId: "child", planDate: "2026-07-21", composerPolicyVersion: "c", schedulePolicyVersion: "s", throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } };
const plan = buildDynamicPrefixAssignmentPlan({ basePlan: base, facts: {} as any, selection, payload });
const all = plan.partTwo.sections.flatMap((section) => section.items);
assert.equal(all.length, 16);
assert.equal(all.find((item) => item.payload.dynamicPrefixActivityId === "intro-root")?.payload.dynamicPrefixLesson, payload);
const production = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_production")!.items;
assert.equal(production.filter((item) => item.learningItemId !== null).length, 1);
assert.equal(production.filter((item) => item.learningItemId === null).length, 3);
console.log("PASS: Dynamic Prefix v2 plan persists four words and links authentic targets only");
