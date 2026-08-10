import assert from "node:assert/strict";

import {
  canonicalWordSkillPair,
  evaluateCanonicalIntakeReadiness,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";

const candidates = [
  ["misslead", "mislead", "D4_MOR_PREFIXES_DIS_MIS"],
  ["imcorrect", "incorrect", "D4_MOR_PREFIXES_IN_IM_IL_IR"],
  ["riplay", "replay", "D4_MOR_PREFIXES_RE_PRE"],
  ["urnkind", "unkind", "D4_MOR_PREFIXES_UN"],
  ["imvisible", "invisible", "D4_MOR_PREFIXES_IN_IM_IL_IR"],
  ["reebuild", "rebuild", "D4_MOR_PREFIXES_RE_PRE"],
  ["preeview", "preview", "D4_MOR_PREFIXES_RE_PRE"],
  ["urnlocked", "unlocked", "D4_MOR_PREFIXES_UN"],
  ["inpossible", "impossible", "D4_MOR_PREFIXES_IN_IM_IL_IR"],
  ["disshonest", "dishonest", "D4_MOR_PREFIXES_DIS_MIS"],
  ["supahero", "superhero", "D4_MOR_PREFIXES_SUB_INTER_SUPER"],
  ["intanational", "international", "D4_MOR_PREFIXES_SUB_INTER_SUPER"],
  ["subbway", "subway", "D4_MOR_PREFIXES_SUB_INTER_SUPER"],
] as const;

const outcomes = candidates.map(([misspelling, target, microSkillKey], index) => {
  const wordId = `word-${target}`;
  const hasReviewedWord = target !== "unlocked";
  const facts: CanonicalIntakeReadinessFacts = {
    candidate: {
      candidateMappingId: `candidate-${index}`,
      parentUserId: "parent",
      childId: "child",
      misspellingNormalized: misspelling,
      correctSpellingNormalized: target,
      microSkillKey,
      candidateStatus: "parent_local_promoted",
      verifiedOn: "2026-08-04",
    },
    canonicalMappings: [
      {
        mappingId: `mapping-${index}`,
        misspellingNormalized: misspelling,
        correctSpellingNormalized: target,
        microSkillKey,
        mappingStatus: "active",
        resolverVisibilityStatus: "visible",
        hasVisibilityEnableEvent: true,
      },
    ],
    words: hasReviewedWord
      ? [
          {
            canonicalWordId: wordId,
            normalisedWord: target,
            rowStatus: "active",
            reviewStatus: "approved_for_first_exposure",
            frequencyBand: "high",
            ageBand: "middle_primary",
          },
        ]
      : [],
    microSkills: [
      {
        microSkillKey,
        masteryDomainKey: "D4",
        skillClusterKey: "D4_MOR_PREFIXES",
        isActive: true,
        isAssignable: true,
      },
    ],
    supports: [],
    contentVersions: [],
    productionEnabledSkillKeys: new Set([microSkillKey]),
    routeSpecificReadyWordSkillPairs: hasReviewedWord
      ? new Set([canonicalWordSkillPair(wordId, microSkillKey)])
      : new Set(),
    allowedFrequencyBands: new Set(["high"]),
    allowedAgeBands: new Set(["middle_primary"]),
  };
  return evaluateCanonicalIntakeReadiness(facts);
});

assert.equal(outcomes.filter((outcome) => outcome.status === "ready").length, 12);
const blocked = outcomes.filter((outcome) => outcome.status === "blocked");
assert.equal(blocked.length, 1);
const unlocked = blocked[0]!;
assert.equal(unlocked.canonicalTargetToken, "unlocked");
assert.equal(unlocked.targetIdentityStatus, "established");
assert.equal(unlocked.candidateState, "pending_content");
assert.equal(unlocked.blockers[0].code, "canonical_word_missing");
assert.equal(unlocked.blockers[0].demandType, "teaching_content");
assert.equal(
  outcomes.filter(
    (outcome) =>
      outcome.status === "blocked" && outcome.blockers[0].demandType === "resolver",
  ).length,
  0,
);

console.log(
  "adle-canonical-intake-current-submission-regression: 12 ready, 1 pending_content, 1 Teaching Content Demand, 0 Resolver Demands",
);
