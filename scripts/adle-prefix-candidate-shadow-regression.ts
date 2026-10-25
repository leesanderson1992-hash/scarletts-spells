import assert from "node:assert/strict";
import { compareDynamicPrefixCandidates } from "../lib/adle/morphology/prefix-candidate-shadow";
import { excludeDeassignedDynamicPrefixWords } from "../lib/adle/morphology/dynamic-prefix-pair-eligibility";
import { canonicalPairKey } from "../lib/adle/word-skill-relationships/pair-key";
import { selectDynamicPrefixWordLab } from "../lib/adle/morphology/dynamic-prefix-word-lab";
import type { DynamicPrefixProfile, DynamicPrefixWord } from "../lib/adle/morphology/dynamic-prefix-word-lab";
import type { LearningItemFact } from "../lib/adle/learning-items";
import type { WordRouteStatus } from "../lib/teaching-dictionary-manager/word-route-status";

const skill = "D4_MOR_PREFIXES_UN";
function word(id: string, displayWord: string): DynamicPrefixWord {
  const base = displayWord.slice(2);
  const sentence = `Please write ${displayWord}.`;
  return { canonicalWordId: id, displayWord, audioText: sentence, baseWord: base,
    baseMeaning: `meaning of ${base}`, derivedMeaning: `meaning of ${displayWord}`, effect: "not",
    parts: [{ id: `${id}-prefix`, text: "un", sourceText: "un", role: "prefix", start: 0, end: 2 },
      { id: `${id}-base`, text: base, sourceText: base, role: "base", start: 2, end: displayWord.length }],
    joins: [{ afterPartId: `${id}-prefix`, beforePartId: `${id}-base`, joinType: "none" }],
    splitPoints: [2], dictationSentence: sentence, dictationTargetTokenIndex: 2, approvedTransfer: true };
}
const words = [word("a", "unfair"), word("b", "unkind"), word("c", "untidy"), word("d", "unwell")];
const profile: DynamicPrefixProfile = { microSkillKey: skill, productionEnabled: true,
  prefixText: "un", prefixLabel: "un-", prefixMeaning: "not", meaningBins: [{ id: "not", label: "NOT", description: "not" }, { id: "reverse", label: "REVERSE", description: "reverse" }],
  wordsByCanonicalId: new Map(words.map((entry) => [entry.canonicalWordId, entry])),
  transferCanonicalWordIds: words.map((entry) => entry.canonicalWordId),
  prefixChoices: [{ text: "un", label: "un-", outcome: "unfair", meaning: "not fair", status: "target" }],
  reflection: { promptKey: "prefix-notice-v2", promptText: "What did the prefix change?" } };
const item: LearningItemFact = { learningItemId: "item-a", childId: "child", canonicalWordId: "a", microSkillKey: skill,
  itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "synthetic", sourceAttemptText: "private",
  reteachPriority: false, ejectedOn: null, intakeOn: "2026-10-25", rowStatus: "active" };
const status = (wordId: string, administrativeCandidate: boolean) =>
  ({ wordId, routeId: "dynamic_prefix_word_lab", microSkillKey: skill, administrativeCandidate }) as WordRouteStatus;
const report = compareDynamicPrefixCandidates({ microSkillKey: skill,
  statuses: [status("a", true), status("b", true), status("c", true), status("d", false), status("x", true)],
  profiles: [profile], learningItems: [item] });
assert.deepEqual(report.presentInBoth, ["a", "b", "c"]);
assert.deepEqual(report.governedOnly, ["x"], "eligible but absent native member is flagged, not admitted");
assert.deepEqual(report.nativeOnly, ["d"], "native member lacking governed status is flagged");
assert.deepEqual(report.nativeSelectedIds, ["a", "b", "c", "d"], "shadow observes actual native four-word selection");
assert.deepEqual(report.selectedWithoutAdminAdmission, ["d"], "selection and administrative admission stay distinct");
assert.equal(report.routeActivated, false);
assert.equal(report.routeReleased, false);
assert.equal(report.nativeSelectionCompiles, true);
assert.equal(report.nativeCompilerBlockerCode, null);
const disabled = compareDynamicPrefixCandidates({ microSkillKey: skill, statuses: [status("a", false)],
  profiles: [{ ...profile, productionEnabled: false }], learningItems: [item] });
assert.deepEqual(disabled.nativePoolIds, []);
assert.deepEqual(disabled.nativeSelectedIds, []);
assert.equal(disabled.nativeSelectionCompiles, false);
const withdrawn = new Set([canonicalPairKey("d", skill)]);
const filtered = excludeDeassignedDynamicPrefixWords([profile], withdrawn);
assert.equal(selectDynamicPrefixWordLab({ profiles: filtered, learningItems: [item] }), null,
  "with only three approved words the native selector must refuse a lesson");
assert.equal(profile.wordsByCanonicalId.size, 4, "the reviewed source profile remains unchanged");
const replacement = word("e", "unhappy");
const fiveWordProfile = { ...profile, wordsByCanonicalId: new Map([...profile.wordsByCanonicalId, ["e", replacement]]),
  transferCanonicalWordIds: [...profile.transferCanonicalWordIds, "e"] };
const replacementSelection = selectDynamicPrefixWordLab({
  profiles: excludeDeassignedDynamicPrefixWords([fiveWordProfile], withdrawn), learningItems: [item],
});
assert.deepEqual(replacementSelection?.transfers.map((entry) => entry.canonicalWordId), ["b", "c", "e"],
  "a reviewed alternative replaces the withdrawn transfer word");
console.log("ADLE prefix candidate shadow regression passed.");
