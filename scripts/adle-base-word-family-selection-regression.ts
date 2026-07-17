import {
  selectBaseWordFamilyLesson,
  type BaseWordFamilySelectionFacts,
} from "../lib/adle/base-word-family-selection";
import type { LearningItemFact } from "../lib/adle/learning-items";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const CHILD = "child";
const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";

function item(id: string, word: string, date: string, sourceKind: LearningItemFact["sourceKind"] = "verified_misspelling"): LearningItemFact {
  return {
    learningItemId: id, childId: CHILD, canonicalWordId: word, microSkillKey: SKILL,
    itemStatus: "pending", sourceKind, sourceRef: `source:${id}`, sourceAttemptText: "misspelling",
    reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active",
  };
}

function facts(items: readonly LearningItemFact[], overrides: Partial<BaseWordFamilySelectionFacts> = {}): BaseWordFamilySelectionFacts {
  return {
    learningItems: items,
    families: [{ baseFamilyKey: "HELP", microSkillKey: SKILL, rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
    members: [
      { baseFamilyKey: "HELP", canonicalWordId: "helpful", memberRole: "authentic_target", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
      { baseFamilyKey: "HELP", canonicalWordId: "helpless", memberRole: "authentic_target", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
      { baseFamilyKey: "HELP", canonicalWordId: "help", memberRole: "transfer", assignmentEligible: true, complexityLevel: 1, rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
      { baseFamilyKey: "HELP", canonicalWordId: "unhelpful", memberRole: "transfer", assignmentEligible: true, complexityLevel: 2, rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
      { baseFamilyKey: "HELP", canonicalWordId: "helping", memberRole: "transfer", assignmentEligible: true, complexityLevel: 2, rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
      { baseFamilyKey: "HELP", canonicalWordId: "helpfulness", memberRole: "optional_transfer_check", assignmentEligible: true, complexityLevel: 2, rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
    ],
    ...overrides,
  };
}

const two = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "helpful", "2026-07-01"), item("b", "helpless", "2026-07-02")]));
assert(two.baseFamilyKey === "HELP", "two verified authentic targets must select their shared family");
assert(two.slots.map((slot) => slot.canonicalWordId).join("|") === "helpful|helpless|help|helping|unhelpful", "authentic targets must be oldest-first and transfers must fill to five");
assert(two.slots.filter((slot) => slot.provenance === "authentic_target").length === 2, "two authentic targets must stay priority targets");

const one = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "helpful", "2026-07-01")]));
assert(one.skipReasons.includes("insufficient_verified_authentic_targets"), "one authentic target must fail closed");

const probeOnly = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "helpful", "2026-07-01"), item("b", "helpless", "2026-07-02", "probe_miss")]));
assert(probeOnly.skipReasons.includes("insufficient_verified_authentic_targets"), "probe-only targets must not satisfy the trigger");

const missingTransfers = selectBaseWordFamilyLesson(CHILD, SKILL, facts([item("a", "helpful", "2026-07-01"), item("b", "helpless", "2026-07-02")], { members: facts([]).members.slice(0, 4) }));
assert(missingTransfers.skipReasons.includes("insufficient_eligible_family_transfer_words"), "insufficient reviewed transfers must fail closed");

const inReview = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("a", "helpful", "2026-07-01"), item("b", "helpless", "2026-07-02"),
], {
  families: [{ baseFamilyKey: "HELP", microSkillKey: SKILL, rowStatus: "active", reviewStatus: "in_review" }],
  members: facts([]).members.map((member) => ({ ...member, reviewStatus: "in_review" })),
}));
assert(inReview.skipReasons.includes("no_shared_reviewed_base_family"), "provisionally assignment-eligible in-review family members must stay outside runtime selection");

const sixAuthentic = selectBaseWordFamilyLesson(CHILD, SKILL, facts([
  item("a", "helpful", "2026-07-01"), item("b", "helpless", "2026-07-02"), item("c", "help", "2026-07-03"),
  item("d", "unhelpful", "2026-07-04"), item("e", "helping", "2026-07-05"), item("f", "helpfulness", "2026-07-06"),
]));
assert(sixAuthentic.slots.length === 5 && sixAuthentic.deferredAuthenticLearningItemIds.join("|") === "f", "more than five authentic targets must leave later targets pending");

console.log("adle-base-word-family-selection-regression: ok");
