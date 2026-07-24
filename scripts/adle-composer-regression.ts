/**
 * ADLE Slice 3 (3F): composer regression — fixture-backed, DB-independent.
 *
 * Covers: pinned lexicographic tie-breaker truth with audit trails, the
 * 5-word fill order and adjacent-band constraint, the probe rules (14-day
 * cap edges, not-previously-taught, passed-probe-still-lessons, probe
 * replaces dictation), throttle integration (10 vs 11), review session
 * shape (family sort dimensions, homophone sentence-context production,
 * session-mix ordering), time-budget trim order, fail-closed sweeps, the
 * 3D write path (bundle + taught events + item transitions, probe run +
 * misses, ejection round-trip, raw-attempt-text round-trip), and byte
 * determinism.
 */

import {
  COMPOSER_POLICY_V1,
} from "../lib/adle/composer-policy";
import {
  clustersBySkill,
  verifiedMisspellingIntakeBridge,
  type LearningItemFact,
  type VerifiedMisspellingCandidateFact,
} from "../lib/adle/learning-items";
import {
  selectPartTwoSkill,
  type SkillSelectionFacts,
} from "../lib/adle/composer-skill-selection";
import {
  selectLessonWords,
  type ComposerDictionaryFacts,
  type ProbeRunFact,
  type WordSelectionFacts,
} from "../lib/adle/composer-word-selection";
import {
  composeDailyPlan,
  parseReviewSortDimension,
  sessionMixOrder,
  type ActivityTemplateFact,
  type DailyPlanFacts,
  type FamilyMethodFact,
  type ReviewWordFact,
  type TeachingContentFact,
} from "../lib/adle/daily-assignment-composer";
import {
  onLessonCompleted,
  onProbeCompleted,
  onReviewSessionCompleted,
  pauseItemsForParentReview,
} from "../lib/adle/composer-completions";
import {
  addDays,
  createReviewBundle,
  REVIEW_POLICY_V1,
  type ReviewBundleFact,
  type ScheduleWordFact,
} from "../lib/adle/review-scheduler";
import type {
  BandingVersionFact,
  ChildBandProfile,
  DictionaryWordFact,
  TaughtWordHistoryProvider,
  WordBandingFact,
  WordSupportFact,
} from "../lib/adle/dictionary-eligibility";
import { failClosedTaughtWordHistoryProvider } from "../lib/adle/dictionary-eligibility";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const TODAY = "2026-07-05";
const CHILD = "child-1";
const policy = REVIEW_POLICY_V1;
const composerPolicy = COMPOSER_POLICY_V1;

// ---------------------------------------------------------------------------
// Fixture builders
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
  ["SKILL_PAT_A", "D4_PAT"],
  ["SKILL_HOM_A", "D4_HOM"],
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
  {
    familyKey: "D4_HOM",
    familyName: "Homophones and meaning",
    guidedQuestionSequence: ["HOM_MEANING_MATCH", "HOM_SENTENCE_CHOICE", "HOM_CORRECTION", "SENTENCE_APPLICATION"],
    reviewSortDimension: "REVIEW_QUICK_SORT(meaning/sentence fit)",
    productionTask: "Must_Use_Freewriting preferred; dictation only with sentence context",
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
  template("PG_GRAPHEME_MAP", "guided_task"),
  template("PAT_PATTERN_SPOT", "guided_task", { minWordsRequired: 2 }),
  template("PAT_RULE_APPLY", "guided_task"),
  template("HOM_MEANING_MATCH", "guided_task", { requiresContrastWords: true }),
  template("HOM_SENTENCE_CHOICE", "guided_task", { requiresContrastWords: true, requiresSentenceContext: true }),
  template("HOM_CORRECTION", "guided_task", { requiresContrastWords: true, requiresSentenceContext: true }),
  template("CONTROLLED_SPELLING", "controlled_spelling"),
  template("DICTATION_NO_IMAGE", "dictation"),
  template("DICTATION_SENTENCE_CONTEXT", "dictation_sentence_context", { requiresSentenceContext: true }),
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

interface FixtureWordSpec {
  id: string;
  level: number;
  skills: readonly string[];
  frequencyBand?: string;
  ageBand?: string;
}

function buildDictionary(specs: readonly FixtureWordSpec[]): ComposerDictionaryFacts {
  const words: DictionaryWordFact[] = specs.map((spec) => ({
    canonicalWordId: spec.id,
    wordKey: `${spec.id}_key`,
    normalisedWord: spec.id.replace(/-/g, ""),
    displayWord: spec.id.replace(/-/g, ""),
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: spec.frequencyBand ?? "high",
    ageBand: spec.ageBand ?? "ks1",
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
function item(overrides: Partial<LearningItemFact> & Pick<LearningItemFact, "canonicalWordId" | "microSkillKey">): LearningItemFact {
  itemCounter += 1;
  return {
    learningItemId: `item-${String(itemCounter).padStart(3, "0")}`,
    childId: CHILD,
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

function selectionFacts(
  items: readonly LearningItemFact[],
  overrides: Partial<SkillSelectionFacts> = {},
): SkillSelectionFacts {
  return {
    learningItems: items,
    skillFamilyKeyBySkill: FAMILY_BY_SKILL,
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
    ...overrides,
  };
}

/** A due review fixture: bundles taught so their review lands today. */
function dueBundle(
  bundleId: string,
  wordIds: readonly string[],
  taughtOn = addDays(TODAY, -1),
): { bundle: ReviewBundleFact; words: ScheduleWordFact[] } {
  const created = createReviewBundle(policy, {
    bundleId,
    childId: CHILD,
    sourceRef: `lesson:${bundleId}`,
    taughtOn,
    words: wordIds.map((canonicalWordId) => ({ canonicalWordId })),
  });
  return { bundle: created.bundle, words: created.words };
}

function reviewWordFacts(entries: readonly [string, string][]): Map<string, ReviewWordFact> {
  return new Map(
    entries.map(([canonicalWordId, microSkillKey]) => [
      canonicalWordId,
      { canonicalWordId, displayWord: canonicalWordId.replace(/-/g, ""), microSkillKey },
    ]),
  );
}

function planFacts(overrides: Partial<DailyPlanFacts>): DailyPlanFacts {
  return {
    childId: CHILD,
    reviewPolicy: policy,
    composerPolicy,
    bundles: [],
    scheduleWords: [],
    reviewWordFacts: new Map(),
    familyMethods: FAMILY_METHODS,
    activityTemplates: TEMPLATES,
    teachingContent: TEACHING_CONTENT,
    skillFamilyKeyBySkill: FAMILY_BY_SKILL,
    learningItems: [],
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
    dictionary: buildDictionary([]),
    childBand: CHILD_BAND,
    taughtHistory: failClosedTaughtWordHistoryProvider,
    probeRuns: [],
    probeMissWordIdsToday: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tie-breaker truth
// ---------------------------------------------------------------------------

{
  // Reteach beats bigger cluster.
  const items = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", itemStatus: "pending_reteach", reteachPriority: true, ejectedOn: "2026-06-25", sourceKind: "review_ejection" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PAT_A" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PAT_A" }),
    item({ canonicalWordId: "w5", microSkillKey: "SKILL_PAT_A" }),
    item({ canonicalWordId: "w6", microSkillKey: "SKILL_PAT_A" }),
  ];
  const result = selectPartTwoSkill(selectionFacts(items));
  assert(result.microSkillKey === "SKILL_PG_A", "reteach demand beats a bigger cluster");
  assert(result.decidingTier === "reteach_demand", `audit names reteach_demand, got ${result.decidingTier}`);
}

{
  // Oldest ejection wins inside the reteach tier.
  const items = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", itemStatus: "pending_reteach", reteachPriority: true, ejectedOn: "2026-06-28", sourceKind: "review_ejection" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PAT_A", itemStatus: "pending_reteach", reteachPriority: true, ejectedOn: "2026-06-22", sourceKind: "review_ejection" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PAT_A" }),
  ];
  const result = selectPartTwoSkill(selectionFacts(items));
  assert(result.microSkillKey === "SKILL_PAT_A", "oldest ejection wins the reteach tier");
}

{
  // A selectable prerequisite beats its dependent skill; empty prerequisite
  // facts make the tier a no-op.
  const items = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-20" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-20" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PG_B", intakeOn: "2026-06-20" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PG_B", intakeOn: "2026-06-20" }),
  ];
  const withPrereq = selectPartTwoSkill(
    selectionFacts(items, {
      prerequisiteKeysBySkill: new Map([["SKILL_PG_A", ["SKILL_PG_B"]]]),
    }),
  );
  assert(withPrereq.microSkillKey === "SKILL_PG_B", "selectable prerequisite is selected first");
  assert(withPrereq.decidingTier === "prerequisite_precedence", "audit names prerequisite_precedence");

  const noFacts = selectPartTwoSkill(selectionFacts(items));
  assert(noFacts.microSkillKey === "SKILL_PG_A", "empty prerequisite facts fall through to key order");
  const prereqEntry = noFacts.audit.find((entry) => entry.tier === "prerequisite_precedence");
  assert(prereqEntry !== undefined && !prereqEntry.decided, "prerequisite tier is a no-op without facts");

  // A prerequisite cycle empties the deferral and fails open.
  const cycle = selectPartTwoSkill(
    selectionFacts(items, {
      prerequisiteKeysBySkill: new Map([
        ["SKILL_PG_A", ["SKILL_PG_B"]],
        ["SKILL_PG_B", ["SKILL_PG_A"]],
      ]),
    }),
  );
  assert(cycle.microSkillKey === "SKILL_PG_A", "prerequisite cycles fail open to later tiers");
}

{
  // Cluster size beats item age; age beats frequency; frequency decides
  // before rotation; rotation only on ties; stable key order last.
  const clusterItems = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-07-01" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-07-01" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PG_A", intakeOn: "2026-07-01" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "w5", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-01" }),
  ];
  const clusterResult = selectPartTwoSkill(selectionFacts(clusterItems));
  assert(clusterResult.microSkillKey === "SKILL_PG_A", "largest cluster beats older items");
  assert(clusterResult.decidingTier === "largest_cluster", "audit names largest_cluster");

  const ageItems = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-07-01" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-15" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-07-01" }),
  ];
  const ageResult = selectPartTwoSkill(
    selectionFacts(ageItems, {
      frequencyBandByWordId: new Map([
        ["w3", "high"],
        ["w4", "high"],
      ]),
    }),
  );
  assert(ageResult.microSkillKey === "SKILL_PG_A", "oldest learning item beats frequency usefulness");
  assert(ageResult.decidingTier === "oldest_learning_item", "audit names oldest_learning_item");

  const frequencyItems = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-10" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-10" }),
  ];
  const frequencyResult = selectPartTwoSkill(
    selectionFacts(frequencyItems, {
      frequencyBandByWordId: new Map([
        ["w1", "low"],
        ["w2", "low"],
        ["w3", "high"],
        ["w4", "low"],
      ]),
    }),
  );
  assert(frequencyResult.microSkillKey === "SKILL_PAT_A", "high-frequency words break the tie");
  assert(frequencyResult.decidingTier === "frequency_usefulness", "audit names frequency_usefulness");

  const rotationItems = [
    item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-10" }),
    item({ canonicalWordId: "w3", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "w4", microSkillKey: "SKILL_PAT_A", intakeOn: "2026-06-10" }),
  ];
  const rotationResult = selectPartTwoSkill(
    selectionFacts(rotationItems, { previousLessonFamilyKey: "D4_PG" }),
  );
  assert(rotationResult.microSkillKey === "SKILL_PAT_A", "family rotation avoids the previous family");
  assert(rotationResult.decidingTier === "family_rotation", "audit names family_rotation");

  const keyOrderResult = selectPartTwoSkill(selectionFacts(rotationItems));
  assert(keyOrderResult.microSkillKey === "SKILL_PAT_A", "stable micro_skill_key order decides last");
  assert(keyOrderResult.decidingTier === "micro_skill_key", "audit names micro_skill_key");

  // Rotation is a no-op when every candidate shares the previous family.
  const sameFamily = selectPartTwoSkill(
    selectionFacts(
      [
        item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
        item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-10" }),
        item({ canonicalWordId: "w3", microSkillKey: "SKILL_PG_B", intakeOn: "2026-06-01" }),
        item({ canonicalWordId: "w4", microSkillKey: "SKILL_PG_B", intakeOn: "2026-06-10" }),
      ],
      { previousLessonFamilyKey: "D4_PG" },
    ),
  );
  assert(sameFamily.microSkillKey === "SKILL_PG_A", "rotation fails open when no alternative family exists");
}

{
  // Fewer than 2 real items -> not selectable; none anywhere -> skip reason.
  const result = selectPartTwoSkill(
    selectionFacts([item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A" })]),
  );
  assert(result.microSkillKey === null, "a single item never selects a skill");
  assert(result.skipReason === "insufficient_real_learning_items", "skip reason is insufficient_real_learning_items");
  const paused = selectPartTwoSkill(
    selectionFacts([
      item({ canonicalWordId: "w1", microSkillKey: "SKILL_PG_A", itemStatus: "paused_parent_review" }),
      item({ canonicalWordId: "w2", microSkillKey: "SKILL_PG_A", itemStatus: "paused_parent_review" }),
    ]),
  );
  assert(paused.microSkillKey === null, "paused items are not real unresolved items");
}

// ---------------------------------------------------------------------------
// 5-word fill and probe rules
// ---------------------------------------------------------------------------

const FILL_DICTIONARY = buildDictionary([
  { id: "wi-1", level: 1, skills: ["SKILL_PG_A"] },
  { id: "wi-2", level: 1, skills: ["SKILL_PG_A"] },
  { id: "wi-3", level: 2, skills: ["SKILL_PG_A"] },
  { id: "wi-4", level: 1, skills: ["SKILL_PG_A"] },
  { id: "wi-5", level: 2, skills: ["SKILL_PG_A"] },
  { id: "outlier", level: 3, skills: ["SKILL_PG_A"] },
  { id: "new-1", level: 2, skills: ["SKILL_PG_A"] },
  { id: "new-2", level: 2, skills: ["SKILL_PG_A"] },
  { id: "new-3", level: 1, skills: ["SKILL_PG_A"] },
  { id: "new-4", level: 3, skills: ["SKILL_PG_A"] },
]);

function fillFacts(
  items: readonly LearningItemFact[],
  overrides: Partial<WordSelectionFacts> = {},
): WordSelectionFacts {
  return {
    learningItems: items,
    dictionary: FILL_DICTIONARY,
    taughtHistory: failClosedTaughtWordHistoryProvider,
    probeRuns: [],
    probeMissWordIdsToday: [],
    ...overrides,
  };
}

{
  // Items only: five items fill the lesson; no probe, no stretch.
  const items = ["wi-1", "wi-2", "wi-3", "wi-4", "wi-5"].map((id, index) =>
    item({ canonicalWordId: id, microSkillKey: "SKILL_PG_A", intakeOn: addDays("2026-06-01", index) }),
  );
  const result = selectLessonWords("SKILL_PG_A", CHILD, fillFacts(items), CHILD_BAND, composerPolicy, TODAY);
  assert(result.slots.length === 5, "five items fill five slots");
  assert(result.slots.every((slot) => slot.provenance === "learning_item"), "items-only lesson");
  assert(result.slots[0].canonicalWordId === "wi-1", "oldest item first");
  assert(result.probePlan === null, "no probe when items fill the lesson");
  assert(result.stretchItemIntakes.length === 0, "no stretch intakes when items fill the lesson");
  assert(result.skipReasons.length === 0, "no skips on a full item fill");
}

{
  // Adjacent-band constraint: a much-harder outlier waits.
  const items = [
    item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-02" }),
    item({ canonicalWordId: "outlier", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-03" }),
    item({ canonicalWordId: "wi-3", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-04" }),
  ];
  const result = selectLessonWords("SKILL_PG_A", CHILD, fillFacts(items), CHILD_BAND, composerPolicy, TODAY);
  assert(result.deferredOutlierWordIds.includes("outlier"), "level-3 outlier deferred from a level-1/2 window");
  assert(!result.slots.some((slot) => slot.canonicalWordId === "outlier"), "outlier not selected");
  assert(result.complexityWindow !== null && result.complexityWindow.max <= 2, "window stays adjacent");
}

{
  // Items + today's probe misses fill before stretch.
  const items = [
    item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-02" }),
    item({ canonicalWordId: "wi-3", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-03" }),
  ];
  const result = selectLessonWords(
    "SKILL_PG_A",
    CHILD,
    fillFacts(items, { probeMissWordIdsToday: ["new-1", "new-2"] }),
    CHILD_BAND,
    composerPolicy,
    TODAY,
  );
  assert(result.slots.length === 5, "items + probe misses fill the lesson");
  assert(
    result.slots.filter((slot) => slot.provenance === "probe_miss").length === 2,
    "probe misses take the open slots",
  );
  assert(result.probePlan === null, "no new probe once today's probe has run");
}

{
  // Items + stretch: probe planned, stretch still fills the lesson (a passed
  // probe never cancels the lesson), stretch words get item intakes.
  const items = [
    item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-02" }),
  ];
  const result = selectLessonWords("SKILL_PG_A", CHILD, fillFacts(items), CHILD_BAND, composerPolicy, TODAY);
  assert(result.slots.length === 5, "stretch fills to five words");
  assert(result.probePlan !== null && result.probePlan.canonicalWordIds.length === 3, "probe covers the open slots");
  const stretchSlots = result.slots.filter((slot) => slot.provenance === "stretch");
  assert(stretchSlots.length === 3, "three stretch slots");
  assert(result.stretchItemIntakes.length === 3, "every stretch word gets a learning-item intake");
  assert(
    stretchSlots.every((slot) => slot.learningItemId !== null),
    "stretch slots trace to their intake items",
  );
  assert(
    stretchSlots.every((slot) => (slot.complexityLevel ?? 0) <= 2),
    "stretch stays in the adjacent-band window (no level-3 stretch from a level-1 anchor)",
  );
  // Probe and stretch never share words.
  const probeSet = new Set(result.probePlan?.canonicalWordIds ?? []);
  assert(stretchSlots.every((slot) => !probeSet.has(slot.canonicalWordId)), "probe and stretch words are disjoint");
}

{
  // Probe cap edges: a run 13 days ago blocks, 14 days ago allows.
  const items = [
    item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-02" }),
  ];
  const runAt = (runOn: string): ProbeRunFact[] => [
    { childId: CHILD, microSkillKey: "SKILL_PG_A", runOn, rowStatus: "active" },
  ];
  const blocked = selectLessonWords(
    "SKILL_PG_A", CHILD,
    fillFacts(items, { probeRuns: runAt(addDays(TODAY, -13)) }),
    CHILD_BAND, composerPolicy, TODAY,
  );
  assert(blocked.probePlan === null, "13-day-old probe run blocks a new probe");
  assert(blocked.skipReasons.includes("probe_cap_reached"), "probe_cap_reached recorded");
  assert(blocked.slots.length === 5, "stretch still fills the lesson under the cap");

  const allowed = selectLessonWords(
    "SKILL_PG_A", CHILD,
    fillFacts(items, { probeRuns: runAt(addDays(TODAY, -14)) }),
    CHILD_BAND, composerPolicy, TODAY,
  );
  assert(allowed.probePlan !== null, "14-day-old probe run allows a new probe");
  assert(!allowed.skipReasons.includes("probe_cap_reached"), "no cap skip at exactly 14 days");
}

{
  // Not-previously-taught: taught history excludes probe/stretch candidates.
  const taughtAll: TaughtWordHistoryProvider = { wasTaughtOrProbed: () => true };
  const items = [
    item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
    item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-02" }),
  ];
  const result = selectLessonWords(
    "SKILL_PG_A", CHILD,
    fillFacts(items, { taughtHistory: taughtAll }),
    CHILD_BAND, composerPolicy, TODAY,
  );
  assert(result.probePlan === null, "no probe when every dictionary word was already taught/probed");
  assert(result.skipReasons.includes("no_diagnostic_eligible_words"), "no_diagnostic_eligible_words recorded");
  assert(result.skipReasons.includes("missing_required_words"), "under-filled lesson records missing_required_words");
  assert(result.slots.length === 2, "no invented words — only the real items remain");
}

// ---------------------------------------------------------------------------
// Throttle integration and full-day assembly
// ---------------------------------------------------------------------------

const LESSON_ITEMS = [
  item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-01" }),
  item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-02" }),
  item({ canonicalWordId: "wi-3", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-03" }),
  item({ canonicalWordId: "wi-4", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-04" }),
  item({ canonicalWordId: "wi-5", microSkillKey: "SKILL_PG_A", intakeOn: "2026-06-05" }),
];

function dueFixture(count: number) {
  const wordIds = Array.from({ length: count }, (_, index) => `rev-${String(index + 1).padStart(2, "0")}`);
  const { bundle, words } = dueBundle("bundle-throttle", wordIds);
  return {
    bundles: [bundle],
    scheduleWords: words,
    reviewWordFacts: reviewWordFacts(wordIds.map((id) => [id, "SKILL_PAT_A"])),
  };
}

{
  // 10 due -> lesson composes; 11 due -> review-only with the counts.
  const at10 = composeDailyPlan(
    planFacts({ ...dueFixture(10), learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY }),
    TODAY,
  );
  assert(at10.throttle.lessonAllowed, "throttle allows the lesson at exactly 10 due");
  assert(at10.partTwo.composed, "Part 2 composes at the cap");
  assert(at10.partTwo.microSkillKey === "SKILL_PG_A", "the item cluster's skill is selected");

  const at11 = composeDailyPlan(
    planFacts({ ...dueFixture(11), learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY }),
    TODAY,
  );
  assert(!at11.partTwo.composed, "11 due is a review-only day");
  const debtSkip = at11.partTwo.skips.find((skip) => skip.reason === "review_debt_blocks_lesson");
  assert(debtSkip !== undefined, "review_debt_blocks_lesson recorded");
  assert(debtSkip?.evidence.totalDue === 11 && debtSkip?.evidence.sessionCap === 10, "skip carries the counts");
  assert(at11.partOne.dueQueue.length === 10, "the session itself stays capped at 10");
  assert(at11.partTwo.selectionAudit.length === 0, "no selection runs on a review-only day");
}

{
  // Reteach lesson outranks a new cluster in the full plan.
  const items = [
    ...LESSON_ITEMS,
    item({ canonicalWordId: "new-1", microSkillKey: "SKILL_PAT_A", itemStatus: "pending_reteach", reteachPriority: true, ejectedOn: "2026-06-20", sourceKind: "review_ejection" }),
    item({ canonicalWordId: "new-2", microSkillKey: "SKILL_PAT_A" }),
  ];
  const dictionary = buildDictionary([
    { id: "wi-1", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wi-2", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wi-3", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wi-4", level: 1, skills: ["SKILL_PG_A"] },
    { id: "wi-5", level: 1, skills: ["SKILL_PG_A"] },
    { id: "new-1", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-2", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-3", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-4", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-5", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-6", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-7", level: 1, skills: ["SKILL_PAT_A"] },
    { id: "new-8", level: 1, skills: ["SKILL_PAT_A"] },
  ]);
  const plan = composeDailyPlan(planFacts({ learningItems: items, dictionary }), TODAY);
  assert(plan.partTwo.microSkillKey === "SKILL_PAT_A", "reteach demand outranks the bigger new cluster");
  assert(plan.partTwo.composed, "reteach lesson composes");
}

// ---------------------------------------------------------------------------
// Review session shape and session-mix ordering
// ---------------------------------------------------------------------------

{
  // Sort dimensions come from each word's family; homophone words get
  // sentence-context production; reflection carries the misconception hint.
  const wordIds = ["mix-1", "mix-2", "mix-3", "mix-4"];
  const { bundle, words } = dueBundle("bundle-mix", wordIds);
  const facts = planFacts({
    bundles: [bundle],
    scheduleWords: words,
    reviewWordFacts: reviewWordFacts([
      ["mix-1", "SKILL_PG_A"],
      ["mix-2", "SKILL_PG_B"],
      ["mix-3", "SKILL_HOM_A"],
      ["mix-4", "SKILL_PAT_A"],
    ]),
  });
  const plan = composeDailyPlan(facts, TODAY);
  const quickSort = plan.partOne.sections.find((section) => section.sectionKey === "review_quick_sort");
  assert(quickSort !== undefined, "quick-sort step composes");
  const sortWords = (quickSort?.items[0].payload.words ?? []) as { canonicalWordId: string; sortDimension: string }[];
  const dimensionOf = (id: string) => sortWords.find((word) => word.canonicalWordId === id)?.sortDimension;
  assert(dimensionOf("mix-1") === "sound/spelling cue", "PG word sorts on sound/spelling cue");
  assert(dimensionOf("mix-3") === "meaning/sentence fit", "homophone word sorts on meaning/sentence fit");
  assert(dimensionOf("mix-4") === "rule/pattern", "pattern word sorts on rule/pattern");

  const production = plan.partOne.sections.find((section) => section.sectionKey === "review_production");
  const productionFor = (id: string) => production?.items.find((entry) => entry.canonicalWordId === id);
  assert(productionFor("mix-3")?.templateKey === "DICTATION_SENTENCE_CONTEXT", "homophone-family word requires sentence-context production");
  assert(productionFor("mix-1")?.templateKey === "REVIEW_DICTATION", "non-homophone word takes review dictation");

  const reflection = plan.partOne.sections.find((section) => section.sectionKey === "review_reflection");
  assert(reflection?.items.length === 4, "one conditional reflection slot per review word");
  assert(
    reflection?.items.every((entry) => typeof entry.payload.misconceptionHint === "string"),
    "reflection slots carry the common_misconceptions hint",
  );
}

{
  // Session-mix ordering: same-family adjacency resolved by the pinned
  // nearest-swap; single-family sets pass through unchanged; the mix is a
  // permutation of exactly the capped queue.
  const abFamilies = new Map([
    ["a1", "F1"], ["a2", "F1"], ["b1", "F2"], ["b2", "F2"],
  ]);
  const mixed = sessionMixOrder(["a1", "a2", "b1", "b2"], (id) => abFamilies.get(id) ?? null);
  assert(mixed.join(",") === "a1,b1,a2,b2", `AABB mixes to ABAB, got ${mixed.join(",")}`);
  for (let index = 1; index < mixed.length; index += 1) {
    assert(abFamilies.get(mixed[index]) !== abFamilies.get(mixed[index - 1]), "no same-family adjacency when the mix allows");
  }

  const single = sessionMixOrder(["s1", "s2", "s3"], () => "F1");
  assert(single.join(",") === "s1,s2,s3", "single-family due sets pass through unchanged");

  const infeasible = sessionMixOrder(["a1", "a2", "a3", "b1"], (id) => (id.startsWith("a") ? "F1" : "F2"));
  assert(
    [...infeasible].sort().join(",") === "a1,a2,a3,b1",
    "infeasible mixes still keep exactly the same members",
  );

  // Full-plan invariant: presentation order is a permutation of the capped
  // due queue.
  const wordIds = ["mix-1", "mix-2", "mix-3", "mix-4"];
  const { bundle, words } = dueBundle("bundle-perm", wordIds);
  const plan = composeDailyPlan(
    planFacts({
      bundles: [bundle],
      scheduleWords: words,
      reviewWordFacts: reviewWordFacts([
        ["mix-1", "SKILL_PG_A"],
        ["mix-2", "SKILL_PG_B"],
        ["mix-3", "SKILL_HOM_A"],
        ["mix-4", "SKILL_PAT_A"],
      ]),
    }),
    TODAY,
  );
  assert(
    [...plan.partOne.presentationOrder].sort().join(",") ===
      plan.partOne.dueQueue.map((item) => item.canonicalWordId).sort().join(","),
    "presentation order never drops or adds words relative to the capped queue",
  );
  // mix-1 (PG_A) and mix-2 (PG_B) share family D4_PG: the mix must separate
  // them because two other families are due.
  const order = plan.partOne.presentationOrder;
  const familyAt = (index: number) =>
    FAMILY_BY_SKILL.get(
      (facts_reviewWordSkill(order[index])) as string,
    );
  function facts_reviewWordSkill(id: string): string | undefined {
    const map: Record<string, string> = {
      "mix-1": "SKILL_PG_A",
      "mix-2": "SKILL_PG_B",
      "mix-3": "SKILL_HOM_A",
      "mix-4": "SKILL_PAT_A",
    };
    return map[id];
  }
  for (let index = 1; index < order.length; index += 1) {
    assert(familyAt(index) !== familyAt(index - 1), "no two same-family words adjacent in the presentation order");
  }
}

// ---------------------------------------------------------------------------
// Time budget
// ---------------------------------------------------------------------------

{
  // 8 due + full lesson = 27 responses -> guided trims 3 -> 2 words (25);
  // production and reflection never shrink.
  const fixture = dueFixture(8);
  const plan = composeDailyPlan(
    planFacts({ ...fixture, learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY }),
    TODAY,
  );
  assert(plan.partTwo.composed, "lesson composes at 8 due");
  assert(plan.budget.trims.join(",") === "guided_repetitions", `guided reps trim first, got ${plan.budget.trims}`);
  assert(plan.budget.guidedWordCount === 2, "guided sequence trimmed to 2 words");
  assert(!plan.budget.introTrimmed, "intro untouched while guided trim suffices");
  assert(plan.budget.estimatedResponses <= plan.budget.budgetResponses, "estimate lands within budget");
  const guided = plan.partTwo.sections.find((section) => section.sectionKey === "guided_practice");
  assert(guided?.items.length === 4, "two guided templates x two words");
  const controlled = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_production");
  assert(controlled?.items.length === 5, "all five words still produced (controlled)");
  const dictation = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_dictation");
  assert(dictation?.items.length === 5, "all five words still produced (dictation)");
  const reflection = plan.partOne.sections.find((section) => section.sectionKey === "review_reflection");
  assert(reflection?.items.length === 8, "reflection slots never shrink");
}

{
  // 10 due + full lesson: guided trim is not enough -> intro trims next;
  // production still never shrinks.
  const fixture = dueFixture(10);
  const plan = composeDailyPlan(
    planFacts({ ...fixture, learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY }),
    TODAY,
  );
  assert(plan.partTwo.composed, "lesson composes at 10 due");
  assert(
    plan.budget.trims.join(",") === "guided_repetitions,intro_length",
    `trim order pinned guided-then-intro, got ${plan.budget.trims}`,
  );
  assert(plan.budget.introTrimmed, "intro trimmed after guided reps");
  const intro = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_intro");
  assert(intro?.items.length === 1, "trimmed intro keeps the read-only micro-skill intro");
  const controlled = plan.partTwo.sections.find((section) => section.sectionKey === "lesson_production");
  assert(controlled?.items.length === 5, "production never cut by the budget");
}

{
  // A probe replaces the lesson's dictation — never additional — and the
  // budget prices the probe's words.
  const items = LESSON_ITEMS.slice(0, 2);
  const plan = composeDailyPlan(
    planFacts({ learningItems: items, dictionary: FILL_DICTIONARY }),
    TODAY,
  );
  assert(plan.partTwo.composed, "probe lesson composes");
  assert(plan.partTwo.probePlan !== null, "probe planned for the open slots");
  assert(
    plan.partTwo.sections.some((section) => section.sectionKey === "lesson_probe"),
    "probe section present",
  );
  assert(
    !plan.partTwo.sections.some((section) => section.sectionKey === "lesson_dictation"),
    "no dictation section when the probe replaces it",
  );
}

// ---------------------------------------------------------------------------
// Fail-closed sweeps
// ---------------------------------------------------------------------------

{
  // Missing family method.
  const noPgMethod = FAMILY_METHODS.filter((method) => method.familyKey !== "D4_PG");
  const plan = composeDailyPlan(
    planFacts({ learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY, familyMethods: noPgMethod }),
    TODAY,
  );
  assert(!plan.partTwo.composed, "missing family method blocks the lesson");
  assert(
    plan.partTwo.skips.some((skip) => skip.reason === "missing_activity_strategy" && skip.evidence.missing === "family_method"),
    "missing_activity_strategy(family_method) recorded",
  );

  // Missing template (guided template removed).
  const noGraphemeMap = TEMPLATES.filter((entry) => entry.templateKey !== "PG_GRAPHEME_MAP");
  const templatePlan = composeDailyPlan(
    planFacts({ learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY, activityTemplates: noGraphemeMap }),
    TODAY,
  );
  assert(!templatePlan.partTwo.composed, "missing guided template blocks the lesson");
  assert(
    templatePlan.partTwo.skips.some(
      (skip) => skip.reason === "missing_activity_strategy" && skip.evidence.templateKey === "PG_GRAPHEME_MAP",
    ),
    "missing_activity_strategy(template) names the template",
  );

  // Missing teaching content.
  const contentPlan = composeDailyPlan(
    planFacts({ learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY, teachingContent: new Map() }),
    TODAY,
  );
  assert(!contentPlan.partTwo.composed, "missing teaching content blocks the lesson");
  assert(
    contentPlan.partTwo.skips.some((skip) => skip.reason === "missing_teaching_metadata"),
    "missing_teaching_metadata recorded",
  );

  // Empty dictionary: exact learner targets fail closed and nothing is invented.
  const emptyPlan = composeDailyPlan(
    planFacts({ learningItems: LESSON_ITEMS.slice(0, 2), dictionary: buildDictionary([]) }),
    TODAY,
  );
  assert(!emptyPlan.partTwo.composed, "empty dictionary blocks the lesson");
  assert(
    emptyPlan.partTwo.skips.some((skip) => skip.reason === "canonical_target_content_incomplete"),
    "canonical_target_content_incomplete recorded on an empty dictionary",
  );
  assert(emptyPlan.partTwo.lessonWords.length === 0, "incomplete exact targets are not presented or substituted");

  // Unknown micro-skill.
  const unknownSkillItems = [
    item({ canonicalWordId: "wi-1", microSkillKey: "SKILL_GHOST" }),
    item({ canonicalWordId: "wi-2", microSkillKey: "SKILL_GHOST" }),
  ];
  const unknownPlan = composeDailyPlan(
    planFacts({ learningItems: unknownSkillItems, dictionary: FILL_DICTIONARY }),
    TODAY,
  );
  assert(!unknownPlan.partTwo.composed, "unknown micro-skill blocks the lesson");
  assert(
    unknownPlan.partTwo.skips.some((skip) => skip.reason === "unknown_micro_skill"),
    "unknown_micro_skill recorded",
  );

  // Part 1 fail-closed: a due word without review facts skips explicitly and
  // never composes items.
  const { bundle, words } = dueBundle("bundle-ghost", ["ghost-1", "known-1"]);
  const partOnePlan = composeDailyPlan(
    planFacts({
      bundles: [bundle],
      scheduleWords: words,
      reviewWordFacts: reviewWordFacts([["known-1", "SKILL_PG_A"]]),
    }),
    TODAY,
  );
  assert(
    partOnePlan.partOne.skips.some(
      (skip) => skip.reason === "missing_teaching_metadata" && skip.evidence.canonicalWordId === "ghost-1",
    ),
    "due word without facts fails closed",
  );
  const composedWordIds = partOnePlan.partOne.sections
    .flatMap((section) => section.items)
    .map((entry) => entry.canonicalWordId)
    .filter((id): id is string => id !== null);
  assert(!composedWordIds.includes("ghost-1"), "no item composes for the factless word");
}

// ---------------------------------------------------------------------------
// Write path (3D)
// ---------------------------------------------------------------------------

{
  // Lesson completion: exactly one bundle over the successful words, taught
  // events with raw attempts for all five, item transitions for the items.
  const reteachItem = item({
    canonicalWordId: "wi-1",
    microSkillKey: "SKILL_PG_A",
    itemStatus: "pending_reteach",
    reteachPriority: true,
    ejectedOn: "2026-06-20",
    sourceKind: "review_ejection",
  });
  const normalItems = ["wi-2", "wi-3", "wi-4", "wi-5"].map((id) =>
    item({ canonicalWordId: id, microSkillKey: "SKILL_PG_A" }),
  );
  const result = onLessonCompleted(policy, {
    childId: CHILD,
    microSkillKey: "SKILL_PG_A",
    completedOn: TODAY,
    sourceRef: `lesson:${CHILD}:${TODAY}:SKILL_PG_A`,
    bundleId: "bundle-new",
    producedWords: [
      { canonicalWordId: "wi-1", attemptText: "wun", correct: true },
      { canonicalWordId: "wi-2", attemptText: "wi2", correct: true },
      { canonicalWordId: "wi-3", attemptText: "wi3", correct: true },
      { canonicalWordId: "wi-4", attemptText: "wi4", correct: true },
      { canonicalWordId: "wi-5", attemptText: "wrong", correct: false },
    ],
    learningItems: [reteachItem, ...normalItems],
  });
  assert(result.bundle !== null && result.scheduleWords.length === 4, "one bundle over the four successful words");
  assert(result.bundle?.nextDueOn === addDays(TODAY, 1), "successful words enter the 1-day review");
  const reteachRow = result.scheduleWords.find((word) => word.canonicalWordId === "wi-1");
  assert(reteachRow?.reteachCycleCount === 1, "reteach re-entry carries the incremented cycle count");
  assert(result.scheduleWords.filter((word) => word.reteachCycleCount === 0).length === 3, "fresh words start at cycle 0");
  assert(result.taughtEvents.length === 5, "taught events for every produced word");
  assert(
    result.taughtEvents.every((event) => typeof event.attemptText === "string"),
    "raw attempt text rides every taught event",
  );
  const transitioned = result.itemTransitions.filter((entry) => entry.itemStatus === "awaiting_review_outcome");
  assert(transitioned.length === 4, "successful items flip to awaiting_review_outcome");
  const missed = result.itemTransitions.find((entry) => entry.canonicalWordId === "wi-5");
  assert(missed?.itemStatus === "pending", "missed word's item stays selectable");
}

{
  // Probe completion: books the run, probed events + misses, unmapped
  // misspellings routed (returned) to the candidate queue.
  const result = onProbeCompleted({
    childId: CHILD,
    microSkillKey: "SKILL_PG_A",
    completedOn: TODAY,
    sourceRef: `probe:${CHILD}:${TODAY}:SKILL_PG_A`,
    words: [
      { canonicalWordId: "new-1", targetWord: "new1", attemptText: "new1", correct: true },
      { canonicalWordId: "new-2", targetWord: "new2", attemptText: "nue2", correct: false },
      { canonicalWordId: null, targetWord: "offmap", attemptText: "ofmap", correct: false },
    ],
  });
  assert(result.probeRun.wordCount === 3, "probe run books every probe word");
  assert(result.probedEvents.length === 2, "probed events for canonical words only");
  assert(result.probedEvents.every((event) => event.attemptText !== null), "attempt text on probed events");
  assert(result.itemIntakes.length === 1, "cold miss with truth becomes a learning item");
  assert(result.itemIntakes[0].sourceKind === "probe_miss", "probe-miss source kind");
  assert(result.itemIntakes[0].sourceAttemptText === "nue2", "raw attempt rides the intake row");
  assert(result.candidateQueueRoutes.length === 1, "unmapped miss routes to the candidate queue");
  assert(result.candidateQueueRoutes[0].attemptText === "ofmap", "route carries the raw attempt, never invents truth");
}

{
  // Review session completion: pass/fail through Slice 2, ejection
  // round-trip, 3+-wrong reopen, attempt text on production events.
  const { bundle, words } = dueBundle("bundle-review", ["rw-1", "rw-2", "rw-3"]);
  // A separate catch-up word at stage 2, due today, that will eject.
  const catchUpBundle = dueBundle("bundle-catchup", ["cu-1"], addDays(TODAY, -10));
  const catchUpWord: ScheduleWordFact = {
    ...catchUpBundle.words[0],
    membershipStatus: "catch_up",
    catchUpStage: 2,
    failedReviewOn: addDays(TODAY, -3),
    nextRetestDueOn: TODAY,
  };
  const skillByWord = new Map([
    ["rw-1", "SKILL_PG_A"],
    ["rw-2", "SKILL_PAT_A"],
    ["rw-3", "SKILL_PG_A"],
    ["cu-1", "SKILL_HOM_A"],
  ]);
  const result = onReviewSessionCompleted(policy, {
    childId: CHILD,
    completedOn: TODAY,
    sourceRef: `review:${CHILD}:${TODAY}`,
    bundles: [bundle, catchUpBundle.bundle],
    scheduleWords: [...words, catchUpWord],
    outcomes: [
      { canonicalWordId: "rw-1", bundleId: "bundle-review", kind: "bundle_review", passed: false, attemptText: "rq1" },
      { canonicalWordId: "rw-2", bundleId: "bundle-review", kind: "bundle_review", passed: false, attemptText: "rq2" },
      { canonicalWordId: "rw-3", bundleId: "bundle-review", kind: "bundle_review", passed: true, attemptText: "rw3" },
      { canonicalWordId: "cu-1", bundleId: "bundle-catchup", kind: "catch_up_retest", passed: false, attemptText: "cu1" },
    ],
    microSkillKeyByWordId: skillByWord,
  });
  const ejected = result.itemIntakes.find((entry) => entry.canonicalWordId === "cu-1");
  assert(ejected !== undefined, "stage-2 retest failure round-trips into a learning item");
  assert(ejected?.itemStatus === "pending_reteach" && ejected?.reteachPriority, "ejection intake is pending_reteach with reteach priority");
  assert(ejected?.ejectedOn === TODAY && ejected?.sourceAttemptText === "cu1", "ejection intake carries date and raw attempt");
  assert(
    result.reopenMicroSkillKeys.join(",") === "SKILL_HOM_A,SKILL_PAT_A,SKILL_PG_A",
    `3+ wrong reopens the failed words' skills, got ${result.reopenMicroSkillKeys}`,
  );
  const failEvent = result.outcomeEvents.find(
    (event) => event.eventType === "review_fail" && event.canonicalWordId === "rw-1",
  );
  assert(failEvent?.attemptText === "rq1", "attempt text rides the review outcome event");
  const passEvent = result.outcomeEvents.find(
    (event) => event.eventType === "review_pass" && event.canonicalWordId === "rw-3",
  );
  assert(passEvent?.attemptText === "rw3", "attempt text rides pass events too");
  const flaggedEvent = result.outcomeEvents.find((event) => event.eventType === "reteach_priority_flagged");
  assert(flaggedEvent !== undefined && flaggedEvent.attemptText === null, "non-production events carry no attempt text");
  const advanced = result.updatedBundles.find((entry) => entry.bundleId === "bundle-review");
  assert(advanced?.intervalIndex === 1, "bundle advances through the Slice 2 transition only");

  // Fewer than 3 wrong -> no reopen.
  const smallResult = onReviewSessionCompleted(policy, {
    childId: CHILD,
    completedOn: TODAY,
    sourceRef: `review:${CHILD}:${TODAY}:small`,
    bundles: [dueBundle("bundle-small", ["sw-1", "sw-2"]).bundle],
    scheduleWords: dueBundle("bundle-small", ["sw-1", "sw-2"]).words,
    outcomes: [
      { canonicalWordId: "sw-1", bundleId: "bundle-small", kind: "bundle_review", passed: false, attemptText: "s1" },
      { canonicalWordId: "sw-2", bundleId: "bundle-small", kind: "bundle_review", passed: true, attemptText: "s2" },
    ],
    microSkillKeyByWordId: new Map([["sw-1", "SKILL_PG_A"], ["sw-2", "SKILL_PG_A"]]),
  });
  assert(smallResult.reopenMicroSkillKeys.length === 0, "fewer than 3 wrong never reopens");
}

{
  // Post-reteach failure pauses the word for parent review and pauses its
  // item (word_pending_parent_review evidence).
  const pausedBundle = dueBundle("bundle-pause", ["pw-1"], addDays(TODAY, -10));
  const pausedWord: ScheduleWordFact = {
    ...pausedBundle.words[0],
    membershipStatus: "catch_up",
    catchUpStage: 2,
    failedReviewOn: addDays(TODAY, -3),
    nextRetestDueOn: TODAY,
    reteachCycleCount: 1,
  };
  const result = onReviewSessionCompleted(policy, {
    childId: CHILD,
    completedOn: TODAY,
    sourceRef: `review:${CHILD}:${TODAY}:pause`,
    bundles: [pausedBundle.bundle],
    scheduleWords: [pausedWord],
    outcomes: [
      { canonicalWordId: "pw-1", bundleId: "bundle-pause", kind: "catch_up_retest", passed: false, attemptText: "pw1" },
    ],
    microSkillKeyByWordId: new Map([["pw-1", "SKILL_PG_A"]]),
  });
  assert(result.pausedForParentReview.join(",") === "pw-1", "post-reteach failure pauses for parent review");
  assert(result.itemIntakes.length === 0, "a paused word does not re-enter as a reteach item");
  const pausedItems = pauseItemsForParentReview(
    [item({ canonicalWordId: "pw-1", microSkillKey: "SKILL_PG_A" })],
    CHILD,
    result.pausedForParentReview,
  );
  assert(pausedItems.length === 1 && pausedItems[0].itemStatus === "paused_parent_review", "the word's item pauses too");
}

{
  // Verified-misspelling bridge: promoted candidates with dictionary truth
  // intake; others stay in the candidate flow.
  const candidates: VerifiedMisspellingCandidateFact[] = [
    {
      candidateMappingId: "cand-1",
      childId: CHILD,
      misspellingNormalised: "becos",
      correctSpellingNormalised: "because",
      microSkillKey: "SKILL_PG_A",
      candidateStatus: "parent_local_promoted",
      verifiedOn: "2026-07-01",
    },
    {
      candidateMappingId: "cand-2",
      childId: CHILD,
      misspellingNormalised: "wich",
      correctSpellingNormalised: "notindictionary",
      microSkillKey: "SKILL_PG_A",
      candidateStatus: "parent_local_promoted",
      verifiedOn: "2026-07-01",
    },
    {
      candidateMappingId: "cand-3",
      childId: CHILD,
      misspellingNormalised: "sed",
      correctSpellingNormalised: "said",
      microSkillKey: "SKILL_PG_A",
      candidateStatus: "pending_parent_promotion",
      verifiedOn: "2026-07-01",
    },
  ];
  const bridge = verifiedMisspellingIntakeBridge(
    candidates,
    new Map([
      ["because", "word-because"],
      ["said", "word-said"],
    ]),
  );
  assert(bridge.intakes.length === 1, "only promoted candidates with truth intake");
  assert(bridge.intakes[0].sourceKind === "verified_misspelling", "bridge intake source kind");
  assert(bridge.intakes[0].sourceAttemptText === "becos", "bridge intake keeps the child's raw attempt");
  assert(bridge.unresolved.length === 1 && bridge.unresolved[0].candidateMappingId === "cand-2", "no dictionary truth -> stays in the candidate flow");
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

{
  const facts = () =>
    planFacts({ ...dueFixture(8), learningItems: LESSON_ITEMS, dictionary: FILL_DICTIONARY });
  const first = JSON.stringify(composeDailyPlan(facts(), TODAY));
  const second = JSON.stringify(composeDailyPlan(facts(), TODAY));
  assert(first === second, "identical fixtures + date produce a byte-identical plan");

  // Cluster derivation is itself deterministic and never stored.
  const clusters = clustersBySkill(LESSON_ITEMS);
  assert(clusters.get("SKILL_PG_A")?.length === 5, "clusters computed at call time");

  assert(parseReviewSortDimension("REVIEW_QUICK_SORT(sound/spelling cue)") === "sound/spelling cue", "sort dimension parses");
  assert(parseReviewSortDimension("SOMETHING_ELSE(x)") === null, "unparseable sort dimension fails closed");
}

console.log("ADLE composer regression passed.");
