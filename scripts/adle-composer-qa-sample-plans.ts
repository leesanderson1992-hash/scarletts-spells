/**
 * ADLE Slice 3 (owner QA gate, open question 3): render three fixture
 * children's composed daily plans as a readable markdown artefact for
 * hands-on owner review before 3E persistence is authorized.
 *
 * DB-independent and deterministic: fixtures + a fixed date in, markdown
 * out (stdout). Saved output:
 * docs/implementation/adle-slice-3-composed-plan-samples-2026-07-05.md
 */

import { COMPOSER_POLICY_V1 } from "../lib/adle/composer-policy";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  composeDailyPlan,
  type ActivityTemplateFact,
  type ComposedDailyPlan,
  type DailyPlanFacts,
  type FamilyMethodFact,
  type ReviewWordFact,
  type TeachingContentFact,
} from "../lib/adle/daily-assignment-composer";
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
  WordBandingFact,
  WordSupportFact,
} from "../lib/adle/dictionary-eligibility";
import { failClosedTaughtWordHistoryProvider } from "../lib/adle/dictionary-eligibility";
import type { ComposerDictionaryFacts } from "../lib/adle/composer-word-selection";

const TODAY = "2026-07-05";
const policy = REVIEW_POLICY_V1;

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
  ["D4_PG_CVC_SHORT_A", "D4_PG"],
  ["D4_PAT_FINAL_LL", "D4_PAT"],
  ["D4_HOM_THERE_THEIR", "D4_HOM"],
  ["D4_SYL_TWO_SYLLABLE", "D4_SYL"],
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
    familyName: "Spelling patterns and positional rules",
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
  {
    familyKey: "D4_SYL",
    familyName: "Syllable/chunking for spelling",
    guidedQuestionSequence: ["SYL_SPLIT", "SYL_REBUILD", "CONTROLLED_SPELLING", "DICTATION_OR_WRITING"],
    reviewSortDimension: "REVIEW_QUICK_SORT(syllable/chunk)",
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
    phase: "registry",
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
  template("HOM_MEANING_MATCH", "guided_task", { requiresContrastWords: true }),
  template("HOM_SENTENCE_CHOICE", "guided_task", { requiresContrastWords: true, requiresSentenceContext: true }),
  template("HOM_CORRECTION", "guided_task", { requiresContrastWords: true, requiresSentenceContext: true }),
  template("SYL_SPLIT", "guided_task"),
  template("SYL_REBUILD", "guided_task"),
  template("CONTROLLED_SPELLING", "controlled_spelling"),
  template("DICTATION_NO_IMAGE", "dictation"),
  template("DICTATION_SENTENCE_CONTEXT", "dictation_sentence_context", { requiresSentenceContext: true }),
  template("REVIEW_QUICK_SORT", "categorisation", { minWordsRequired: 2 }),
  template("REVIEW_DICTATION", "dictation"),
  template("ERROR_REFLECTION_CUE", "reflection"),
  template("DIAGNOSTIC_DICTATION_PROBE", "diagnostic_probe"),
];

const TEACHING_CONTENT = new Map<string, TeachingContentFact>(
  [
    ["D4_PG_CVC_SHORT_A", "Short a in simple words: the /a/ sound is spelled with the letter a.", "When you hear /a/ in the middle of a short word, write a."],
    ["D4_PAT_FINAL_LL", "Double l at the end of short words: bell, hill, full.", "After a short vowel at the end of a short word, l doubles to ll."],
    ["D4_HOM_THERE_THEIR", "there / their sound the same but mean different things.", "there = a place; their = belonging to them. The sentence decides."],
    ["D4_SYL_TWO_SYLLABLE", "Two-syllable words keep every chunk.", "Clap the chunks; every chunk keeps its letters."],
  ].map(([skill, explanation, rule]) => [
    skill,
    {
      microSkillKey: skill,
      teachingObjective: `Teach ${skill}`,
      childFriendlyExplanation: explanation,
      ruleExplanation: rule,
      commonMisconceptions: `Common slip for ${skill}: leaving out the tricky part.`,
    },
  ]),
);

interface WordSpec {
  id: string;
  word: string;
  level: number;
  skills: readonly string[];
  frequencyBand?: string;
}

function buildDictionary(specs: readonly WordSpec[]): ComposerDictionaryFacts {
  const words: DictionaryWordFact[] = specs.map((spec) => ({
    canonicalWordId: spec.id,
    wordKey: `${spec.word}_key`,
    normalisedWord: spec.word,
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: spec.frequencyBand ?? "high",
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
function item(
  childId: string,
  canonicalWordId: string,
  microSkillKey: string,
  intakeOn: string,
  overrides: Partial<LearningItemFact> = {},
): LearningItemFact {
  itemCounter += 1;
  return {
    learningItemId: `item-${String(itemCounter).padStart(3, "0")}`,
    childId,
    canonicalWordId,
    microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `verified:${itemCounter}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn,
    rowStatus: "active",
    ...overrides,
  };
}

function dueBundle(
  childId: string,
  bundleId: string,
  wordIds: readonly string[],
  taughtOn: string,
): { bundle: ReviewBundleFact; words: ScheduleWordFact[] } {
  return (({ bundle, words }) => ({ bundle, words }))(
    createReviewBundle(policy, {
      bundleId,
      childId,
      sourceRef: `lesson:${bundleId}`,
      taughtOn,
      words: wordIds.map((canonicalWordId) => ({ canonicalWordId })),
    }),
  );
}

function baseFacts(childId: string, overrides: Partial<DailyPlanFacts>): DailyPlanFacts {
  return {
    childId,
    reviewPolicy: policy,
    composerPolicy: COMPOSER_POLICY_V1,
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

function reviewFacts(entries: readonly [string, string, string][]): Map<string, ReviewWordFact> {
  return new Map(
    entries.map(([id, word, skill]) => [id, { canonicalWordId: id, displayWord: word, microSkillKey: skill }]),
  );
}

// ---------------------------------------------------------------------------
// Fixture child 1 — Ivy: steady state, lesson day with a probe
// ---------------------------------------------------------------------------

const ivyDictionary = buildDictionary([
  { id: "w-cat", word: "cat", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-map", word: "map", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-hand", word: "hand", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-plan", word: "plan", level: 2, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-stamp", word: "stamp", level: 2, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-grass", word: "grass", level: 2, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-branch", word: "branch", level: 2, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-flag", word: "flag", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-snap", word: "snap", level: 2, skills: ["D4_PG_CVC_SHORT_A"] },
]);
const ivyDue = {
  bell: dueBundle("ivy", "ivy-b1", ["w-bell", "w-hill"], addDays(TODAY, -1)),
  their: dueBundle("ivy", "ivy-b2", ["w-their", "w-there"], addDays(TODAY, -3)),
};
const ivyPlan = composeDailyPlan(
  baseFacts("ivy", {
    bundles: [ivyDue.bell.bundle, ivyDue.their.bundle],
    scheduleWords: [...ivyDue.bell.words, ...ivyDue.their.words],
    reviewWordFacts: reviewFacts([
      ["w-bell", "bell", "D4_PAT_FINAL_LL"],
      ["w-hill", "hill", "D4_PAT_FINAL_LL"],
      ["w-their", "their", "D4_HOM_THERE_THEIR"],
      ["w-there", "there", "D4_HOM_THERE_THEIR"],
    ]),
    learningItems: [
      item("ivy", "w-cat", "D4_PG_CVC_SHORT_A", "2026-06-20", { sourceAttemptText: "ct" }),
      item("ivy", "w-map", "D4_PG_CVC_SHORT_A", "2026-06-24", { sourceAttemptText: "mep" }),
    ],
    dictionary: ivyDictionary,
  }),
  TODAY,
);

// ---------------------------------------------------------------------------
// Fixture child 2 — Noah: review debt, review-only day
// ---------------------------------------------------------------------------

const noahWordIds = Array.from({ length: 12 }, (_, index) => `w-n${String(index + 1).padStart(2, "0")}`);
const noahBundleA = dueBundle("noah", "noah-b1", noahWordIds.slice(0, 6), addDays(TODAY, -4));
const noahBundleB = dueBundle("noah", "noah-b2", noahWordIds.slice(6), addDays(TODAY, -1));
const noahPlan = composeDailyPlan(
  baseFacts("noah", {
    bundles: [noahBundleA.bundle, noahBundleB.bundle],
    scheduleWords: [...noahBundleA.words, ...noahBundleB.words],
    reviewWordFacts: reviewFacts(
      noahWordIds.map((id, index) => [
        id,
        `word${index + 1}`,
        index % 2 === 0 ? "D4_PAT_FINAL_LL" : "D4_SYL_TWO_SYLLABLE",
      ]),
    ),
    learningItems: [
      item("noah", "w-cat", "D4_PG_CVC_SHORT_A", "2026-06-20"),
      item("noah", "w-map", "D4_PG_CVC_SHORT_A", "2026-06-24"),
    ],
    dictionary: ivyDictionary,
  }),
  TODAY,
);

// ---------------------------------------------------------------------------
// Fixture child 3 — Priya: reteach day (ejected word outranks a new cluster),
// probe blocked by the 14-day cap
// ---------------------------------------------------------------------------

const priyaDictionary = buildDictionary([
  { id: "w-bell", word: "bell", level: 1, skills: ["D4_PAT_FINAL_LL"] },
  { id: "w-hill", word: "hill", level: 1, skills: ["D4_PAT_FINAL_LL"] },
  { id: "w-full", word: "full", level: 1, skills: ["D4_PAT_FINAL_LL"] },
  { id: "w-smell", word: "smell", level: 2, skills: ["D4_PAT_FINAL_LL"] },
  { id: "w-spill", word: "spill", level: 2, skills: ["D4_PAT_FINAL_LL"] },
  { id: "w-shell", word: "shell", level: 2, skills: ["D4_PAT_FINAL_LL"] },
  { id: "w-cat", word: "cat", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-map", word: "map", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
  { id: "w-hand", word: "hand", level: 1, skills: ["D4_PG_CVC_SHORT_A"] },
]);
const priyaPlan = composeDailyPlan(
  baseFacts("priya", {
    learningItems: [
      item("priya", "w-bell", "D4_PAT_FINAL_LL", "2026-06-28", {
        itemStatus: "pending_reteach",
        reteachPriority: true,
        ejectedOn: "2026-06-28",
        sourceKind: "review_ejection",
        sourceAttemptText: "bel",
      }),
      item("priya", "w-hill", "D4_PAT_FINAL_LL", "2026-06-30", { sourceAttemptText: "hil" }),
      item("priya", "w-cat", "D4_PG_CVC_SHORT_A", "2026-06-01"),
      item("priya", "w-map", "D4_PG_CVC_SHORT_A", "2026-06-02"),
      item("priya", "w-hand", "D4_PG_CVC_SHORT_A", "2026-06-03"),
    ],
    dictionary: priyaDictionary,
    probeRuns: [
      { childId: "priya", microSkillKey: "D4_PAT_FINAL_LL", runOn: addDays(TODAY, -6), rowStatus: "active" },
    ],
    previousLessonFamilyKey: "D4_PAT",
  }),
  TODAY,
);

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderPlan(title: string, story: string, plan: ComposedDailyPlan): string {
  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push("");
  lines.push(story);
  lines.push("");
  lines.push(
    `Throttle: ${plan.throttle.totalDue} due (${plan.throttle.dueReviewWordCount} reviews + ` +
      `${plan.throttle.dueCatchUpRetestCount} retests) vs cap ${plan.throttle.sessionCap} — ` +
      (plan.throttle.lessonAllowed ? "lesson allowed" : "review-only day"),
  );
  lines.push("");
  lines.push("### Part 1 — Review");
  if (plan.partOne.dueQueue.length === 0) {
    lines.push("");
    lines.push("No reviews due.");
  } else {
    lines.push("");
    lines.push(`Presentation order (session-mix): ${plan.partOne.presentationOrder.join(", ")}`);
    for (const section of plan.partOne.sections) {
      lines.push("");
      lines.push(`**${section.sectionKey}** — ${section.purpose}`);
      lines.push("");
      lines.push("| # | template | word | detail |");
      lines.push("|---|----------|------|--------|");
      for (const entry of section.items) {
        const detail =
          section.sectionKey === "review_quick_sort"
            ? (entry.payload.words as { targetWord: string; sortDimension: string }[])
                .map((word) => `${word.targetWord} → ${word.sortDimension}`)
                .join("; ")
            : section.sectionKey === "review_reflection"
              ? `conditional; hint: ${String(entry.payload.misconceptionHint ?? "—")}`
              : `due ${String(entry.payload.dueOn)} (${String(entry.payload.dueKind)})`;
        lines.push(
          `| ${entry.position} | ${entry.templateKey} | ${entry.targetWord ?? "(session)"} | ${detail} |`,
        );
      }
    }
  }
  if (plan.partOne.skips.length > 0) {
    lines.push("");
    lines.push(`Part 1 skips: ${plan.partOne.skips.map((skip) => skip.reason).join(", ")}`);
  }
  lines.push("");
  lines.push("### Part 2 — Lesson");
  lines.push("");
  if (!plan.partTwo.composed) {
    lines.push(
      `Not composed. Skips: ${plan.partTwo.skips
        .map((skip) => `${skip.reason} (${JSON.stringify(skip.evidence)})`)
        .join("; ")}`,
    );
  } else {
    const decided = plan.partTwo.selectionAudit.find((entry) => entry.decided);
    lines.push(`Micro-skill: **${plan.partTwo.microSkillKey}** (deciding tier: ${decided?.tier})`);
    lines.push("");
    lines.push("Selection audit:");
    for (const entry of plan.partTwo.selectionAudit) {
      lines.push(
        `- ${entry.tier}: [${entry.candidatesBefore.join(", ")}] → [${entry.candidatesAfter.join(", ")}]` +
          `${entry.decided ? " — decided" : ""} (${entry.detail})`,
      );
    }
    lines.push("");
    lines.push(
      `Lesson words: ${plan.partTwo.lessonWords
        .map((slot) => `${slot.canonicalWordId} [${slot.provenance}, L${slot.complexityLevel ?? "?"}]`)
        .join(", ")}`,
    );
    if (plan.partTwo.probePlan !== null) {
      lines.push("");
      lines.push(`Probe (replaces dictation): ${plan.partTwo.probePlan.canonicalWordIds.join(", ")}`);
    }
    if (plan.partTwo.stretchItemIntakes.length > 0) {
      lines.push("");
      lines.push(
        `Stretch learning-item intakes: ${plan.partTwo.stretchItemIntakes
          .map((intake) => `${intake.canonicalWordId} (${intake.sourceKind})`)
          .join(", ")}`,
      );
    }
    for (const section of plan.partTwo.sections) {
      lines.push("");
      lines.push(`**${section.sectionKey}** — ${section.purpose}`);
      lines.push("");
      lines.push("| # | template | word | evidence label |");
      lines.push("|---|----------|------|----------------|");
      for (const entry of section.items) {
        const word =
          entry.targetWord ??
          (Array.isArray(entry.payload.words)
            ? (entry.payload.words as { targetWord?: string | null }[])
                .map((w) => w.targetWord ?? "?")
                .join(", ")
            : "(section)");
        lines.push(`| ${entry.position} | ${entry.templateKey} | ${word} | ${entry.expectedEvidenceKind} |`);
      }
    }
    if (plan.partTwo.skips.length > 0) {
      lines.push("");
      lines.push(
        `Part 2 skips: ${plan.partTwo.skips
          .map((skip) => `${skip.reason} (${JSON.stringify(skip.evidence)})`)
          .join("; ")}`,
      );
    }
  }
  lines.push("");
  lines.push(
    `Budget: ${plan.budget.estimatedResponses}/${plan.budget.budgetResponses} responses, ` +
      `guided words ${plan.budget.guidedWordCount}, intro trimmed ${plan.budget.introTrimmed}, ` +
      `trims [${plan.budget.trims.join(", ")}]`,
  );
  lines.push("");
  return lines.join("\n");
}

const output: string[] = [];
output.push("# ADLE Slice 3 — Composed daily plan samples (owner QA artefact)");
output.push("");
output.push(
  `Generated ${TODAY} by scripts/adle-composer-qa-sample-plans.ts (fixture-backed, DB-independent, ` +
    "deterministic). Read-model output only — nothing here is persisted; 3E persistence stays " +
    "blocked on owner sign-off of this artefact (composer contract read-model-first rule).",
);
output.push("");
output.push(
  renderPlan(
    "Fixture child 1 — Ivy: steady-state lesson day",
    "Four review words due (two D4_PAT, two D4_HOM — note the session mix separates the families, " +
      "and the homophones take sentence-context production). Two short-a learning items plus a " +
      "planned diagnostic probe; stretch words fill the lesson to five within adjacent bands.",
    ivyPlan,
  ),
);
output.push(
  renderPlan(
    "Fixture child 2 — Noah: review debt, review-only day",
    "Twelve words due across two bundles: the queue caps at ten (oldest first), the throttle blocks " +
      "the lesson with the counts as evidence, and the two trimmed words simply stay due tomorrow. " +
      "Review-only days are correct behaviour, not a failure state.",
    noahPlan,
  ),
);
output.push(
  renderPlan(
    "Fixture child 3 — Priya: reteach day under the probe cap",
    "A word ejected from review (bell) makes D4_PAT_FINAL_LL reteach demand, which outranks the " +
      "bigger short-a cluster — even though the previous lesson was the same family (reteach sits " +
      "above rotation in the lexicographic order). A probe ran 6 days ago, so the 14-day cap blocks " +
      "a new probe (probe_cap_reached) and stretch words fill the lesson instead.",
    priyaPlan,
  ),
);

console.log(output.join("\n"));
