import {
  allocationsForSkill,
  deriveWordEligibility,
  effectiveComplexityLevel,
  failClosedTaughtWordHistoryProvider,
  isAssignmentDiagnosticEligible,
  isEvidenceEligible,
  isMasteryBreadthEligible,
  isRecognisable,
  isReviewEligible,
  isWithinChildBand,
  readAllocation,
  type BandingOverrideFact,
  type BandingVersionFact,
  type ChildBandProfile,
  type DictionaryWordFact,
  type SkillLevelAllocationFact,
  type WordBandingFact,
  type WordSupportFact,
} from "../lib/adle/dictionary-eligibility";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const bandingV11: BandingVersionFact = {
  bandingVersion: "banding_v1.1_2026-07-04",
  isActive: true,
  levelCount: 3,
};

function word(overrides: Partial<DictionaryWordFact> = {}): DictionaryWordFact {
  return {
    canonicalWordId: "word-1",
    wordKey: "cat_en_gb",
    normalisedWord: "cat",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "high",
    ageBand: "early_primary",
    ...overrides,
  };
}

function support(overrides: Partial<WordSupportFact> = {}): WordSupportFact {
  return {
    canonicalWordId: "word-1",
    microSkillKey: "skill_a",
    supportRole: "support_example",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    ...overrides,
  };
}

function banding(overrides: Partial<WordBandingFact> = {}): WordBandingFact {
  return {
    canonicalWordId: "word-1",
    bandingVersion: bandingV11.bandingVersion,
    structuralScore: 0,
    complexityLevel: 1,
    rowStatus: "active",
    ...overrides,
  };
}

const childBand: ChildBandProfile = {
  allowedFrequencyBands: ["high", "medium"],
  allowedAgeBands: ["early_primary", "middle_primary"],
};

// --- Ladder derivations -----------------------------------------------------

assert(isRecognisable(word()), "active word row is recognisable");
assert(!isRecognisable(word({ rowStatus: "superseded" })), "superseded word is not recognisable");
assert(!isRecognisable(word({ normalisedWord: " " })), "word without canonical truth is not recognisable");

assert(isEvidenceEligible(word(), [support()]), "approved active mapping makes a word evidence-eligible");
assert(
  isEvidenceEligible(word(), [support({ reviewStatus: "approved_for_guided_review" })]),
  "guided-review approval counts for evidence eligibility",
);
assert(!isEvidenceEligible(word(), []), "no mapping means not evidence-eligible");
assert(
  !isEvidenceEligible(word(), [support({ rowStatus: "superseded" })]),
  "inactive mapping does not count",
);
assert(
  !isEvidenceEligible(word(), [support({ reviewStatus: "in_review" })]),
  "unapproved mapping does not count",
);
assert(
  !isEvidenceEligible(word(), [support({ canonicalWordId: "other-word" })]),
  "another word's mapping does not count",
);

const teachingReady = new Set(["skill_a"]);
assert(
  isAssignmentDiagnosticEligible({ word: word(), supports: [support()], activeTeachingSkillKeys: teachingReady }, childBand),
  "fully approved, curriculum-ready, in-band word is assignment-eligible",
);
assert(
  !isAssignmentDiagnosticEligible(
    { word: word({ reviewStatus: "approved_for_guided_review" }), supports: [support()], activeTeachingSkillKeys: teachingReady },
    childBand,
  ),
  "guided-review word approval is not enough for child-facing assignment",
);
assert(
  !isAssignmentDiagnosticEligible({ word: word(), supports: [support()], activeTeachingSkillKeys: new Set<string>() }, childBand),
  "no active teaching content for any mapped skill blocks assignment eligibility",
);
assert(
  !isAssignmentDiagnosticEligible(
    { word: word(), supports: [support({ microSkillKey: "skill_b" })], activeTeachingSkillKeys: teachingReady },
    childBand,
  ),
  "teaching content must exist for a skill this word actually maps to",
);

// --- Review eligibility fails closed ------------------------------------------

assert(
  !isReviewEligible("child-1", "word-1"),
  "default taught-history provider must fail closed (nothing review-eligible)",
);
assert(
  !failClosedTaughtWordHistoryProvider.wasTaughtOrProbed("child-1", "word-1"),
  "fail-closed provider returns false for all words",
);
assert(
  isReviewEligible("child-1", "word-1", { wasTaughtOrProbed: () => true }),
  "injected provider drives review eligibility",
);

// --- Obscure-word firewall ------------------------------------------------------

const obscure = word({ frequencyBand: "low", ageBand: "mid_secondary" });
assert(!isWithinChildBand(obscure, childBand), "obscure word is outside the child band");
assert(
  isEvidenceEligible(obscure, [support()]),
  "obscure word still earns evidence eligibility (evidence is band-free)",
);
assert(
  !isMasteryBreadthEligible(obscure, [support()], childBand),
  "obscure word must not count toward breadth targets",
);
assert(
  !isAssignmentDiagnosticEligible({ word: obscure, supports: [support()], activeTeachingSkillKeys: teachingReady }, childBand),
  "obscure word must not be assigned",
);
assert(
  !isWithinChildBand(word({ frequencyBand: null }), childBand),
  "missing frequency band fails closed",
);
assert(
  !isWithinChildBand(word({ ageBand: null }), childBand),
  "missing age band fails closed",
);

// A band change never follows from a Level change and vice versa: the level
// derivation reads only structural banding facts, the band gate reads only
// band fields. Same word, opposite movements:
const level3Banding = banding({ structuralScore: 8, complexityLevel: 3 });
assert(
  effectiveComplexityLevel(level3Banding, null, bandingV11) === 3 &&
    isWithinChildBand(word(), childBand) &&
    !isWithinChildBand(word({ frequencyBand: "low" }), childBand),
  "band change moves eligibility without touching the level",
);
assert(
  effectiveComplexityLevel(banding(), null, bandingV11) === 1 &&
    effectiveComplexityLevel(level3Banding, null, bandingV11) === 3 &&
    isWithinChildBand(word(), childBand),
  "level change never moves band eligibility",
);

// --- Effective level and overrides ----------------------------------------------

const override: BandingOverrideFact = {
  canonicalWordId: "word-1",
  overrideLevel: 2,
  overrideReason: "reviewed: trickier than it scores",
  rowStatus: "active",
};
assert(effectiveComplexityLevel(banding(), override, bandingV11) === 2, "active override wins");
assert(effectiveComplexityLevel(banding(), null, bandingV11) === 1, "no override falls back to computed");
assert(
  effectiveComplexityLevel(banding(), { ...override, rowStatus: "superseded" }, bandingV11) === 1,
  "inactive override is ignored",
);
assert(
  effectiveComplexityLevel(banding(), { ...override, overrideLevel: 9 }, bandingV11) === 1,
  "override outside the version's level range fails closed to computed",
);
assert(
  effectiveComplexityLevel(null, null, bandingV11) === null,
  "unbanded word has no effective level (fail closed)",
);
assert(
  effectiveComplexityLevel(banding({ bandingVersion: "banding_v0.9_old" }), null, bandingV11) === null,
  "banding row from a non-active version does not band the word",
);
assert(
  effectiveComplexityLevel(null, override, bandingV11) === 2,
  "an override can band an otherwise unbanded word",
);

const eligibility = deriveWordEligibility(
  {
    word: word(),
    supports: [support()],
    banding: banding(),
    override,
    activeBandingVersion: bandingV11,
    activeTeachingSkillKeys: teachingReady,
  },
  childBand,
);
assert(
  eligibility.recognisable &&
    eligibility.evidenceEligible &&
    eligibility.assignmentDiagnosticEligible &&
    eligibility.masteryBreadthEligible &&
    eligibility.effectiveComplexityLevel === 2,
  "deriveWordEligibility composes the ladder and the effective level",
);

// --- Allocation readers -----------------------------------------------------------

const allocationRows: SkillLevelAllocationFact[] = [
  { microSkillKey: "skill_a", complexityLevel: 1, allocation: 5, bandingVersion: bandingV11.bandingVersion, rowStatus: "active" },
  { microSkillKey: "skill_a", complexityLevel: 2, allocation: 3, bandingVersion: bandingV11.bandingVersion, rowStatus: "active" },
  { microSkillKey: "skill_a", complexityLevel: 1, allocation: 99, bandingVersion: bandingV11.bandingVersion, rowStatus: "superseded" },
  { microSkillKey: "skill_a", complexityLevel: 1, allocation: 42, bandingVersion: "banding_v0.9_old", rowStatus: "active" },
];
assert(readAllocation(allocationRows, bandingV11, "skill_a", 1) === 5, "allocation reader returns the active cell");
assert(readAllocation(allocationRows, bandingV11, "skill_a", 3) === 0, "missing cell reads as zero");
assert(readAllocation(allocationRows, bandingV11, "skill_z", 1) === 0, "unknown skill reads as zero");
const bySkill = allocationsForSkill(allocationRows, bandingV11, "skill_a");
assert(
  bySkill.get(1) === 5 && bySkill.get(2) === 3 && bySkill.size === 2,
  "allocationsForSkill returns only active cells for the active version",
);

console.log("ADLE dictionary eligibility regression passed");
