import {
  BASE_WORD_GUIDED_DISPLAY_LIMIT,
  selectBaseWordFamilyLesson,
  type BaseWordFamilyMemberFact,
  type BaseWordFamilySelectionFacts,
} from "../lib/adle/base-word-family-selection";
import type { LearningItemFact } from "../lib/adle/learning-items";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const CHILD = "child";
const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
function item(id: string, word: string, date: string, sourceKind: LearningItemFact["sourceKind"] = "verified_misspelling"): LearningItemFact {
  return { learningItemId: id, childId: CHILD, canonicalWordId: word, microSkillKey: SKILL, itemStatus: "pending", sourceKind, sourceRef: id, sourceAttemptText: "misspelling", reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active" };
}
function member(baseFamilyKey: string, canonicalWordId: string, memberRole: "base" | "authentic_target" | "transfer", level = 1) {
  return { baseFamilyKey, canonicalWordId, memberRole, assignmentEligible: true, complexityLevel: level, rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const };
}
function facts(items: readonly LearningItemFact[], members: readonly BaseWordFamilyMemberFact[] = [
  member("PLAY", "play", "base"), member("PLAY", "replayed", "authentic_target"), member("PLAY", "replay", "transfer"), member("PLAY", "playing", "transfer"), member("PLAY", "playful", "transfer"), member("PLAY", "plays", "transfer"),
  member("GOVERN", "govern", "base"), member("GOVERN", "government", "authentic_target"), member("GOVERN", "governor", "transfer"),
]): BaseWordFamilySelectionFacts {
  return { learningItems: items, families: ["PLAY", "GOVERN"].map((baseFamilyKey) => ({ baseFamilyKey, microSkillKey: SKILL, rowStatus: "active", reviewStatus: "approved_for_first_exposure" })), members };
}

const mixed = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "replayed", "2026-07-01"), item("b", "government", "2026-07-02")]));
assert(mixed.baseFamilyKeys.join("|") === "PLAY|GOVERN", "different authentic families must share the diagnostic skill, not a family key");
assert(mixed.slots.length === 6 && mixed.slots.slice(0, 2).map((slot) => slot.canonicalWordId).join("|") === "replayed|government" && mixed.slots.filter((slot) => slot.provenance === "transfer" && slot.baseFamilyKey === "PLAY").length === 2 && mixed.slots.filter((slot) => slot.provenance === "transfer" && slot.baseFamilyKey === "GOVERN").length === 2, "two authentic targets must be followed by two safe transfers from each family");
assert(mixed.guidedFamilySections.flatMap((section) => section.guidedWordIds).length === BASE_WORD_GUIDED_DISPLAY_LIMIT, "guided display must retain the two family matrices at the eight-word cap");
assert(mixed.guidedFamilySections.every((section) => section.authenticTargetWordIds.every((word) => section.guidedWordIds.includes(word))), "guided display must retain authentic targets");

const same = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "replayed", "2026-07-01"), item("b", "replay", "2026-07-02")]));
assert(same.baseFamilyKeys.join("|") === "PLAY" && same.slots.length === 6, "two targets in one family remain supported");

const one = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "replayed", "2026-07-01")]));
assert(one.skipReasons.includes("insufficient_verified_authentic_targets"), "one authentic target must fail closed");

const probeOnly = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "replayed", "2026-07-01"), item("b", "government", "2026-07-02", "probe_miss")]));
assert(probeOnly.skipReasons.includes("insufficient_verified_authentic_targets"), "probe-only targets must not satisfy the trigger");

const noGovernTransfer = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "replayed", "2026-07-01"), item("b", "government", "2026-07-02")], facts([]).members.filter((entry) => entry.canonicalWordId !== "governor")));
assert(noGovernTransfer.skipReasons.includes("insufficient_eligible_family_transfer_words"), "a two-family six-word lesson needs both govern and its reviewed related example");

const missingSecondFamily = selectBaseWordFamilyLesson(CHILD, SKILL, { ...facts([item("a", "replayed", "2026-07-01"), item("b", "government", "2026-07-02")]), families: facts([]).families.filter((family) => family.baseFamilyKey !== "GOVERN") });
assert(missingSecondFamily.skipReasons.includes("authentic_target_missing_reviewed_family_member"), "the second authentic family must be present and reviewed");

const inReview = selectBaseWordFamilyLesson(CHILD, SKILL, { ...facts([item("a", "replayed", "2026-07-01"), item("b", "government", "2026-07-02")]), families: facts([]).families.map((family) => ({ ...family, reviewStatus: "in_review" })) });
assert(inReview.skipReasons.includes("authentic_target_missing_reviewed_family_member"), "in-review families must stay outside runtime selection");

console.log("adle-base-word-family-selection-regression: ok");
