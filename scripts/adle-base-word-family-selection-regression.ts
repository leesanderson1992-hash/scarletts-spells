import {
  BASE_WORD_GUIDED_DISPLAY_LIMIT,
  selectBaseWordFamilyLesson,
  type BaseWordFamilyMemberFact,
  type BaseWordFamilySelectionFacts,
} from "../lib/adle/base-word-family-selection";
import type { LearningItemFact } from "../lib/adle/learning-items";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const CHILD = "child";
const SKILL = "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX";

function item(id: string, word: string, date: string, sourceKind: LearningItemFact["sourceKind"] = "verified_misspelling"): LearningItemFact {
  return { learningItemId: id, childId: CHILD, canonicalWordId: word, microSkillKey: SKILL, itemStatus: "pending", sourceKind, sourceRef: `authentic:${id}`, sourceAttemptText: "misspelling", reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active" };
}

function member(baseFamilyKey: string, canonicalWordId: string, memberRole: BaseWordFamilyMemberFact["memberRole"], level = 1, assignmentEligible = true, applicableMicroSkillKeys: readonly string[] = [SKILL]): BaseWordFamilyMemberFact {
  return { baseFamilyKey, canonicalWordId, memberRole, applicableMicroSkillKeys, assignmentEligible, complexityLevel: level, rowStatus: "active", reviewStatus: "approved_for_first_exposure" };
}

const members: BaseWordFamilyMemberFact[] = [
  member("CARE", "care", "base"), member("CARE", "careful", "transfer"), member("CARE", "careless", "optional_transfer_check"), member("CARE", "caring", "transfer"), member("CARE", "cared", "transfer"),
  member("GOVERN", "govern", "base"), member("GOVERN", "government", "transfer"), member("GOVERN", "governor", "optional_transfer_check"), member("GOVERN", "governing", "transfer"),
  member("PAINT", "paint", "base"), member("PAINT", "painter", "transfer"), member("PAINT", "painted", "transfer"),
];

function facts(items: readonly LearningItemFact[], overrides: Partial<BaseWordFamilySelectionFacts> = {}): BaseWordFamilySelectionFacts {
  return {
    familyAuthoritySchemaVersion: 2,
    learningItems: items,
    families: ["CARE", "GOVERN", "PAINT"].map((baseFamilyKey) => ({ baseFamilyKey, microSkillKey: SKILL, rowStatus: "active", reviewStatus: "approved_for_first_exposure" })),
    members,
    ...overrides,
  };
}

const queue = [
  item("careful-oldest", "careful", "2026-07-01"),
  item("careless-second", "careless", "2026-07-02"),
  item("government-third", "government", "2026-07-03"),
  item("governor-fourth", "governor", "2026-07-04"),
];
const selected = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue));
assert(selected.skipReasons.length === 0, "a reviewed base-led two-family queue must be ready");
assert(selected.baseFamilyKeys.join("|") === "CARE|GOVERN", "the oldest valid two-family pair selects CARE then GOVERN");
assert(selected.slots.slice(0, 2).map((slot) => slot.canonicalWordId).join("|") === "careful|government", "the selector skips a same-family second item and finds the earliest valid partner");
const queued = selected.slots.filter((slot) => slot.assignmentRole === "queued_family_practice");
assert(queued.map((slot) => slot.canonicalWordId).join("|") === "careless|governor", "other queued misspellings in selected families win remaining slots oldest-first");
assert(queued.every((slot) => slot.learningItemId && slot.learnerProvenance === "verified_misspelling"), "queued family practice retains genuine learner provenance and learning-item identity");
const generated = selected.slots.filter((slot) => slot.assignmentRole === "generated_family_practice");
assert(generated.length === 2 && generated.every((slot) => slot.learningItemId === null && slot.learnerProvenance === "generated_family_practice"), "only unfilled slots become generated family practice");
assert(selected.slots.length === 6 && new Set(selected.slots.map((slot) => slot.canonicalWordId)).size === 6, "the independent contract remains six distinct words");
assert(selected.guidedFamilySections.flatMap((section) => section.guidedWordIds).length <= BASE_WORD_GUIDED_DISPLAY_LIMIT, "the guided family display remains capped at eight words");

const sameFamilyThenPartner = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 3)));
assert(sameFamilyThenPartner.skipReasons.length === 0, "two oldest words in one family do not fail when a later distinct family is eligible");
const onlyOneFamily = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 2)));
assert(onlyOneFamily.skipReasons.includes("two_distinct_authentic_families_required"), "fewer than two eligible families fails closed");

const noPermanentRoles = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("care", "care", "2026-07-01"), item("paint", "paint", "2026-07-02"),
], { members: [
  member("CARE", "care", "base"), member("CARE", "careless", "optional_transfer_check"), member("CARE", "caring", "optional_transfer_check"),
  member("PAINT", "paint", "base"), member("PAINT", "painter", "optional_transfer_check"), member("PAINT", "painted", "optional_transfer_check"),
] }));
assert(noPermanentRoles.skipReasons.length === 0 && noPermanentRoles.slots.slice(0, 2).every((slot) => slot.assignmentRole === "primary_authentic_target"), "genuine verified misses can be primary targets even when their structural role is base");
assert(noPermanentRoles.slots.some((slot) => slot.canonicalWordId === "careless"), "an eligible governed member needs no permanent transfer role");

const wrongSkill = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue, {
  members: members.map((entry) => ({ ...entry, applicableMicroSkillKeys: ["D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX"] })),
}));
assert(wrongSkill.skipReasons.includes("authentic_target_missing_reviewed_family_member"), "a family relationship not reviewed for the exact diagnosed skill remains ineligible");
const ineligible = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 3), {
  members: members.map((entry) => entry.canonicalWordId === "government" ? { ...entry, assignmentEligible: false } : entry),
}));
assert(ineligible.baseFamilyKeys.includes("PAINT") === false && ineligible.slots.length === 0, "an ineligible required family relationship cannot be substituted with unrelated filler");

const closureFiltered = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 3), {
  members: members.map((entry) => entry.canonicalWordId === "care" || entry.canonicalWordId === "caring"
    ? { ...entry, lessonContentEligible: false }
    : entry),
}));
assert(closureFiltered.skipReasons.includes("authentic_target_missing_reviewed_family_member"), "a family without its immutable base-word closure fails before assignment selection");
const generatedClosureFiltered = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 3), {
  members: members.map((entry) => entry.canonicalWordId === "governor" ? { ...entry, lessonContentEligible: false } : entry),
}));
assert(generatedClosureFiltered.skipReasons.length === 0 && generatedClosureFiltered.slots.every((slot) => slot.canonicalWordId !== "governor"), "generated practice skips a member missing from the exact dictionary closure and uses another eligible family member");

const unrelatedQueued = selectBaseWordFamilyLesson(CHILD, SKILL, facts([...queue.slice(0, 3), item("painter-queue", "painter", "2026-07-01")]));
assert(unrelatedQueued.baseFamilyKeys.join("|") === "PAINT|CARE" || unrelatedQueued.baseFamilyKeys.join("|") === "CARE|PAINT", "an older third-family miss may legitimately become a primary family");
assert(unrelatedQueued.slots.every((slot) => unrelatedQueued.baseFamilyKeys.includes(slot.baseFamilyKey)), "no word outside the selected two families fills a slot");

const legacy = selectBaseWordFamilyLesson(CHILD, SKILL, {
  ...facts([item("legacy-careful", "careful", "2026-07-01"), item("legacy-government", "government", "2026-07-02"), item("legacy-careless", "careless", "2026-07-03")]),
  familyAuthoritySchemaVersion: 1,
  members: members.map((entry) => ({ ...entry, memberRole: ["careful", "government", "careless"].includes(entry.canonicalWordId) ? "authentic_target" : entry.memberRole })),
});
assert(legacy.slots.filter((slot) => slot.learnerProvenance === "verified_misspelling").length === 2, "immutable v1 authorities retain their historical two-target semantics");

const probeOnly = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("careful", "careful", "2026-07-01"), item("government", "government", "2026-07-02", "probe_miss")]));
assert(probeOnly.skipReasons.includes("insufficient_verified_authentic_targets"), "non-authentic source kinds cannot trigger Base Word family selection");

console.log("adle-base-word-family-selection-regression: ok");
