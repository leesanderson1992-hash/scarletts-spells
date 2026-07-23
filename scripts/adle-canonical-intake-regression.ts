import { readFileSync } from "node:fs";
import {
  resolveCanonicalIntakeReadiness,
  canonicalWordSkillPair,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";
import { resolveSharedWordReviewPolicy } from "../lib/adle/shared-word-routes";
import { selectLessonWords } from "../lib/adle/composer-word-selection";
import { COMPOSER_POLICY_V1 } from "../lib/adle/composer-policy";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  createReviewBundle,
  REVIEW_POLICY_V1,
} from "../lib/adle/review-scheduler";
import { onReviewSessionCompleted } from "../lib/adle/composer-completions";
import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";

const WORD = "canonical-playing";
const CHILD = "child-1";
const SKILL_A = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const SKILL_B = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const MISSPELLING_BY_SKILL = new Map([
  [SKILL_A, "plaiing"],
  [SKILL_B, "plaing"],
]);
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function item(id: string, skill: string, intakeOn: string): LearningItemFact {
  return {
    learningItemId: id,
    childId: CHILD,
    canonicalWordId: WORD,
    microSkillKey: skill,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `verified:${id}`,
    sourceAttemptText: "misspelling",
    reteachPriority: false,
    ejectedOn: null,
    intakeOn,
    rowStatus: "active",
  };
}

function facts(
  skill: string,
  candidateStatus = "parent_local_promoted",
): CanonicalIntakeReadinessFacts {
  return {
    candidate: {
      candidateMappingId: `candidate-${skill}`,
      parentUserId: "parent-1",
      childId: CHILD,
      misspellingNormalized: MISSPELLING_BY_SKILL.get(skill) ?? `miss-${skill}`,
      correctSpellingNormalized: "playing",
      microSkillKey: skill,
      candidateStatus,
      verifiedOn: "2026-07-22",
    },
    canonicalMappings: [],
    words: [
      {
        canonicalWordId: WORD,
        normalisedWord: "playing",
        rowStatus: "active",
        reviewStatus: "approved_for_first_exposure",
        frequencyBand: "high",
        ageBand: "middle_primary",
      },
    ],
    microSkills: [
      {
        microSkillKey: skill,
        masteryDomainKey: "D4",
        isActive: true,
        isAssignable: true,
      },
    ],
    supports: [
      {
        canonicalWordId: WORD,
        microSkillKey: skill,
        supportRole: "support_example",
        rowStatus: "active",
        reviewStatus: "approved_for_first_exposure",
      },
    ],
    contentVersions: [
      {
        microSkillKey: skill,
        versionStatus: "active",
        isActive: true,
        finalReadinessReviewStatus: "signed_off",
        childFriendlyExplanation: "Ready",
        ruleExplanation: "Ready",
      },
    ],
    productionEnabledSkillKeys: new Set([skill]),
    routeSpecificReadyWordSkillPairs: new Set([
      canonicalWordSkillPair(WORD, skill),
    ]),
    allowedFrequencyBands: new Set(["high"]),
    allowedAgeBands: new Set(["middle_primary"]),
  };
}

const first = resolveCanonicalIntakeReadiness(facts(SKILL_A));
const second = resolveCanonicalIntakeReadiness(facts(SKILL_B));
assert(
  first.status === "eligible" && second.status === "eligible",
  "Two real catalogued routes should be independently eligible.",
);
assert(
  first.canonicalWordId === second.canonicalWordId &&
    first.microSkillKey !== second.microSkillKey,
  "Canonical identity must be shared while error-route identity remains distinct.",
);
assert(
  first.misspellingNormalized === "plaiing" &&
    first.correctSpellingNormalized === "playing" &&
    first.microSkillKey === SKILL_A,
  "plaiing must resolve only to playing through PRESERVE_BASE.",
);
assert(
  second.misspellingNormalized === "plaing" &&
    second.correctSpellingNormalized === "playing" &&
    second.microSkillKey === SKILL_B,
  "plaing must resolve only to playing through IDENTIFY_BASE.",
);
const inReview = resolveCanonicalIntakeReadiness(facts(SKILL_A, "in_review"));
assert(
  inReview.status === "blocked" &&
    inReview.reason === "candidate_or_mapping_not_approved",
  "in_review candidates must remain ineligible.",
);
const unknownFacts = facts("NOT_A_CATALOGUED_MICRO_SKILL");
unknownFacts.microSkills = [];
const unknown = resolveCanonicalIntakeReadiness(unknownFacts);
assert(
  unknown.status === "blocked" &&
    unknown.reason === "inactive_or_non_assignable_micro_skill",
  "Unknown or invented labels must fail closed.",
);

const items = [
  item("item-a", SKILL_A, "2026-07-20"),
  item("item-b", SKILL_B, "2026-07-22"),
];
assert(
  resolveSharedWordReviewPolicy({
    learningItems: items,
    explicitRoutes: [],
  }) === null,
  "Multi-route review without explicit links must fail closed.",
);
const shared = resolveSharedWordReviewPolicy({
  learningItems: items,
  explicitRoutes: [
    {
      learningItemId: "item-a",
      microSkillKey: SKILL_A,
      attachedOn: "2026-07-20",
      attachmentOrdinal: 1,
      requiresSentenceContext: false,
      rowStatus: "active",
    },
    {
      learningItemId: "item-b",
      microSkillKey: SKILL_B,
      attachedOn: "2026-07-22",
      attachmentOrdinal: 2,
      requiresSentenceContext: true,
      rowStatus: "active",
    },
  ],
});
assert(
  shared?.activationMicroSkillKey === SKILL_B,
  "Newest route must own the weak activation cue.",
);
assert(
  shared.requiresSentenceContext && shared.microSkillKeys.length === 2,
  "Strictest production requirement and every route must be retained.",
);

const scheduled = createReviewBundle(REVIEW_POLICY_V1, {
  bundleId: "bundle-shared",
  childId: CHILD,
  sourceRef: "lesson:shared",
  taughtOn: "2026-07-10",
  words: [{ canonicalWordId: WORD }],
});
const ejection = onReviewSessionCompleted(REVIEW_POLICY_V1, {
  childId: CHILD,
  completedOn: "2026-07-22",
  sourceRef: "review:shared",
  bundles: [scheduled.bundle],
  scheduleWords: [
    {
      ...scheduled.words[0],
      membershipStatus: "catch_up",
      catchUpStage: 2,
      failedReviewOn: "2026-07-19",
      nextRetestDueOn: "2026-07-22",
    },
  ],
  outcomes: [
    {
      canonicalWordId: WORD,
      bundleId: "bundle-shared",
      kind: "catch_up_retest",
      passed: false,
      attemptText: "sharedd",
    },
  ],
  microSkillKeyByWordId: new Map([[WORD, SKILL_B]]),
  microSkillKeysByWordId: new Map([[WORD, [SKILL_A, SKILL_B]]]),
});
assert(
  ejection.itemIntakes.length === 2 &&
    new Set(ejection.itemIntakes.map((entry) => entry.microSkillKey)).size ===
      2,
  "A shared ejection must transition every linked route from one word outcome.",
);

const selection = selectLessonWords(
  SKILL_A,
  CHILD,
  {
    learningItems: [items[0]],
    dictionary: {
      words: [
        {
          canonicalWordId: WORD,
          wordKey: "shared_en_gb",
          normalisedWord: "shared",
          displayWord: "shared",
          rowStatus: "active",
          reviewStatus: "approved_for_first_exposure",
          frequencyBand: "high",
          ageBand: "middle_primary",
        },
      ],
      supports: [
        {
          canonicalWordId: WORD,
          microSkillKey: SKILL_A,
          supportRole: "support_example",
          rowStatus: "active",
          reviewStatus: "approved_for_first_exposure",
        },
      ],
      bandings: [
        {
          canonicalWordId: WORD,
          bandingVersion: "v1",
          structuralScore: 1,
          complexityLevel: 1,
          rowStatus: "active",
        },
      ],
      overrides: [],
      activeBandingVersion: {
        bandingVersion: "v1",
        isActive: true,
        levelCount: 5,
      },
      activeTeachingSkillKeys: new Set([SKILL_A]),
    },
    taughtHistory: { wasTaughtOrProbed: () => false },
    probeRuns: [],
    probeMissWordIdsToday: [],
  },
  { allowedFrequencyBands: ["high"], allowedAgeBands: ["middle_primary"] },
  COMPOSER_POLICY_V1,
  "2026-07-22",
);
assert(
  selection.slots[0]?.canonicalWordId === WORD &&
    selection.slots[0]?.provenance === "learning_item",
  "Exact canonical learner target must be the first lesson word.",
);
const incomplete = selectLessonWords(
  SKILL_A,
  CHILD,
  {
    learningItems: [items[0]],
    dictionary: {
      ...{
        words: [
          {
            canonicalWordId: WORD,
            wordKey: "shared_en_gb",
            normalisedWord: "shared",
            displayWord: "shared",
            rowStatus: "active",
            reviewStatus: "approved_for_first_exposure",
            frequencyBand: "high",
            ageBand: "middle_primary",
          },
        ],
        supports: [],
        bandings: [],
        overrides: [],
        activeBandingVersion: {
          bandingVersion: "v1",
          isActive: true,
          levelCount: 5,
        },
        activeTeachingSkillKeys: new Set([SKILL_A]),
      },
    },
    taughtHistory: { wasTaughtOrProbed: () => false },
    probeRuns: [],
    probeMissWordIdsToday: [],
  },
  { allowedFrequencyBands: ["high"], allowedAgeBands: ["middle_primary"] },
  COMPOSER_POLICY_V1,
  "2026-07-22",
);
assert(
  incomplete.slots.length === 0 &&
    incomplete.skipReasons.includes("canonical_target_content_incomplete"),
  "Incomplete exact target must block Part 2 instead of substituting another word.",
);

for (const [skill, companion] of [
  [SKILL_A, "canonical-hopeful"],
  [SKILL_B, "canonical-player"],
] as const) {
  const familyKey = `proof-family-${skill}`;
  const baseSelection = selectBaseWordFamilyLesson(CHILD, skill, {
    learningItems: [
      item(`playing-${skill}`, skill, "2026-07-20"),
      { ...item(`companion-${skill}`, skill, "2026-07-21"), canonicalWordId: companion },
    ],
    families: [{ baseFamilyKey: familyKey, microSkillKey: skill, rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
    members: [WORD, companion, "transfer-1", "transfer-2", "transfer-3", "transfer-4"].map((canonicalWordId, index) => ({
      baseFamilyKey: familyKey,
      canonicalWordId,
      memberRole: index === 0 ? "authentic_target" as const : index === 1 ? "authentic_target" as const : "transfer" as const,
      assignmentEligible: true,
      complexityLevel: 1,
      rowStatus: "active" as const,
      reviewStatus: "approved_for_first_exposure" as const,
    })),
  });
  assert(
    baseSelection.skipReasons.length === 0 &&
      baseSelection.slots[0]?.canonicalWordId === WORD &&
      baseSelection.slots[0]?.provenance === "authentic_target",
    `playing must be the first authentic Base Word Lab target for ${skill}.`,
  );
}

const migration = readFileSync(
  "supabase/migrations/20260722180000_add_adle_canonical_intake_and_shared_routes.sql",
  "utf8",
);
for (const contract of [
  "adle_learning_item_sources",
  "adle_review_schedule_word_routes",
  "adle_review_outcome_event_routes",
  "adle_assignment_attempt_event_routes",
  "reactivated_for_new_skill",
  "adle_persist_canonical_intake",
])
  assert(migration.includes(contract), `Migration is missing ${contract}.`);
const baseCompletionMigration = readFileSync(
  "supabase/migrations/20260722200000_add_shared_route_base_word_completion.sql",
  "utf8",
);
for (const contract of [
  "complete_adle_base_word_family_pilot_v2",
  "reactivated_for_new_skill",
  "adle_review_schedule_word_routes",
  "adle_review_outcome_event_routes",
  "active assignable D4 catalogued micro-skill",
  "multi-route schedule is incomplete and has failed closed",
])
  assert(baseCompletionMigration.includes(contract), `Base Word Lab V2 migration is missing ${contract}.`);
console.log(
  JSON.stringify(
    {
      status: "passed",
      canonicalTargetRoutes: [SKILL_A, SKILL_B],
      exactMappings: ["plaiing→playing", "plaing→playing"],
      exactTargetFirst: true,
      sharedReviewFailClosed: true,
      strictestContextWins: true,
      inReviewCandidatesEligible: 0,
    },
    null,
    2,
  ),
);
