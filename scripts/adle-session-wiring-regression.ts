/**
 * ADLE Slice 6: session-wiring regression — fixture-backed, DB-independent.
 *
 * Covers the full live round trip at the fact level: storage-shaped fixture
 * rows -> loaders/rows.ts mappers -> composeDailyPlan ->
 * planAssignmentPersistence -> simulated child outcomes ->
 * onReviewSessionCompleted / onLessonCompleted / onProbeCompleted, with the
 * Slice 6 pins asserted: replay idempotence (same deterministic source refs
 * -> byte-identical outputs; existing header -> existing_active_plan noop),
 * the empty-day noop, the notYetSecureSkillKeys pass-through (absent set ->
 * byte-identical composition), and the 3+-wrong reopen wiring
 * (reopenItemsForMicroSkills produces the reteach demand the next composed
 * day's selection reads).
 */

import { COMPOSER_POLICY_V1 } from "../lib/adle/composer-policy";
import {
  composeDailyPlan,
  type ActivityTemplateFact,
  type DailyPlanFacts,
  type FamilyMethodFact,
  type ReviewWordFact,
  type TeachingContentFact,
} from "../lib/adle/daily-assignment-composer";
import { planAssignmentPersistence, ADLE_DAILY_ASSIGNMENT_TITLE } from "../lib/adle/assignment-persistence";
import {
  onLessonCompleted,
  onProbeCompleted,
  onReviewSessionCompleted,
  type ReviewItemOutcome,
} from "../lib/adle/composer-completions";
import {
  reopenItemsForMicroSkills,
  reteachDemandBySkill,
  type LearningItemFact,
} from "../lib/adle/learning-items";
import { addDays, createReviewBundle, REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import { isAttemptCorrect } from "../lib/adle/session-correctness";
import type { BandingVersionFact, ChildBandProfile } from "../lib/adle/dictionary-eligibility";
import { failClosedTaughtWordHistoryProvider } from "../lib/adle/dictionary-eligibility";
import type { DueItemKind } from "../lib/adle/review-due-queue";
import {
  bundleFromRow,
  learningItemFromRow,
  reviewPolicyFromRow,
  scheduleWordFromRow,
  taughtHistoryFromRow,
  type LearningItemRow,
  type ReviewBundleRow,
  type ScheduleWordRow,
} from "../lib/adle/loaders/rows";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

const TODAY = "2026-07-06";
const CHILD = "child-1";
const policy = REVIEW_POLICY_V1;

// ---------------------------------------------------------------------------
// 1. Row mappers: storage-shaped rows -> lib facts
// ---------------------------------------------------------------------------

{
  const mappedPolicy = reviewPolicyFromRow({
    schedule_policy_version: policy.schedulePolicyVersion,
    interval_ladder_days: [...policy.intervalLadderDays],
    catch_up_offsets_days: [...policy.catchUpOffsetsDays],
    session_cap: policy.sessionCap,
    pre_retirement_check_gap_days: policy.preRetirementCheckGapDays,
  });
  assert(
    JSON.stringify(mappedPolicy) === JSON.stringify(policy),
    "review policy row maps to REVIEW_POLICY_V1 exactly",
  );

  const bundleRow: ReviewBundleRow = {
    id: "b-1",
    child_id: CHILD,
    source_ref: "lesson:child-1:2026-07-05:SKILL_PG_A",
    interval_index: 0,
    next_due_on: TODAY,
    schedule_policy_version: policy.schedulePolicyVersion,
    bundle_status: "active",
    row_status: "active",
  };
  const bundle = bundleFromRow(bundleRow);
  assert(bundle.bundleId === "b-1" && bundle.nextDueOn === TODAY, "bundle row maps");

  const wordRow: ScheduleWordRow = {
    child_id: CHILD,
    canonical_word_id: "w-ship",
    bundle_id: "b-1",
    membership_status: "scheduled",
    catch_up_stage: 0,
    next_retest_due_on: null,
    failed_review_on: null,
    pre_retirement_check_due_on: null,
    last_28_day_review_on: null,
    reteach_cycle_count: 0,
    taught_on: addDays(TODAY, -1),
    row_status: "active",
  };
  const scheduleWord = scheduleWordFromRow(wordRow);
  assert(
    scheduleWord.membershipStatus === "scheduled" && scheduleWord.catchUpStage === 0,
    "schedule word row maps",
  );

  const itemRow: LearningItemRow = {
    id: "li-db-1",
    child_id: CHILD,
    canonical_word_id: "w-ship",
    micro_skill_key: "SKILL_PG_A",
    item_status: "pending",
    source_kind: "verified_misspelling",
    source_ref: "cm-1",
    source_attempt_text: "shipp",
    reteach_priority: false,
    ejected_on: null,
    intake_on: "2026-06-20",
    row_status: "active",
  };
  const learningItem = learningItemFromRow(itemRow);
  assert(
    learningItem.learningItemId === "li-db-1" && learningItem.sourceAttemptText === "shipp",
    "learning item row maps (DB id + raw attempt preserved)",
  );

  const taught = taughtHistoryFromRow({
    child_id: CHILD,
    canonical_word_id: "w-ship",
    event_kind: "taught",
    occurred_on: addDays(TODAY, -1),
    source_ref: "lesson:child-1:2026-07-05:SKILL_PG_A",
    row_status: "active",
    attempt_text: "ship",
  });
  assert(taught.attemptText === "ship", "taught history row maps with attempt text");
}

// ---------------------------------------------------------------------------
// Fixture world (mirrors the Slice 3 composer regression's fixtures)
// ---------------------------------------------------------------------------

const BANDING_VERSION: BandingVersionFact = {
  bandingVersion: "banding_v1.1_2026-07-04",
  isActive: true,
  levelCount: 3,
};
const CHILD_BAND: ChildBandProfile = {
  allowedFrequencyBands: ["high", "medium"],
  allowedAgeBands: ["ks1"],
};
const FAMILY_BY_SKILL = new Map<string, string>([
  ["SKILL_PG_A", "D4_PG"],
  ["SKILL_PG_B", "D4_PG"],
]);
const FAMILY_METHODS: FamilyMethodFact[] = [
  {
    familyKey: "D4_PG",
    familyName: "Phoneme-grapheme choices",
    guidedQuestionSequence: ["PG_SOUND_NOTICE", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(sound/spelling cue)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
];
function template(templateKey: string, evidenceKind: string, overrides: Partial<ActivityTemplateFact> = {}): ActivityTemplateFact {
  return {
    templateKey,
    phase: "fixture",
    minWordsRequired: 1,
    requiresSentenceContext: false,
    requiresContrastWords: false,
    evidenceKind,
    childFacingCopy: "fixture copy",
    purpose: "fixture purpose",
    childResponse: "fixture response",
    rowStatus: "active",
    ...overrides,
  };
}
const TEMPLATES: ActivityTemplateFact[] = [
  template("MICRO_READ_ONLY_INTRO", "read_only"),
  template("LESSON_WORDS_INTRO", "read_only"),
  template("PG_SOUND_NOTICE", "guided_task"),
  template("CONTROLLED_SPELLING", "controlled_spelling"),
  template("DICTATION_NO_IMAGE", "dictation"),
  template("REVIEW_QUICK_SORT", "categorisation", { minWordsRequired: 2 }),
  template("REVIEW_DICTATION", "dictation"),
  template("ERROR_REFLECTION_CUE", "reflection"),
  template("DIAGNOSTIC_DICTATION_PROBE", "diagnostic_probe"),
  template("DICTATION_SENTENCE_CONTEXT", "dictation_sentence_context", { requiresSentenceContext: true }),
];
const TEACHING_CONTENT = new Map<string, TeachingContentFact>(
  [...FAMILY_BY_SKILL.keys()].map((skill) => [
    skill,
    {
      microSkillKey: skill,
      teachingObjective: `objective ${skill}`,
      childFriendlyExplanation: `explanation ${skill}`,
      ruleExplanation: `rule ${skill}`,
      commonMisconceptions: `misconceptions ${skill}`,
    },
  ]),
);

const LESSON_WORD_IDS = ["w-la", "w-lb", "w-lc", "w-ld", "w-le"];
const REVIEW_WORD_IDS = ["w-r1", "w-r2"];
const ALL_WORD_IDS = [...REVIEW_WORD_IDS, ...LESSON_WORD_IDS];

const dictionary = {
  words: ALL_WORD_IDS.map((id) => ({
    canonicalWordId: id,
    wordKey: `${id}_key`,
    normalisedWord: id.replace(/[^a-z]/g, ""),
    displayWord: id.replace(/[^a-z]/g, ""),
    rowStatus: "active" as const,
    reviewStatus: "approved_for_first_exposure" as const,
    frequencyBand: "high",
    ageBand: "ks1",
  })),
  supports: ALL_WORD_IDS.map((id) => ({
    canonicalWordId: id,
    microSkillKey: "SKILL_PG_A",
    supportRole: "support_example" as const,
    rowStatus: "active" as const,
    reviewStatus: "approved_for_first_exposure" as const,
  })),
  bandings: ALL_WORD_IDS.map((id) => ({
    canonicalWordId: id,
    bandingVersion: BANDING_VERSION.bandingVersion,
    structuralScore: 1,
    complexityLevel: 1,
    rowStatus: "active" as const,
  })),
  overrides: [],
  activeBandingVersion: BANDING_VERSION,
  activeTeachingSkillKeys: new Set(FAMILY_BY_SKILL.keys()),
};

let itemCounter = 0;
function item(canonicalWordId: string, microSkillKey: string, overrides: Partial<LearningItemFact> = {}): LearningItemFact {
  itemCounter += 1;
  return {
    learningItemId: `item-${String(itemCounter).padStart(3, "0")}`,
    childId: CHILD,
    canonicalWordId,
    microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `fixture:${itemCounter}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-06-20",
    rowStatus: "active",
    ...overrides,
  };
}

// A due bundle for Part 1 (review of two words taught yesterday).
const due = createReviewBundle(policy, {
  bundleId: "b-due",
  childId: CHILD,
  sourceRef: "lesson:child-1:2026-07-05:SKILL_PG_A",
  taughtOn: addDays(TODAY, -1),
  words: REVIEW_WORD_IDS.map((canonicalWordId) => ({ canonicalWordId })),
});

// Five learning items for the lesson skill fill all five slots directly
// (items-only lesson: no probe, no stretch), so Part 2 composes
// deterministically from the persisted items.
const learningItems = LESSON_WORD_IDS.map((id, index) =>
  item(id, "SKILL_PG_A", { intakeOn: addDays("2026-06-01", index) }),
);

function facts(overrides: Partial<DailyPlanFacts> = {}): DailyPlanFacts {
  return {
    childId: CHILD,
    reviewPolicy: policy,
    composerPolicy: COMPOSER_POLICY_V1,
    bundles: [due.bundle],
    scheduleWords: due.words,
    reviewWordFacts: new Map<string, ReviewWordFact>(
      REVIEW_WORD_IDS.map((id) => [
        id,
        { canonicalWordId: id, displayWord: id.replace("w-", ""), microSkillKey: "SKILL_PG_A" },
      ]),
    ),
    familyMethods: FAMILY_METHODS,
    activityTemplates: TEMPLATES,
    teachingContent: TEACHING_CONTENT,
    skillFamilyKeyBySkill: FAMILY_BY_SKILL,
    learningItems,
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(ALL_WORD_IDS.map((id) => [id, "high"])),
    previousLessonFamilyKey: null,
    dictionary,
    childBand: CHILD_BAND,
    taughtHistory: failClosedTaughtWordHistoryProvider,
    probeRuns: [],
    probeMissWordIdsToday: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 2. Compose -> persist plan -> complete: the full wiring round trip
// ---------------------------------------------------------------------------

const plan = composeDailyPlan(facts(), TODAY);
assert(plan.partOne.sections.some((section) => section.sectionKey === "review_production"), "Part 1 composes production");
assert(plan.partTwo.composed, "Part 2 composes (2 due <= cap of 10)");
assert(plan.partTwo.microSkillKey === "SKILL_PG_A", "lesson skill selected");

const persistence = planAssignmentPersistence(plan, { parentUserId: "parent-1", existingHeaders: [] });
assert(persistence.action === "insert" && persistence.header !== null, "fresh day inserts");
assert(
  persistence.items.every((draft) => draft.metadata.planDate === TODAY),
  "every item draft carries the plan date (submit-time dates never recomputed)",
);

// Replay: an existing ADLE header for (child, day) noops.
const replay = planAssignmentPersistence(plan, {
  parentUserId: "parent-1",
  existingHeaders: [
    { childId: CHILD, assignmentDate: TODAY, title: ADLE_DAILY_ASSIGNMENT_TITLE, status: "pending" },
  ],
});
assert(replay.action === "noop" && replay.noopReason === "existing_active_plan", "existing header -> noop");

// Empty day: no due reviews, no selectable items -> empty plan noop.
{
  const emptyPlan = composeDailyPlan(
    facts({ bundles: [], scheduleWords: [], learningItems: [], reviewWordFacts: new Map() }),
    TODAY,
  );
  const emptyPersistence = planAssignmentPersistence(emptyPlan, { parentUserId: "parent-1", existingHeaders: [] });
  assert(
    emptyPersistence.action === "noop" && emptyPersistence.noopReason === "empty_plan",
    "empty composed day -> empty_plan noop (explicit nothing-today state)",
  );
}

// --- Part 1 completion: outcomes reconstructed from the persisted items ----

const productionDrafts = persistence.items.filter((draft) => draft.metadata.sectionKey === "review_production");
assert(productionDrafts.length === REVIEW_WORD_IDS.length, "one production item per due word");
const reviewOutcomes: ReviewItemOutcome[] = productionDrafts.map((draft) => ({
  canonicalWordId: draft.metadata.canonicalWordId as string,
  bundleId: (draft.promptData as { bundleId: string }).bundleId,
  kind: (draft.promptData as { dueKind: DueItemKind }).dueKind,
  passed: draft.metadata.canonicalWordId === "w-r1",
  attemptText: draft.metadata.canonicalWordId === "w-r1" ? "r1" : "rx-wrong",
}));

const reviewRun = () =>
  onReviewSessionCompleted(policy, {
    childId: CHILD,
    completedOn: TODAY,
    sourceRef: `review:${CHILD}:${TODAY}`,
    bundles: [due.bundle],
    scheduleWords: due.words,
    outcomes: reviewOutcomes,
    microSkillKeyByWordId: new Map(REVIEW_WORD_IDS.map((id) => [id, "SKILL_PG_A"])),
  });
const reviewResult = reviewRun();
assert(
  JSON.stringify(reviewResult) === JSON.stringify(reviewRun()),
  "review completion replay is byte-identical (deterministic source refs)",
);
assert(
  reviewResult.outcomeEvents.some(
    (event) => event.eventType === "review_fail" && event.attemptText === "rx-wrong",
  ),
  "raw attempt text lands on the production outcome event",
);
assert(
  reviewResult.updatedScheduleWords.some(
    (word) => word.canonicalWordId === "w-r2" && word.membershipStatus === "catch_up",
  ),
  "failed word enters catch-up (next-day retest)",
);

// --- Part 2 completion: produced words from the persisted lesson items -----

const lessonDrafts = persistence.items.filter((draft) => draft.metadata.sectionKey === "lesson_production");
assert(lessonDrafts.length === COMPOSER_POLICY_V1.lessonWordCount, "all 5 lesson words produced");
const lessonSkill = plan.partTwo.microSkillKey as string;
const lessonSourceRef = `lesson:${CHILD}:${TODAY}:${lessonSkill}`;
const lessonRun = () =>
  onLessonCompleted(policy, {
    childId: CHILD,
    microSkillKey: lessonSkill,
    completedOn: TODAY,
    sourceRef: lessonSourceRef,
    bundleId: "b-new",
    producedWords: lessonDrafts.map((draft) => ({
      canonicalWordId: draft.metadata.canonicalWordId as string,
      attemptText: draft.targetWord ?? "",
      correct: draft.metadata.canonicalWordId !== "w-le",
    })),
    learningItems,
  });
const lessonResult = lessonRun();
assert(JSON.stringify(lessonResult) === JSON.stringify(lessonRun()), "lesson completion replay is byte-identical");
assert(lessonResult.bundle !== null && lessonResult.bundle.nextDueOn === addDays(TODAY, 1), "successful words enter 1-day review");
assert(lessonResult.taughtEvents.length === 5 && lessonResult.taughtEvents.every((event) => event.sourceRef === lessonSourceRef), "taught events carry the deterministic lesson ref");
assert(
  lessonResult.scheduleWords.every((word) => word.canonicalWordId !== "w-le"),
  "missed word does not enter review",
);

// Probe completion path (probe replaces dictation on probe days).
const probeResult = onProbeCompleted({
  childId: CHILD,
  microSkillKey: lessonSkill,
  completedOn: TODAY,
  sourceRef: `probe:${CHILD}:${TODAY}:${lessonSkill}`,
  words: [
    { canonicalWordId: "w-lc", targetWord: "lc", attemptText: "lc", correct: true },
    { canonicalWordId: "w-ld", targetWord: "ld", attemptText: "xx", correct: false },
    { canonicalWordId: null, targetWord: "offbook", attemptText: "ofbok", correct: false },
  ],
});
assert(probeResult.probedEvents.length === 2, "probed events only for canonical-truth words");
assert(probeResult.itemIntakes.length === 1 && probeResult.itemIntakes[0].canonicalWordId === "w-ld", "cold miss becomes a learning item");
assert(probeResult.candidateQueueRoutes.length === 1, "miss without canonical truth is routed, never written");

// ---------------------------------------------------------------------------
// 3. 3+-wrong reopen wiring: next-day reteach demand
// ---------------------------------------------------------------------------

{
  const threeDue = createReviewBundle(policy, {
    bundleId: "b-three",
    childId: CHILD,
    sourceRef: "fixture:three",
    taughtOn: addDays(TODAY, -1),
    words: ["w-la", "w-lb", "w-lc"].map((canonicalWordId) => ({ canonicalWordId })),
  });
  const failAll = onReviewSessionCompleted(policy, {
    childId: CHILD,
    completedOn: TODAY,
    sourceRef: `review:${CHILD}:${TODAY}`,
    bundles: [threeDue.bundle],
    scheduleWords: threeDue.words,
    outcomes: ["w-la", "w-lb", "w-lc"].map((canonicalWordId) => ({
      canonicalWordId,
      bundleId: "b-three",
      kind: "bundle_review" as DueItemKind,
      passed: false,
      attemptText: "wrong",
    })),
    microSkillKeyByWordId: new Map([
      ["w-la", "SKILL_PG_A"],
      ["w-lb", "SKILL_PG_A"],
      ["w-lc", "SKILL_PG_A"],
    ]),
  });
  assert(
    JSON.stringify(failAll.reopenMicroSkillKeys) === JSON.stringify(["SKILL_PG_A"]),
    "3+ wrong flags the skill for reopen",
  );
  // Two selectable items for the flagged skill become reteach demand; an
  // already-resolved item on the same skill is untouched.
  const reopenItems = [
    item("w-la", "SKILL_PG_A"),
    item("w-lb", "SKILL_PG_A"),
    item("w-lc", "SKILL_PG_A", { itemStatus: "resolved" }),
  ];
  const reopened = reopenItemsForMicroSkills(reopenItems, CHILD, failAll.reopenMicroSkillKeys, TODAY);
  assert(
    reopened.length === 2 &&
      reopened.every(
        (reopenedItem) =>
          reopenedItem.itemStatus === "pending_reteach" &&
          reopenedItem.reteachPriority &&
          reopenedItem.ejectedOn === TODAY,
      ),
    "reopen wiring turns the skill's selectable items into reteach demand (resolved items untouched)",
  );
  const demand = reteachDemandBySkill(reopened);
  assert(demand.get("SKILL_PG_A") === TODAY, "the next composed day's reteach tier reads the demand");
}

// ---------------------------------------------------------------------------
// 4. notYetSecureSkillKeys pass-through (Slice 5 wiring; fail-open)
// ---------------------------------------------------------------------------

{
  const base = facts({
    learningItems: [
      item("w-la", "SKILL_PG_A"),
      item("w-lb", "SKILL_PG_A"),
      item("w-pb1", "SKILL_PG_B"),
      item("w-pb2", "SKILL_PG_B"),
    ],
    prerequisiteKeysBySkill: new Map([["SKILL_PG_B", ["SKILL_PG_A"]]]),
  });
  const withoutSet = composeDailyPlan(base, TODAY);
  const withEmptySet = composeDailyPlan({ ...base, notYetSecureSkillKeys: new Set() }, TODAY);
  assert(
    JSON.stringify(withoutSet) === JSON.stringify(withEmptySet),
    "absent/empty set -> byte-identical composition (fail-open pin)",
  );
  const withSet = composeDailyPlan(
    { ...base, notYetSecureSkillKeys: new Set(["SKILL_PG_A"]) },
    TODAY,
  );
  // SKILL_PG_B's prerequisite SKILL_PG_A is not yet secure AND actionable
  // (it has unresolved items), so the dependent defers and the prerequisite
  // is taught first — same winner as the candidate branch here, asserted so
  // the pass-through is observably live.
  assert(withSet.partTwo.microSkillKey === "SKILL_PG_A", "not-yet-secure prerequisite is taught first");
  assert(
    withSet.partTwo.selectionAudit.some((entry) => entry.tier === "prerequisite_precedence" && entry.decided),
    "audit names the prerequisite tier",
  );
}

// ---------------------------------------------------------------------------
// 5. Production correctness (plain word + homophone sentence context)
// ---------------------------------------------------------------------------

{
  // Bare word (plain dictation / controlled spelling).
  assert(isAttemptCorrect("ship", "ship"), "exact word is correct");
  assert(isAttemptCorrect("  SHIP! ", "ship"), "case/punctuation tolerated");
  assert(!isAttemptCorrect("shp", "ship"), "misspelled word is wrong");
  assert(!isAttemptCorrect("", "ship"), "empty attempt is wrong");
  assert(!isAttemptCorrect("ship", null), "no target is wrong");

  // Homophone sentence-context production: the target counts when it appears
  // as a whole token; a sentence carrying the wrong homophone does not.
  assert(isAttemptCorrect("I can see the sea today", "sea"), "target word inside a sentence is correct");
  assert(!isAttemptCorrect("I can see the water", "sea"), "wrong homophone in a sentence is not the target");
  assert(!isAttemptCorrect("It is really big", "as"), "sentence omitting the target word is wrong");
  assert(!isAttemptCorrect("the seaside is nice", "sea"), "substring (seaside) is not a whole-token match");
}

console.log("adle-session-wiring-regression: all checks passed");
