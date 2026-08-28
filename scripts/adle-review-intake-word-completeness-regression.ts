import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canonicalWordSkillPair,
  evaluateCanonicalIntakeReadiness,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";
import {
  planApprovedSpellingIntakeSources,
  type ApprovedSpellingIntakeSource,
  type ApprovedSpellingReviewFact,
} from "../lib/writing-engine/spelling/approved-review-intake-source-plan";

const COMPOUND_SKILL = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const PREFIX_SKILL = "D4_MOR_PREFIXES_RE_PRE";

const fourWordFacts = [
  {
    childId: "unactivated-child",
    taskSubmissionId: "submission-8629d7b2",
    writingIssueId: "issue-football",
    sourceMisspellingInstanceId: "occurrence-futball",
    misspellingNormalized: "futball",
    correctSpellingNormalized: "football",
    microSkillKey: COMPOUND_SKILL,
    practiceRoute: "word_practice",
    createsLearningTarget: true,
    routeAuthority: {
      kind: "known_canonical_match",
      canonicalMappingId: "mapping-futball-football",
    },
  },
  {
    childId: "unactivated-child",
    taskSubmissionId: "submission-8629d7b2",
    writingIssueId: "issue-rainbow",
    sourceMisspellingInstanceId: "occurrence-ranebow",
    misspellingNormalized: "ranebow",
    correctSpellingNormalized: "rainbow",
    microSkillKey: COMPOUND_SKILL,
    practiceRoute: "word_practice",
    createsLearningTarget: true,
    routeAuthority: {
      kind: "parent_verified_candidate",
      candidateMappingId: "candidate-ranebow-rainbow",
    },
  },
  {
    childId: "unactivated-child",
    taskSubmissionId: "submission-8629d7b2",
    writingIssueId: "issue-replay",
    sourceMisspellingInstanceId: "occurrence-riplay",
    misspellingNormalized: "riplay",
    correctSpellingNormalized: "replay",
    microSkillKey: PREFIX_SKILL,
    practiceRoute: "word_practice",
    createsLearningTarget: true,
    routeAuthority: {
      kind: "known_canonical_match",
      canonicalMappingId: "mapping-riplay-replay",
    },
  },
  {
    childId: "unactivated-child",
    taskSubmissionId: "submission-8629d7b2",
    writingIssueId: "issue-renew",
    sourceMisspellingInstanceId: "occurrence-rinew",
    misspellingNormalized: "rinew",
    correctSpellingNormalized: "renew",
    microSkillKey: PREFIX_SKILL,
    practiceRoute: "word_practice",
    createsLearningTarget: true,
    routeAuthority: {
      kind: "parent_verified_candidate",
      candidateMappingId: "candidate-rinew-renew",
    },
  },
] as const satisfies readonly ApprovedSpellingReviewFact[];

const plan = planApprovedSpellingIntakeSources(fourWordFacts);
assert.equal(plan.ok, true);
if (!plan.ok) throw new Error("Expected the four-word intake plan to succeed.");

assert.equal(fourWordFacts.length, 4, "verified source occurrences");
assert.equal(plan.sources.length, 4, "one intake source per occurrence");
assert.equal(
  new Set(plan.sources.map((source) => source.correctSpellingNormalized)).size,
  4,
  "four normalized target words",
);
assert.equal(
  new Set(plan.sources.map((source) => source.teachingGroupKey)).size,
  2,
  "two teaching groups do not replace four word sources",
);
assert.deepEqual(
  new Set(plan.sources.map((source) => source.routeAuthority.kind)),
  new Set(["known_canonical_match", "parent_verified_candidate"]),
  "known matches and newly captured candidates share the word-complete boundary",
);

const simulatedLegacyLearningItemKeys = new Set(
  plan.sources.map((source) =>
    JSON.stringify([
      source.childId,
      source.microSkillKey,
      source.practiceRoute,
    ]),
  ),
);
assert.equal(
  simulatedLegacyLearningItemKeys.size,
  2,
  "legacy microskill/route reuse can still group as two containers",
);
assert.equal(
  plan.sources.length,
  4,
  "legacy grouping cannot reduce governed intake-source count",
);

function readinessFacts(
  source: ApprovedSpellingIntakeSource,
): CanonicalIntakeReadinessFacts {
  const canonicalWordId = `word-${source.correctSpellingNormalized}`;
  const hasCanonicalWord = source.correctSpellingNormalized !== "renew";
  const isCompound = source.microSkillKey === COMPOUND_SKILL;
  const mappingId =
    source.routeAuthority.kind === "known_canonical_match"
      ? source.routeAuthority.canonicalMappingId
      : `promoted-${source.routeAuthority.candidateMappingId}`;

  return {
    candidate: {
      candidateMappingId:
        source.routeAuthority.kind === "parent_verified_candidate"
          ? source.routeAuthority.candidateMappingId
          : `known-source-${source.sourceMisspellingInstanceId}`,
      parentUserId: "parent",
      childId: source.childId,
      misspellingNormalized: source.misspellingNormalized,
      correctSpellingNormalized: source.correctSpellingNormalized,
      microSkillKey: source.microSkillKey,
      candidateStatus: "parent_local_promoted",
      verifiedOn: "2026-08-28",
    },
    canonicalMappings: [
      {
        mappingId,
        misspellingNormalized: source.misspellingNormalized,
        correctSpellingNormalized: source.correctSpellingNormalized,
        microSkillKey: source.microSkillKey,
        mappingStatus: "active",
        resolverVisibilityStatus: "visible",
        hasVisibilityEnableEvent: true,
      },
    ],
    words: hasCanonicalWord
      ? [
          {
            canonicalWordId,
            normalisedWord: source.correctSpellingNormalized,
            rowStatus: "active",
            reviewStatus: "approved_for_first_exposure",
            frequencyBand: "high",
            ageBand: "middle_primary",
          },
        ]
      : [],
    microSkills: [
      {
        microSkillKey: source.microSkillKey,
        masteryDomainKey: "D4",
        skillClusterKey: isCompound
          ? "D4_MOR_COMPOUND_WORDS"
          : "D4_MOR_PREFIXES",
        isActive: true,
        isAssignable: true,
      },
    ],
    supports: [],
    contentVersions: [],
    productionEnabledSkillKeys: new Set([source.microSkillKey]),
    routeSpecificReadyWordSkillPairs: hasCanonicalWord
      ? new Set([canonicalWordSkillPair(canonicalWordId, source.microSkillKey)])
      : new Set(),
    routeReadiness: hasCanonicalWord
      ? [
          {
            canonicalWordId,
            microSkillKey: source.microSkillKey,
            ready: true,
            blockers: [],
            ...(isCompound
              ? {
                  curriculumRelease: {
                    releaseManifestId: "compound-release-manifest",
                    releaseKey: "compound-release",
                    releaseManifestSha256: "fixture-sha256",
                    dependencyFingerprint: "fixture-dependencies",
                  },
                }
              : {}),
          },
        ]
      : [],
    allowedFrequencyBands: new Set(["high"]),
    allowedAgeBands: new Set(["middle_primary"]),
  };
}

const readinessByWord = new Map(
  plan.sources.map((source) => [
    source.correctSpellingNormalized,
    evaluateCanonicalIntakeReadiness(readinessFacts(source)),
  ]),
);
assert.equal(readinessByWord.get("football")?.status, "ready");
assert.equal(readinessByWord.get("rainbow")?.status, "ready");
assert.equal(readinessByWord.get("replay")?.status, "ready");
const renewReadiness = readinessByWord.get("renew");
assert.equal(renewReadiness?.status, "blocked");
assert.equal(
  renewReadiness?.status === "blocked" && renewReadiness.blockers[0].code,
  "canonical_word_missing",
);
assert.equal(
  plan.sources.some((source) => source.correctSpellingNormalized === "renew"),
  true,
  "canonical blocking cannot erase the governed word source",
);

const replayedPlan = planApprovedSpellingIntakeSources([
  ...fourWordFacts,
  ...fourWordFacts,
]);
assert.equal(replayedPlan.ok, true);
if (!replayedPlan.ok) throw new Error("Expected exact replay to be idempotent.");
assert.deepEqual(replayedPlan.sources, plan.sources);

const laterFootballOccurrence: ApprovedSpellingReviewFact = {
  ...fourWordFacts[0],
  taskSubmissionId: "later-submission",
  writingIssueId: "later-issue-football",
  sourceMisspellingInstanceId: "later-occurrence-futball",
};
const laterPlan = planApprovedSpellingIntakeSources([
  ...fourWordFacts,
  laterFootballOccurrence,
]);
assert.equal(laterPlan.ok, true);
if (!laterPlan.ok) throw new Error("Expected later evidence to remain distinct.");
assert.equal(laterPlan.sources.length, 5);
assert.equal(
  laterPlan.sources.filter(
    (source) => source.correctSpellingNormalized === "football",
  ).length,
  2,
  "same target word in a later occurrence keeps a second evidence source",
);

const conflictPlan = planApprovedSpellingIntakeSources([
  fourWordFacts[0],
  {
    ...fourWordFacts[0],
    correctSpellingNormalized: "footballs",
  },
]);
assert.equal(conflictPlan.ok, false);
assert.equal(
  !conflictPlan.ok && conflictPlan.blockers[0].code,
  "conflicting_source_occurrence",
);

const missingOccurrencePlan = planApprovedSpellingIntakeSources([
  {
    ...fourWordFacts[0],
    sourceMisspellingInstanceId: null,
  },
]);
assert.equal(missingOccurrencePlan.ok, false);
assert.equal(
  !missingOccurrencePlan.ok && missingOccurrencePlan.blockers[0].code,
  "missing_governed_identity",
  "the planner fails closed instead of guessing a source occurrence identity",
);

const noLearningIntentPlan = planApprovedSpellingIntakeSources([
  ...fourWordFacts,
  {
    ...fourWordFacts[0],
    writingIssueId: "not-an-issue",
    sourceMisspellingInstanceId: "not-an-issue-occurrence",
    createsLearningTarget: false,
  },
]);
assert.equal(noLearningIntentPlan.ok, true);
if (!noLearningIntentPlan.ok) throw new Error("Expected non-learning fact to skip.");
assert.equal(noLearningIntentPlan.sources.length, 4);
assert.equal(noLearningIntentPlan.ignoredWithoutLearningIntent, 1);

const plannerSource = readFileSync(
  new URL(
    "../lib/writing-engine/spelling/approved-review-intake-source-plan.ts",
    import.meta.url,
  ),
  "utf8",
);
for (const forbiddenRuntimeDependency of [
  "@supabase",
  "createClient",
  "createServiceRoleClient",
  "adle_review_schedule_words",
  "daily_assignments",
  "adle_review_sessions",
  "adle_review_word_encounters",
  "adle_review_r6_child_rollouts",
]) {
  assert.equal(
    plannerSource.includes(forbiddenRuntimeDependency),
    false,
    `pure R8A planner must not reach ${forbiddenRuntimeDependency}`,
  );
}

console.log(
  "adle-review-intake-word-completeness-regression: 4 occurrences, 4 intake sources, 2 teaching groups, 3 ready, 1 canonical_word_missing, rollout-unwired",
);
