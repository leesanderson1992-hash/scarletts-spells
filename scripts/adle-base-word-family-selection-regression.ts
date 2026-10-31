import { baseWordFamilyMemberSelectionRole, type BaseWordFamilyAuthorityMember } from "../lib/adle/curriculum-release-activation";
import {
  BASE_WORD_GUIDED_DISPLAY_LIMIT,
  selectBaseWordFamilyLesson,
  type BaseWordFamilyMemberFact,
  type BaseWordFamilySelectionFacts,
} from "../lib/adle/base-word-family-selection";
import type { LearningItemFact } from "../lib/adle/learning-items";
import { reviewedBaseWordRegularity } from "../lib/adle/base-word-regularity";

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
const vetoedFamilyWord = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue, {
  excludedCanonicalWordIds: new Set(["governor"]),
}));
assert(vetoedFamilyWord.skipReasons.length === 0 &&
  !vetoedFamilyWord.slots.some((slot) => slot.canonicalWordId === "governor") &&
  !vetoedFamilyWord.guidedFamilySections.some((section) => section.guidedWordIds.includes("governor")),
"a governed de-assignment excludes queued, generated, and guided family use");
const vetoedAuthenticTarget = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 3), {
  excludedCanonicalWordIds: new Set(["government"]),
}));
assert(vetoedAuthenticTarget.slots.length === 0,
  "a de-assigned authentic word cannot select its family");

const twoPlusFour = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("careful-two", "careful", "2026-07-01"),
  item("government-four", "government", "2026-07-02"),
], { families: facts([]).families.filter((family) => family.baseFamilyKey !== "PAINT"),
  members: [member("CARE", "care", "base"), member("CARE", "careful", "transfer"),
    member("GOVERN", "govern", "base"), member("GOVERN", "government", "transfer"),
    member("GOVERN", "governor", "transfer"), member("GOVERN", "governing", "transfer")] }));
assert(twoPlusFour.skipReasons.length === 0 && twoPlusFour.slots.length === 6,
  "a reviewed two-member family and four-member family fill one lesson together");
const shortlisted = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("careful-old", "careful", "2026-07-01"),
  item("government-middle", "government", "2026-07-02"),
  item("painter-new", "painter", "2026-07-03"),
], { eligibleFamilyPairs: [["CARE", "PAINT"]] }));
assert(shortlisted.baseFamilyKeys.join("|") === "CARE|PAINT",
  "the detailed selector uses a valid frozen-count pair when an older pair is not shortlisted");

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
  members: members.map((entry) => ({ ...entry, memberRole: baseWordFamilyMemberSelectionRole({schemaVersion:1}, {...entry, memberRole: ["careful", "government", "careless"].includes(entry.canonicalWordId) ? "authentic_target" : entry.memberRole} as unknown as BaseWordFamilyAuthorityMember) })),
});
assert(legacy.slots.filter((slot) => slot.learnerProvenance === "verified_misspelling").length === 2, "immutable v1 authorities retain their historical two-target semantics");

const probeOnly = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("careful", "careful", "2026-07-01"), item("government", "government", "2026-07-02", "probe_miss")]));
assert(probeOnly.skipReasons.includes("insufficient_verified_authentic_targets"), "non-authentic source kinds cannot trigger Base Word family selection");

const irregular = reviewedBaseWordRegularity({ relationshipKind: "irregular_inflection", transformations: [{ kind: "irregular_form" }], reviewed: true });
const suffixChange = reviewedBaseWordRegularity({ relationshipKind: "regular_inflection", transformations: [{ kind: "drop_final_e" }], reviewed: true });
const finalYChange = reviewedBaseWordRegularity({ relationshipKind: "regular_inflection", transformations: [{ type: "change_final_y_to_i" }], reviewed: true });
const conflict = reviewedBaseWordRegularity({ relationshipKind: "regular_inflection", transformations: [{ kind: "irregular_form" }], reviewed: true });
const missing = reviewedBaseWordRegularity({ transformations: [], reviewed: true });
const unknown = reviewedBaseWordRegularity({ relationshipKind: "regular_inflection", transformations: [{ kind: "review_unresolved_change" }], reviewed: true });
assert(irregular.status === "irregular" && suffixChange.status === "regular" && finalYChange.status === "regular" && conflict.status === "needs_review" &&
  missing.status === "needs_review" && unknown.status === "needs_review", "reviewed relationship and morphology classify irregular, regular spelling change, conflict, and missing review");
const goMembers = [member("GO", "go", "base"), member("GO", "goes", "transfer"), member("GO", "going", "transfer"),
  member("GO", "went", "transfer"), member("CARE", "care", "base"), member("CARE", "careful", "transfer"), member("CARE", "caring", "transfer")]
  .map((entry) => ({ ...entry, lessonRegularity: entry.canonicalWordId === "went" ? irregular : suffixChange }));
const goSelection = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("going", "going", "2026-07-01"), item("careful", "careful", "2026-07-02"),
], { selectionPolicyVersion: "base_word_regularity_v1", members: goMembers,
  families: facts([]).families.filter((family) => family.baseFamilyKey === "CARE").concat({ baseFamilyKey: "GO", microSkillKey: SKILL, rowStatus: "active", reviewStatus: "approved_for_first_exposure" }) }));
assert(goSelection.skipReasons.length === 0 && goSelection.slots.length === 6 &&
  !goSelection.slots.some((slot) => slot.canonicalWordId === "went") &&
  !goSelection.guidedFamilySections.some((section) => section.guidedWordIds.includes("went")) &&
  goSelection.slots.some((slot) => slot.canonicalWordId === "goes"), "go to went is excluded everywhere while regular go relatives remain available");
const pinnedGoSelection = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("going", "going", "2026-07-01"), item("careful", "careful", "2026-07-02"),
], { members: goMembers, families: facts([]).families.filter((family) => family.baseFamilyKey === "CARE")
  .concat({ baseFamilyKey: "GO", microSkillKey: SKILL, rowStatus: "active", reviewStatus: "approved_for_first_exposure" }) }));
assert(pinnedGoSelection.guidedFamilySections.some((section) => section.guidedWordIds.includes("went")),
  "an existing release without the new policy marker keeps its pinned lesson selection");
const regularityMembers = [...members, member("GOVERN", "went", "transfer")].map((entry) => ({
  ...entry, lessonRegularity: entry.canonicalWordId === "went" ? irregular : suffixChange,
}));
const regularitySelection = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue, {
  selectionPolicyVersion: "base_word_regularity_v1", members: regularityMembers,
}));
assert(regularitySelection.skipReasons.length === 0 && !regularitySelection.slots.some((slot) => slot.canonicalWordId === "went") &&
  !regularitySelection.guidedFamilySections.some((section) => section.guidedWordIds.includes("went")), "irregular member is absent from independent and guided lesson while regular relatives remain");
const tooSmallAfterExclusion = selectBaseWordFamilyLesson(CHILD, SKILL, facts(queue.slice(0, 3), {
  selectionPolicyVersion: "base_word_regularity_v1",
  members: regularityMembers.map((entry) => ["care", "careful", "government", "govern"].includes(entry.canonicalWordId)
    ? entry : { ...entry, lessonRegularity: missing }),
}));
assert(tooSmallAfterExclusion.slots.length === 0, "a family pair that becomes too small after regularity filtering fails closed");

console.log("adle-base-word-family-selection-regression: ok");
