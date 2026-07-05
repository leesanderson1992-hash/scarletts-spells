/**
 * ADLE Slice 3 (3E): persistence-planner regression — fixture-backed,
 * DB-independent.
 *
 * Covers: insert plans are deterministic, ordered, and provenance-
 * preserving (one row per item candidate, contiguous positions, unique
 * deterministic source_entity_ids, ADLE learning-item linkage in metadata,
 * legacy learning_item_id never set); idempotence (an existing ADLE header
 * for the child+day makes re-planning a no-op; other titles and other days
 * do not); review-only days persist Part 1 only; stretch learning-item
 * intakes ride the insert plan; empty plans never write; and the planner
 * touches nothing but assignment rows (no evidence, scheduler, or reward
 * fields exist anywhere in the drafts).
 */

import { COMPOSER_POLICY_V1 } from "../lib/adle/composer-policy";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  composeDailyPlan,
  type ActivityTemplateFact,
  type DailyPlanFacts,
  type FamilyMethodFact,
  type ReviewWordFact,
  type TeachingContentFact,
} from "../lib/adle/daily-assignment-composer";
import {
  ADLE_DAILY_ASSIGNMENT_TITLE,
  planAssignmentPersistence,
  type ExistingAssignmentHeaderFact,
} from "../lib/adle/assignment-persistence";
import {
  addDays,
  createReviewBundle,
  REVIEW_POLICY_V1,
} from "../lib/adle/review-scheduler";
import type {
  BandingVersionFact,
  ChildBandProfile,
  DictionaryWordFact,
  WordBandingFact,
  WordSupportFact,
} from "../lib/adle/dictionary-eligibility";
import { failClosedTaughtWordHistoryProvider } from "../lib/adle/dictionary-eligibility";
import type { ComposerDictionaryFacts } from "../lib/adle/composer-word-selection";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const TODAY = "2026-07-05";
const CHILD = "child-1";
const PARENT = "parent-1";
const policy = REVIEW_POLICY_V1;

// --- Minimal fixture world (mirrors the composer regression) ----------------

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
  ["SKILL_PAT_A", "D4_PAT"],
]);
const FAMILY_METHODS: FamilyMethodFact[] = [
  {
    familyKey: "D4_PG",
    familyName: "Phoneme-grapheme choices",
    guidedQuestionSequence: ["PG_SOUND_NOTICE", "PG_GRAPHEME_MAP", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(sound/spelling cue)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
  {
    familyKey: "D4_PAT",
    familyName: "Spelling patterns",
    guidedQuestionSequence: ["PAT_PATTERN_SPOT", "PAT_RULE_APPLY", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(rule/pattern)",
    productionTask: "Dictation_No_Image or Must_Use_Freewriting",
    rowStatus: "active",
  },
];

function template(
  templateKey: string,
  evidenceKind: string,
  overrides: Partial<ActivityTemplateFact> = {},
): ActivityTemplateFact {
  return {
    templateKey,
    phase: "fixture",
    minWordsRequired: 1,
    requiresSentenceContext: false,
    requiresContrastWords: false,
    evidenceKind,
    childFacingCopy: "",
    rowStatus: "active",
    ...overrides,
  };
}

const TEMPLATES: ActivityTemplateFact[] = [
  template("MICRO_READ_ONLY_INTRO", "read_only"),
  template("LESSON_WORDS_INTRO", "read_only"),
  template("PG_SOUND_NOTICE", "guided_task"),
  template("PG_GRAPHEME_MAP", "guided_task"),
  template("PAT_PATTERN_SPOT", "guided_task", { minWordsRequired: 2 }),
  template("PAT_RULE_APPLY", "guided_task"),
  template("CONTROLLED_SPELLING", "controlled_spelling"),
  template("DICTATION_NO_IMAGE", "dictation"),
  template("REVIEW_QUICK_SORT", "categorisation", { minWordsRequired: 2 }),
  template("REVIEW_DICTATION", "dictation"),
  template("ERROR_REFLECTION_CUE", "reflection"),
  template("DIAGNOSTIC_DICTATION_PROBE", "diagnostic_probe"),
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

function buildDictionary(
  specs: readonly { id: string; level: number; skills: readonly string[] }[],
): ComposerDictionaryFacts {
  const words: DictionaryWordFact[] = specs.map((spec) => ({
    canonicalWordId: spec.id,
    wordKey: `${spec.id}_key`,
    normalisedWord: spec.id.replace(/-/g, ""),
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "high",
    ageBand: "ks1",
  }));
  const supports: WordSupportFact[] = specs.flatMap((spec) =>
    spec.skills.map((skill) => ({
      canonicalWordId: spec.id,
      microSkillKey: skill,
      supportRole: "support_example" as const,
      rowStatus: "active" as const,
      reviewStatus: "approved_for_first_exposure" as const,
    })),
  );
  const bandings: WordBandingFact[] = specs.map((spec) => ({
    canonicalWordId: spec.id,
    bandingVersion: BANDING_VERSION.bandingVersion,
    structuralScore: spec.level,
    complexityLevel: spec.level,
    rowStatus: "active",
  }));
  return {
    words,
    supports,
    bandings,
    overrides: [],
    activeBandingVersion: BANDING_VERSION,
    activeTeachingSkillKeys: new Set(FAMILY_BY_SKILL.keys()),
  };
}

let itemCounter = 0;
function item(canonicalWordId: string, microSkillKey: string, intakeOn: string): LearningItemFact {
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
    intakeOn,
    rowStatus: "active",
  };
}

const DICTIONARY = buildDictionary([
  { id: "wi-1", level: 1, skills: ["SKILL_PG_A"] },
  { id: "wi-2", level: 1, skills: ["SKILL_PG_A"] },
  { id: "new-1", level: 1, skills: ["SKILL_PG_A"] },
  { id: "new-2", level: 2, skills: ["SKILL_PG_A"] },
  { id: "new-3", level: 2, skills: ["SKILL_PG_A"] },
  { id: "new-4", level: 2, skills: ["SKILL_PG_A"] },
  { id: "new-5", level: 1, skills: ["SKILL_PG_A"] },
  { id: "new-6", level: 2, skills: ["SKILL_PG_A"] },
]);

const due = createReviewBundle(policy, {
  bundleId: "bundle-1",
  childId: CHILD,
  sourceRef: "lesson:bundle-1",
  taughtOn: addDays(TODAY, -1),
  words: [{ canonicalWordId: "rev-1" }, { canonicalWordId: "rev-2" }],
});

function facts(overrides: Partial<DailyPlanFacts> = {}): DailyPlanFacts {
  return {
    childId: CHILD,
    reviewPolicy: policy,
    composerPolicy: COMPOSER_POLICY_V1,
    bundles: [due.bundle],
    scheduleWords: due.words,
    reviewWordFacts: new Map<string, ReviewWordFact>([
      ["rev-1", { canonicalWordId: "rev-1", displayWord: "rev1", microSkillKey: "SKILL_PAT_A" }],
      ["rev-2", { canonicalWordId: "rev-2", displayWord: "rev2", microSkillKey: "SKILL_PAT_A" }],
    ]),
    familyMethods: FAMILY_METHODS,
    activityTemplates: TEMPLATES,
    teachingContent: TEACHING_CONTENT,
    skillFamilyKeyBySkill: FAMILY_BY_SKILL,
    learningItems: [item("wi-1", "SKILL_PG_A", "2026-06-01"), item("wi-2", "SKILL_PG_A", "2026-06-02")],
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
    dictionary: DICTIONARY,
    childBand: CHILD_BAND,
    taughtHistory: failClosedTaughtWordHistoryProvider,
    probeRuns: [],
    probeMissWordIdsToday: [],
    ...overrides,
  };
}

// --- Insert plan: ordered, deterministic, provenance-preserving --------------

const plan = composeDailyPlan(facts(), TODAY);
assert(plan.partTwo.composed, "fixture day composes a lesson");
const persistence = planAssignmentPersistence(plan, { parentUserId: PARENT, existingHeaders: [] });

assert(persistence.action === "insert", "fresh day plans an insert");
assert(persistence.header !== null, "insert carries the daily_assignments header");
assert(persistence.header?.title === ADLE_DAILY_ASSIGNMENT_TITLE, "pinned ADLE header title");
assert(persistence.header?.assignmentGenerationSource === "adle_composer_v1", "generation source labelled");
assert(persistence.header?.reviewWords.join(",") === "rev1,rev2", "header review words follow presentation order");
assert(persistence.header?.targetWords.length === 5, "header target words are the five lesson words");

const items = persistence.items;
const planItemCount =
  plan.partOne.sections.reduce((total, section) => total + section.items.length, 0) +
  plan.partTwo.sections.reduce((total, section) => total + section.items.length, 0);
assert(items.length === planItemCount, "one persisted row per item candidate");
items.forEach((draft, index) => {
  assert(draft.position === index + 1, `positions are contiguous from 1 (index ${index})`);
  assert(
    draft.sourceEntityId === `adle:${CHILD}:${TODAY}:${draft.position}`,
    "deterministic source_entity_id per (child, day, position)",
  );
  assert(draft.domainModule === "spelling", "domain module is spelling");
  assert(draft.sourceType === "adle_composer", "source type labels the composer");
  assert(draft.status === "ready", "items persist as ready");
  assert(draft.metadata.composerPolicyVersion === plan.composerPolicyVersion, "policy version preserved");
  assert(draft.metadata.schedulePolicyVersion === plan.schedulePolicyVersion, "schedule policy preserved");
  assert(!("learningItemId" in draft), "legacy learning_item_id is never set on ADLE drafts");
});
assert(new Set(items.map((draft) => draft.sourceEntityId)).size === items.length, "source_entity_ids unique");

// Lesson-word rows keep their ADLE learning-item linkage in metadata.
const controlledRows = items.filter((draft) => draft.metadata.sectionKey === "lesson_production");
assert(controlledRows.length === 5, "all five lesson words persist production rows");
assert(
  controlledRows.every((draft) => draft.metadata.adleLearningItemRef !== null),
  "every lesson-word row traces to an adle learning item",
);

// Stretch intakes ride the insert plan.
assert(
  persistence.learningItemIntakes.length === plan.partTwo.stretchItemIntakes.length &&
    persistence.learningItemIntakes.length > 0,
  "stretch learning-item intakes ride the insert plan",
);
assert(
  persistence.learningItemIntakes.every((intake) => intake.sourceKind === "stretch_selection"),
  "intakes are stretch selections",
);

// Determinism: same plan + params -> byte-identical persistence plan.
assert(
  JSON.stringify(persistence) ===
    JSON.stringify(planAssignmentPersistence(plan, { parentUserId: PARENT, existingHeaders: [] })),
  "persistence planning is byte-deterministic",
);

// --- Idempotence -------------------------------------------------------------

const existingHeader: ExistingAssignmentHeaderFact = {
  childId: CHILD,
  assignmentDate: TODAY,
  title: ADLE_DAILY_ASSIGNMENT_TITLE,
  status: "pending",
};
const replanned = planAssignmentPersistence(plan, {
  parentUserId: PARENT,
  existingHeaders: [existingHeader],
});
assert(replanned.action === "noop", "re-planning a persisted day is a no-op");
assert(replanned.noopReason === "existing_active_plan", "noop names the existing plan");
assert(replanned.items.length === 0 && replanned.header === null, "noop writes nothing");
assert(replanned.learningItemIntakes.length === 0, "noop creates no learning items");

// Other titles and other days never block the ADLE insert.
const otherHeaders: ExistingAssignmentHeaderFact[] = [
  { childId: CHILD, assignmentDate: TODAY, title: "Legacy practice", status: "pending" },
  { childId: CHILD, assignmentDate: addDays(TODAY, -1), title: ADLE_DAILY_ASSIGNMENT_TITLE, status: "completed" },
  { childId: "child-2", assignmentDate: TODAY, title: ADLE_DAILY_ASSIGNMENT_TITLE, status: "pending" },
];
assert(
  planAssignmentPersistence(plan, { parentUserId: PARENT, existingHeaders: otherHeaders }).action === "insert",
  "legacy titles, other days, and other children never block the insert",
);

// --- Review-only day persists Part 1 only ------------------------------------

const bigDue = createReviewBundle(policy, {
  bundleId: "bundle-big",
  childId: CHILD,
  sourceRef: "lesson:bundle-big",
  taughtOn: addDays(TODAY, -1),
  words: Array.from({ length: 11 }, (_, index) => ({ canonicalWordId: `rv-${String(index + 1).padStart(2, "0")}` })),
});
const reviewOnlyPlan = composeDailyPlan(
  facts({
    bundles: [bigDue.bundle],
    scheduleWords: bigDue.words,
    reviewWordFacts: new Map(
      bigDue.words.map((word) => [
        word.canonicalWordId,
        {
          canonicalWordId: word.canonicalWordId,
          displayWord: word.canonicalWordId.replace(/-/g, ""),
          microSkillKey: "SKILL_PAT_A",
        },
      ]),
    ),
  }),
  TODAY,
);
assert(!reviewOnlyPlan.partTwo.composed, "review-only fixture blocks the lesson");
const reviewOnlyPersistence = planAssignmentPersistence(reviewOnlyPlan, {
  parentUserId: PARENT,
  existingHeaders: [],
});
assert(reviewOnlyPersistence.action === "insert", "review-only days still persist Part 1");
assert(reviewOnlyPersistence.header?.targetWords.length === 0, "no lesson words on a review-only day");
assert(reviewOnlyPersistence.header?.reviewWords.length === 10, "capped review words persist");
assert(
  reviewOnlyPersistence.items.every((draft) => draft.metadata.sectionKey.startsWith("review_")),
  "review-only day persists review sections only",
);
assert(reviewOnlyPersistence.learningItemIntakes.length === 0, "no stretch intakes without a lesson");

// --- Empty plan never writes ---------------------------------------------------

const emptyPlan = composeDailyPlan(
  facts({ bundles: [], scheduleWords: [], reviewWordFacts: new Map(), learningItems: [] }),
  TODAY,
);
const emptyPersistence = planAssignmentPersistence(emptyPlan, {
  parentUserId: PARENT,
  existingHeaders: [],
});
assert(emptyPersistence.action === "noop" && emptyPersistence.noopReason === "empty_plan", "an empty day writes nothing");

console.log("ADLE composer persistence regression passed.");
