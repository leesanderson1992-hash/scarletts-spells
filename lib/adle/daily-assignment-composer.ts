/**
 * ADLE Slice 3 (3C): full-day assembly — composeDailyPlan turns canonical
 * truth plus per-child state into one proposed two-part day. Pure and
 * deterministic: injected date, fact-fed, nothing persisted by composition,
 * no evidence/proficiency/reward writes anywhere.
 *
 * Part 1 (always first): the Slice 2 due queue in session-mix presentation
 * order (2026-07-05 amendment item 1 — no two same-family words adjacent
 * where the due mix allows; deterministic nearest-swap over the oldest-first
 * base order; scheduler state, due-date priority under the cap, and throttle
 * counts untouched), shaped as quick sort (sort dimension per word from
 * adle_family_methods) -> production (REVIEW_DICTATION, or
 * DICTATION_SENTENCE_CONTEXT for homophone-family words) -> reflection slots
 * fed by common_misconceptions. The 3+-wrong reopen rule is a completion
 * fact (3D onReviewSessionCompleted) — wrongness is not known at composition.
 *
 * Part 2: gated on the Slice 2 throttle predicate
 * (review_debt_blocks_lesson with the counts as evidence), skill from the
 * pinned lexicographic selection, words from the pinned 5-word fill, lesson
 * assembled from the family's guided sequence under the time budget (trim
 * order pinned: guided repetitions first, then intro length; production and
 * reflection never cut; a probe replaces the lesson's dictation).
 *
 * Every dictionary/template/content lookup fails closed with the contracts'
 * skip vocabulary; nothing invents words, lists, or resolver truth.
 */

import type { ChildBandProfile, TaughtWordHistoryProvider } from "./dictionary-eligibility";
import type { LearningItemFact } from "./learning-items";
import {
  reviewSessionQueue,
  throttlePredicate,
  type DueReviewItem,
  type ThrottleDecision,
} from "./review-due-queue";
import type {
  IsoDate,
  ReviewBundleFact,
  ReviewPolicy,
  ScheduleWordFact,
  SchedulerRowStatus,
} from "./review-scheduler";
import type { ComposerPolicy } from "./composer-policy";
import {
  selectPartTwoSkill,
  type SkillSelectionAuditEntry,
  type SkillSelectionFacts,
} from "./composer-skill-selection";
import {
  selectLessonWords,
  type ComposerDictionaryFacts,
  type LessonWordSlot,
  type ProbePlan,
  type ProbeRunFact,
} from "./composer-word-selection";

export const HOMOPHONE_FAMILY_KEY = "D4_HOM";

export type ComposerSkipReason =
  | "review_debt_blocks_lesson"
  | "insufficient_real_learning_items"
  | "probe_cap_reached"
  | "no_diagnostic_eligible_words"
  | "word_pending_parent_review"
  | "missing_teaching_metadata"
  | "missing_activity_strategy"
  | "missing_required_words"
  | "unknown_micro_skill";

export interface FamilyMethodFact {
  familyKey: string;
  familyName: string;
  guidedQuestionSequence: readonly string[];
  /** Raw sheet value, e.g. "REVIEW_QUICK_SORT(sound/spelling cue)". */
  reviewSortDimension: string;
  productionTask: string;
  rowStatus: SchedulerRowStatus;
}

export interface ActivityTemplateFact {
  templateKey: string;
  phase: string;
  minWordsRequired: number;
  requiresSentenceContext: boolean;
  requiresContrastWords: boolean;
  /** Label only — weights are the Slice 4 evidence engine's. */
  evidenceKind: string;
  childFacingCopy: string;
  /** Slice 7a: registry-derived Tier-C prompt copy source. */
  purpose: string;
  /** Slice 7a: expected child response modality (display hint only). */
  childResponse: string;
  rowStatus: SchedulerRowStatus;
}

/** Slice 7a: structural word metadata used by the interactive activity
 * renderer. Only the syllable *count* and `hasSchwa` back a real interaction
 * (the two derivable quick-sort schemes); the rest is warm display context. */
export interface WordStructuralMetadata {
  canonicalWordId: string;
  /** Count string, e.g. "1"/"4" — NOT a segmentation. */
  syllables: string | null;
  hasSchwa: boolean | null;
  /** Phonetic transcription (e.g. "AH0 / EY1") — not a grapheme map. */
  phonemeHint: string | null;
  stressPattern: string | null;
}

export interface TeachingContentFact {
  microSkillKey: string;
  teachingObjective: string;
  childFriendlyExplanation: string;
  ruleExplanation: string;
  commonMisconceptions: string;
}

export interface ReviewWordFact {
  canonicalWordId: string;
  displayWord: string;
  microSkillKey: string;
}

/** Guided-sequence meta-keys resolved at composition time, never emitted as
 * assignment templates. */
export const SEQUENCE_META_KEYS: readonly string[] = [
  "DICTATION_OR_WRITING",
  "SENTENCE_APPLICATION",
];

export interface DailyPlanFacts {
  childId: string;
  reviewPolicy: ReviewPolicy;
  composerPolicy: ComposerPolicy;
  bundles: readonly ReviewBundleFact[];
  scheduleWords: readonly ScheduleWordFact[];
  /** canonical_word_id -> display/skill facts for due review words. */
  reviewWordFacts: ReadonlyMap<string, ReviewWordFact>;
  familyMethods: readonly FamilyMethodFact[];
  activityTemplates: readonly ActivityTemplateFact[];
  /** micro_skill_key -> active teaching content. */
  teachingContent: ReadonlyMap<string, TeachingContentFact>;
  skillFamilyKeyBySkill: ReadonlyMap<string, string>;
  learningItems: readonly LearningItemFact[];
  prerequisiteKeysBySkill: ReadonlyMap<string, readonly string[]>;
  /** Slice 6 wiring of the Slice 5 (5D) extension: injected by the loader
   * from the proficiency read model, passed through unchanged to the skill
   * selection facts. Absent/empty = selection is byte-identical to before
   * (fail-open — the 5D pin). */
  notYetSecureSkillKeys?: ReadonlySet<string>;
  /** Slice 7a: canonical_word_id -> structural metadata for the activity
   * renderer. Optional and fail-open: absent/empty leaves every activity in its
   * warm-prompt form and the composed plan byte-identical to before. */
  wordMetadataByWordId?: ReadonlyMap<string, WordStructuralMetadata>;
  frequencyBandByWordId: ReadonlyMap<string, string | null>;
  previousLessonFamilyKey: string | null;
  dictionary: ComposerDictionaryFacts;
  childBand: ChildBandProfile;
  taughtHistory: TaughtWordHistoryProvider;
  probeRuns: readonly ProbeRunFact[];
  probeMissWordIdsToday: readonly string[];
}

export interface PlanItemCandidate {
  position: number;
  sectionKey: string;
  templateKey: string;
  microSkillKey: string | null;
  canonicalWordId: string | null;
  targetWord: string | null;
  learningItemId: string | null;
  payload: Record<string, unknown>;
  /** Expected evidence capture label from the template registry — a label
   * only; assignment creation banks no evidence. */
  expectedEvidenceKind: string | null;
  provenance: string;
}

export interface PlanSection {
  sectionKey: string;
  purpose: string;
  items: PlanItemCandidate[];
}

export interface PlanSkip {
  reason: ComposerSkipReason;
  evidence: Record<string, unknown>;
}

export interface BudgetSummary {
  budgetResponses: number;
  estimatedResponses: number;
  guidedWordCount: number;
  introTrimmed: boolean;
  trims: string[];
}

export interface ComposedDailyPlan {
  childId: string;
  planDate: IsoDate;
  composerPolicyVersion: string;
  schedulePolicyVersion: string;
  throttle: ThrottleDecision;
  partOne: {
    dueQueue: DueReviewItem[];
    /** Session-mix presentation order (word ids) over exactly the capped
     * due set — same members, mixed order. */
    presentationOrder: string[];
    sections: PlanSection[];
    skips: PlanSkip[];
  };
  partTwo: {
    composed: boolean;
    microSkillKey: string | null;
    selectionAudit: SkillSelectionAuditEntry[];
    lessonWords: LessonWordSlot[];
    probePlan: ProbePlan | null;
    stretchItemIntakes: LearningItemFact[];
    sections: PlanSection[];
    skips: PlanSkip[];
  };
  budget: BudgetSummary;
}

/** Parse "REVIEW_QUICK_SORT(sound/spelling cue)" -> "sound/spelling cue".
 * Unparseable values fail closed to null (missing_activity_strategy). */
export function parseReviewSortDimension(raw: string): string | null {
  const match = /^REVIEW_QUICK_SORT\((.+)\)$/.exec(raw.trim());
  return match ? match[1].trim() : null;
}

/** Families whose review sort dimension maps to concrete, data-derivable bins
 * (Slice 7a, data-honest Tier map). Every other family's quick sort renders as
 * a warm prompt (sortBins === null). */
export const SYLLABLE_FAMILY_KEY = "D4_SYL";
export const SCHWA_FAMILY_KEY = "D4_SCHWA";

/** A concrete, tappable quick-sort scheme derived from existing structural
 * metadata. `correctBinByWordId` powers soft, non-punitive feedback only —
 * quick sort is an activation step, never the production evidence. */
export interface SortBinsDefinition {
  dimensionLabel: string;
  bins: { key: string; label: string }[];
  correctBinByWordId: Record<string, string>;
}

const SYLLABLE_BINS: { key: string; label: string }[] = [
  { key: "1", label: "1 beat" },
  { key: "2", label: "2 beats" },
  { key: "3+", label: "3 or more beats" },
];
const SCHWA_BINS: { key: string; label: string }[] = [
  { key: "schwa", label: "Has a quiet vowel" },
  { key: "no_schwa", label: "No quiet vowel" },
];

function syllableBinKey(syllables: string | null): string | null {
  if (syllables === null) {
    return null;
  }
  const n = Number.parseInt(syllables, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n <= 1 ? "1" : n === 2 ? "2" : "3+";
}

/**
 * Derive a concrete quick-sort scheme for the session's reviewable words, or
 * null (warm-prompt fallback). Concrete bins exist only for a single-family
 * session of D4_SYL (by syllable count) or D4_SCHWA (by has_schwa); mixed
 * families or any word missing the needed metadata fail closed to null so a
 * partial/incoherent sort is never shown.
 */
export function deriveQuickSortBins(
  entries: readonly { canonicalWordId: string; familyKey: string; sortDimension: string }[],
  wordMetadata: ReadonlyMap<string, WordStructuralMetadata> | undefined,
): SortBinsDefinition | null {
  if (wordMetadata === undefined || entries.length === 0) {
    return null;
  }
  const families = new Set(entries.map((entry) => entry.familyKey));
  if (families.size !== 1) {
    return null;
  }
  const family = entries[0].familyKey;
  const dimensionLabel = entries[0].sortDimension;
  const correctBinByWordId: Record<string, string> = {};

  if (family === SYLLABLE_FAMILY_KEY) {
    for (const entry of entries) {
      const binKey = syllableBinKey(wordMetadata.get(entry.canonicalWordId)?.syllables ?? null);
      if (binKey === null) {
        return null;
      }
      correctBinByWordId[entry.canonicalWordId] = binKey;
    }
    return { dimensionLabel, bins: SYLLABLE_BINS, correctBinByWordId };
  }
  if (family === SCHWA_FAMILY_KEY) {
    for (const entry of entries) {
      const hasSchwa = wordMetadata.get(entry.canonicalWordId)?.hasSchwa ?? null;
      if (hasSchwa === null) {
        return null;
      }
      correctBinByWordId[entry.canonicalWordId] = hasSchwa ? "schwa" : "no_schwa";
    }
    return { dimensionLabel, bins: SCHWA_BINS, correctBinByWordId };
  }
  return null;
}

/**
 * Session-mix ordering (2026-07-05 amendment item 1), pinned deterministic
 * algorithm: keep the oldest-first queue as the base order; walking left to
 * right, resolve a same-family adjacency by swapping the offending position
 * with the nearest later word of a different family. Where the due mix does
 * not allow (no later different-family word), the adjacency stands. The
 * result is a permutation of exactly the input — nothing dropped or added.
 */
export function sessionMixOrder<T>(
  queue: readonly T[],
  familyOf: (entry: T) => string | null,
): T[] {
  const mixed = [...queue];
  for (let index = 1; index < mixed.length; index += 1) {
    const previousFamily = familyOf(mixed[index - 1]);
    if (previousFamily === null || familyOf(mixed[index]) !== previousFamily) {
      continue;
    }
    for (let later = index + 1; later < mixed.length; later += 1) {
      const laterFamily = familyOf(mixed[later]);
      if (laterFamily !== previousFamily) {
        const swap = mixed[index];
        mixed[index] = mixed[later];
        mixed[later] = swap;
        break;
      }
    }
  }
  return mixed;
}

function activeTemplates(
  templates: readonly ActivityTemplateFact[],
): Map<string, ActivityTemplateFact> {
  const byKey = new Map<string, ActivityTemplateFact>();
  for (const template of templates) {
    if (template.rowStatus === "active") {
      byKey.set(template.templateKey, template);
    }
  }
  return byKey;
}

function activeFamilyMethods(
  familyMethods: readonly FamilyMethodFact[],
): Map<string, FamilyMethodFact> {
  const byKey = new Map<string, FamilyMethodFact>();
  for (const method of familyMethods) {
    if (method.rowStatus === "active") {
      byKey.set(method.familyKey, method);
    }
  }
  return byKey;
}

export function composeDailyPlan(facts: DailyPlanFacts, today: IsoDate): ComposedDailyPlan {
  const { reviewPolicy, composerPolicy } = facts;
  const templates = activeTemplates(facts.activityTemplates);
  const familyMethods = activeFamilyMethods(facts.familyMethods);
  const familyOfSkill = (skill: string | undefined): string | null =>
    skill === undefined ? null : facts.skillFamilyKeyBySkill.get(skill) ?? null;

  // ------------------------------------------------------------------ Part 1
  const partOneSkips: PlanSkip[] = [];
  const dueQueue = reviewSessionQueue(reviewPolicy, facts.bundles, facts.scheduleWords, today);
  const familyOfDue = (item: DueReviewItem): string | null =>
    familyOfSkill(facts.reviewWordFacts.get(item.canonicalWordId)?.microSkillKey);
  const presentation = sessionMixOrder(dueQueue, familyOfDue);

  const partOneSections: PlanSection[] = [];
  let position = 0;
  const reviewable: {
    item: DueReviewItem;
    word: ReviewWordFact;
    familyKey: string;
    method: FamilyMethodFact;
    sortDimension: string;
  }[] = [];
  for (const item of presentation) {
    const word = facts.reviewWordFacts.get(item.canonicalWordId);
    if (word === undefined) {
      partOneSkips.push({
        reason: "missing_teaching_metadata",
        evidence: { canonicalWordId: item.canonicalWordId, missing: "review_word_fact" },
      });
      continue;
    }
    const familyKey = familyOfSkill(word.microSkillKey);
    if (familyKey === null) {
      partOneSkips.push({
        reason: "unknown_micro_skill",
        evidence: { canonicalWordId: item.canonicalWordId, microSkillKey: word.microSkillKey },
      });
      continue;
    }
    const method = familyMethods.get(familyKey);
    if (method === undefined) {
      partOneSkips.push({
        reason: "missing_activity_strategy",
        evidence: { canonicalWordId: item.canonicalWordId, missing: "family_method", familyKey },
      });
      continue;
    }
    const sortDimension = parseReviewSortDimension(method.reviewSortDimension);
    if (sortDimension === null) {
      partOneSkips.push({
        reason: "missing_activity_strategy",
        evidence: {
          canonicalWordId: item.canonicalWordId,
          missing: "review_sort_dimension",
          raw: method.reviewSortDimension,
        },
      });
      continue;
    }
    reviewable.push({ item, word, familyKey, method, sortDimension });
  }

  // Quick sort: one parameterised categorisation step over the session's
  // words (activation only, weak evidence — never the production step).
  const quickSortTemplate = templates.get("REVIEW_QUICK_SORT");
  if (reviewable.length > 0) {
    if (quickSortTemplate === undefined) {
      partOneSkips.push({
        reason: "missing_activity_strategy",
        evidence: { missing: "template", templateKey: "REVIEW_QUICK_SORT" },
      });
    } else if (reviewable.length >= quickSortTemplate.minWordsRequired) {
      partOneSections.push({
        sectionKey: "review_quick_sort",
        purpose: "Categorisation/activation step before review production",
        items: [
          {
            position: (position += 1),
            sectionKey: "review_quick_sort",
            templateKey: "REVIEW_QUICK_SORT",
            microSkillKey: null,
            canonicalWordId: null,
            targetWord: null,
            learningItemId: null,
            payload: {
              childFacingCopy: quickSortTemplate.childFacingCopy,
              words: reviewable.map((entry) => ({
                canonicalWordId: entry.item.canonicalWordId,
                targetWord: entry.word.displayWord,
                sortDimension: entry.sortDimension,
                familyKey: entry.familyKey,
              })),
              // Concrete bins where the metadata backs them (D4_SYL/D4_SCHWA
              // single-family sessions), else null -> warm prompt.
              sortBins: deriveQuickSortBins(
                reviewable.map((entry) => ({
                  canonicalWordId: entry.item.canonicalWordId,
                  familyKey: entry.familyKey,
                  sortDimension: entry.sortDimension,
                })),
                facts.wordMetadataByWordId,
              ),
            },
            expectedEvidenceKind: quickSortTemplate.evidenceKind,
            provenance: "review_session",
          },
        ],
      });
    } else {
      partOneSkips.push({
        reason: "missing_required_words",
        evidence: {
          templateKey: "REVIEW_QUICK_SORT",
          minWordsRequired: quickSortTemplate.minWordsRequired,
          available: reviewable.length,
        },
      });
    }
  }

  // Production: the step that carries the evidence. Homophone-choice words
  // require sentence-context production — plain dictation carries no
  // homophone-choice evidence (blueprint family-validity rule).
  const productionItems: PlanItemCandidate[] = [];
  for (const entry of reviewable) {
    const productionKey =
      entry.familyKey === HOMOPHONE_FAMILY_KEY ? "DICTATION_SENTENCE_CONTEXT" : "REVIEW_DICTATION";
    const productionTemplate = templates.get(productionKey);
    if (productionTemplate === undefined) {
      partOneSkips.push({
        reason: "missing_activity_strategy",
        evidence: {
          canonicalWordId: entry.item.canonicalWordId,
          missing: "template",
          templateKey: productionKey,
        },
      });
      continue;
    }
    productionItems.push({
      position: (position += 1),
      sectionKey: "review_production",
      templateKey: productionKey,
      microSkillKey: entry.word.microSkillKey,
      canonicalWordId: entry.item.canonicalWordId,
      targetWord: entry.word.displayWord,
      learningItemId: null,
      payload: {
        childFacingCopy: productionTemplate.childFacingCopy,
        dueKind: entry.item.kind,
        dueOn: entry.item.dueOn,
        bundleId: entry.item.bundleId,
        requiresSentenceContext: productionTemplate.requiresSentenceContext,
      },
      expectedEvidenceKind: productionTemplate.evidenceKind,
      provenance: "review_session",
    });
  }
  if (productionItems.length > 0) {
    partOneSections.push({
      sectionKey: "review_production",
      purpose: "Review production carrying the evidence",
      items: productionItems,
    });
  }

  // Reflection slots: conditional per-misspelling repair, fed by the word's
  // micro-skill common_misconceptions. Reflection is never cut; a missing
  // hint is recorded but the slot still composes (repair-focused, never
  // punitive).
  const reflectionTemplate = templates.get("ERROR_REFLECTION_CUE");
  const reflectionItems: PlanItemCandidate[] = [];
  if (reflectionTemplate === undefined) {
    if (reviewable.length > 0) {
      partOneSkips.push({
        reason: "missing_activity_strategy",
        evidence: { missing: "template", templateKey: "ERROR_REFLECTION_CUE" },
      });
    }
  } else {
    for (const entry of reviewable) {
      const content = facts.teachingContent.get(entry.word.microSkillKey);
      if (content === undefined) {
        partOneSkips.push({
          reason: "missing_teaching_metadata",
          evidence: {
            canonicalWordId: entry.item.canonicalWordId,
            microSkillKey: entry.word.microSkillKey,
            missing: "common_misconceptions",
          },
        });
      }
      reflectionItems.push({
        position: (position += 1),
        sectionKey: "review_reflection",
        templateKey: "ERROR_REFLECTION_CUE",
        microSkillKey: entry.word.microSkillKey,
        canonicalWordId: entry.item.canonicalWordId,
        targetWord: entry.word.displayWord,
        learningItemId: null,
        payload: {
          childFacingCopy: reflectionTemplate.childFacingCopy,
          conditional: "on_misspelling",
          misconceptionHint: content?.commonMisconceptions ?? null,
        },
        expectedEvidenceKind: reflectionTemplate.evidenceKind,
        provenance: "review_session",
      });
    }
  }
  if (reflectionItems.length > 0) {
    partOneSections.push({
      sectionKey: "review_reflection",
      purpose: "Per-misspelling repair reflection (conditional at runtime)",
      items: reflectionItems,
    });
  }

  // ------------------------------------------------------------------ Part 2
  const partTwoSkips: PlanSkip[] = [];
  let selectionAudit: SkillSelectionAuditEntry[] = [];
  let lessonSkill: string | null = null;
  let lessonWords: LessonWordSlot[] = [];
  let probePlan: ProbePlan | null = null;
  let stretchItemIntakes: LearningItemFact[] = [];
  let partTwoSections: PlanSection[] = [];
  let composed = false;
  let guidedWordCount = composerPolicy.guidedWordCountMax;
  let introTrimmed = false;
  const trims: string[] = [];

  const throttle = throttlePredicate(reviewPolicy, facts.bundles, facts.scheduleWords, today);

  if (!throttle.lessonAllowed) {
    partTwoSkips.push({
      reason: "review_debt_blocks_lesson",
      evidence: {
        dueReviewWordCount: throttle.dueReviewWordCount,
        dueCatchUpRetestCount: throttle.dueCatchUpRetestCount,
        totalDue: throttle.totalDue,
        sessionCap: throttle.sessionCap,
      },
    });
  } else {
    const selectionFacts: SkillSelectionFacts = {
      learningItems: facts.learningItems.filter((item) => item.childId === facts.childId),
      skillFamilyKeyBySkill: facts.skillFamilyKeyBySkill,
      prerequisiteKeysBySkill: facts.prerequisiteKeysBySkill,
      notYetSecureSkillKeys: facts.notYetSecureSkillKeys,
      frequencyBandByWordId: facts.frequencyBandByWordId,
      previousLessonFamilyKey: facts.previousLessonFamilyKey,
    };
    const selection = selectPartTwoSkill(selectionFacts);
    selectionAudit = selection.audit;
    if (selection.microSkillKey === null) {
      partTwoSkips.push({
        reason: "insufficient_real_learning_items",
        evidence: { minSelectableItems: 2 },
      });
    } else {
      lessonSkill = selection.microSkillKey;
      const assembled = assembleLesson(facts, templates, familyMethods, lessonSkill, today);
      partTwoSkips.push(...assembled.skips);
      lessonWords = assembled.lessonWords;
      probePlan = assembled.probePlan;
      stretchItemIntakes = assembled.stretchItemIntakes;
      if (assembled.composed) {
        composed = true;
        // Time budget: trim guided repetitions first (2-3 guided words; all
        // words still produced), then intro length. Production and
        // reflection are never cut.
        const quickSortComposed = partOneSections.some(
          (section) => section.sectionKey === "review_quick_sort",
        );
        let build = assembled.build(guidedWordCount, introTrimmed);
        let estimate = estimateResponses(reviewable.length, quickSortComposed, build);
        if (
          estimate > composerPolicy.sessionResponseBudget &&
          guidedWordCount > composerPolicy.guidedWordCountMin
        ) {
          guidedWordCount = composerPolicy.guidedWordCountMin;
          trims.push("guided_repetitions");
          build = assembled.build(guidedWordCount, introTrimmed);
          estimate = estimateResponses(reviewable.length, quickSortComposed, build);
        }
        if (estimate > composerPolicy.sessionResponseBudget && !introTrimmed) {
          introTrimmed = true;
          trims.push("intro_length");
          build = assembled.build(guidedWordCount, introTrimmed);
        }
        partTwoSections = build;
      }
    }
  }

  // Renumber Part 2 items after Part 1 (Part 1 always precedes Part 2).
  let partTwoPosition = position;
  for (const section of partTwoSections) {
    for (const item of section.items) {
      item.position = (partTwoPosition += 1);
    }
  }

  const finalEstimate = estimateResponses(
    reviewable.length,
    partOneSections.some((section) => section.sectionKey === "review_quick_sort"),
    partTwoSections,
  );

  return {
    childId: facts.childId,
    planDate: today,
    composerPolicyVersion: composerPolicy.composerPolicyVersion,
    schedulePolicyVersion: reviewPolicy.schedulePolicyVersion,
    throttle,
    partOne: {
      dueQueue,
      presentationOrder: presentation.map((item) => item.canonicalWordId),
      sections: partOneSections,
      skips: partOneSkips,
    },
    partTwo: {
      composed,
      microSkillKey: lessonSkill,
      selectionAudit,
      lessonWords,
      probePlan,
      stretchItemIntakes,
      sections: partTwoSections,
      skips: partTwoSkips,
    },
    budget: {
      budgetResponses: composerPolicy.sessionResponseBudget,
      estimatedResponses: finalEstimate,
      guidedWordCount,
      introTrimmed,
      trims,
    },
  };
}

/** Response estimate: one response per Part 1 production word, one for the
 * whole quick-sort step, one per Part 2 item candidate; conditional
 * reflection slots cost nothing at composition (they only run on misses). */
function estimateResponses(
  reviewWordCount: number,
  quickSortComposed: boolean,
  partTwoSections: readonly PlanSection[],
): number {
  const partOne = reviewWordCount + (quickSortComposed && reviewWordCount >= 2 ? 1 : 0);
  const partTwo = partTwoSections.reduce((total, section) => {
    if (section.sectionKey === "lesson_probe") {
      const probeItem = section.items[0];
      const probeWords = probeItem?.payload.words;
      return total + (Array.isArray(probeWords) ? probeWords.length : section.items.length);
    }
    return total + section.items.length;
  }, 0);
  return partOne + partTwo;
}

interface AssembledLesson {
  composed: boolean;
  skips: PlanSkip[];
  lessonWords: LessonWordSlot[];
  probePlan: ProbePlan | null;
  stretchItemIntakes: LearningItemFact[];
  /** Rebuild sections for a guided word count / intro trim (budget loop). */
  build: (guidedWordCount: number, introTrimmed: boolean) => PlanSection[];
}

function assembleLesson(
  facts: DailyPlanFacts,
  templates: Map<string, ActivityTemplateFact>,
  familyMethods: Map<string, FamilyMethodFact>,
  microSkillKey: string,
  today: IsoDate,
): AssembledLesson {
  const skips: PlanSkip[] = [];
  const none: AssembledLesson = {
    composed: false,
    skips,
    lessonWords: [],
    probePlan: null,
    stretchItemIntakes: [],
    build: () => [],
  };

  const familyKey = facts.skillFamilyKeyBySkill.get(microSkillKey);
  if (familyKey === undefined) {
    skips.push({ reason: "unknown_micro_skill", evidence: { microSkillKey } });
    return none;
  }
  const content = facts.teachingContent.get(microSkillKey);
  if (
    content === undefined ||
    content.childFriendlyExplanation.trim() === "" ||
    content.ruleExplanation.trim() === ""
  ) {
    skips.push({
      reason: "missing_teaching_metadata",
      evidence: { microSkillKey, missing: "child_friendly_explanation/rule_explanation" },
    });
    return none;
  }
  const method = familyMethods.get(familyKey);
  if (method === undefined) {
    skips.push({
      reason: "missing_activity_strategy",
      evidence: { microSkillKey, missing: "family_method", familyKey },
    });
    return none;
  }

  // Word selection (the 5-word rule + probe rules).
  const wordSelection = selectLessonWords(
    microSkillKey,
    facts.childId,
    {
      learningItems: facts.learningItems,
      dictionary: facts.dictionary,
      taughtHistory: facts.taughtHistory,
      probeRuns: facts.probeRuns,
      probeMissWordIdsToday: facts.probeMissWordIdsToday,
    },
    facts.childBand,
    facts.composerPolicy,
    today,
  );
  for (const reason of wordSelection.skipReasons) {
    skips.push({
      reason,
      evidence: { microSkillKey, selectedWordCount: wordSelection.slots.length },
    });
  }
  const result: AssembledLesson = {
    ...none,
    lessonWords: wordSelection.slots,
    probePlan: wordSelection.probePlan,
    stretchItemIntakes: wordSelection.stretchItemIntakes,
  };
  if (wordSelection.slots.length < facts.composerPolicy.lessonWordCount) {
    // missing_required_words already recorded by the word selection.
    return result;
  }

  // Guided sequence: the family's non-production guided templates. Every
  // real key must resolve to an active registry template — no fallbacks.
  const guidedKeys: string[] = [];
  for (const key of method.guidedQuestionSequence) {
    if (key === "CONTROLLED_SPELLING" || SEQUENCE_META_KEYS.includes(key)) {
      continue;
    }
    if (!templates.has(key)) {
      skips.push({
        reason: "missing_activity_strategy",
        evidence: { microSkillKey, missing: "template", templateKey: key },
      });
      return result;
    }
    guidedKeys.push(key);
  }
  const controlledTemplate = templates.get("CONTROLLED_SPELLING");
  if (controlledTemplate === undefined) {
    skips.push({
      reason: "missing_activity_strategy",
      evidence: { microSkillKey, missing: "template", templateKey: "CONTROLLED_SPELLING" },
    });
    return result;
  }
  const dictationKey =
    familyKey === HOMOPHONE_FAMILY_KEY ? "DICTATION_SENTENCE_CONTEXT" : "DICTATION_NO_IMAGE";
  const dictationTemplate = templates.get(dictationKey);
  const probeTemplate = templates.get("DIAGNOSTIC_DICTATION_PROBE");
  if (result.probePlan !== null && probeTemplate === undefined) {
    skips.push({
      reason: "missing_activity_strategy",
      evidence: { microSkillKey, missing: "template", templateKey: "DIAGNOSTIC_DICTATION_PROBE" },
    });
    return result;
  }
  if (result.probePlan === null && dictationTemplate === undefined) {
    skips.push({
      reason: "missing_activity_strategy",
      evidence: { microSkillKey, missing: "template", templateKey: dictationKey },
    });
    return result;
  }
  const introTemplate = templates.get("MICRO_READ_ONLY_INTRO");
  const wordsIntroTemplate = templates.get("LESSON_WORDS_INTRO");
  if (introTemplate === undefined || wordsIntroTemplate === undefined) {
    skips.push({
      reason: "missing_activity_strategy",
      evidence: {
        microSkillKey,
        missing: "template",
        templateKey: introTemplate === undefined ? "MICRO_READ_ONLY_INTRO" : "LESSON_WORDS_INTRO",
      },
    });
    return result;
  }

  const wordIdOf = (slot: LessonWordSlot) => slot.canonicalWordId;
  // Child-facing lesson word: the true display spelling (casing/punctuation
  // preserved). Correctness matching normalises internally (isAttemptCorrect),
  // so identity and display never diverge.
  const displayWordOf = (canonicalWordId: string): string | null => {
    const word = facts.dictionary.words.find((w) => w.canonicalWordId === canonicalWordId);
    return word ? word.displayWord : null;
  };

  const build = (guidedWordCount: number, introTrimmed: boolean): PlanSection[] => {
    const sections: PlanSection[] = [];
    let position = 0;
    const introItems: PlanItemCandidate[] = [
      {
        position: (position += 1),
        sectionKey: "lesson_intro",
        templateKey: "MICRO_READ_ONLY_INTRO",
        microSkillKey,
        canonicalWordId: null,
        targetWord: null,
        learningItemId: null,
        payload: {
          childFacingCopy: introTemplate.childFacingCopy,
          teachingObjective: content.teachingObjective,
          childFriendlyExplanation: content.childFriendlyExplanation,
          ruleExplanation: content.ruleExplanation,
          selectedWords: result.lessonWords.map(wordIdOf),
          // Slice 7a: display words for the warm intro reveal (selectedWords
          // stays id-only for back-compat).
          lessonWordPreviews: result.lessonWords.map((slot) => ({
            canonicalWordId: slot.canonicalWordId,
            displayWord: displayWordOf(slot.canonicalWordId),
            provenance: slot.provenance,
          })),
        },
        expectedEvidenceKind: introTemplate.evidenceKind,
        provenance: "lesson_intro",
      },
    ];
    if (!introTrimmed) {
      introItems.push({
        position: (position += 1),
        sectionKey: "lesson_intro",
        templateKey: "LESSON_WORDS_INTRO",
        microSkillKey,
        canonicalWordId: null,
        targetWord: null,
        learningItemId: null,
        payload: {
          childFacingCopy: wordsIntroTemplate.childFacingCopy,
          words: result.lessonWords.map((slot) => ({
            canonicalWordId: slot.canonicalWordId,
            targetWord: displayWordOf(slot.canonicalWordId),
            provenance: slot.provenance,
          })),
        },
        expectedEvidenceKind: wordsIntroTemplate.evidenceKind,
        provenance: "lesson_intro",
      });
    }
    sections.push({
      sectionKey: "lesson_intro",
      purpose: "Read-only micro-skill intro from teaching content",
      items: introItems,
    });

    // Guided practice on the first guidedWordCount lesson words (learning
    // items lead the slot order, so guided work lands on the child's own
    // words first).
    const guidedWords = result.lessonWords.slice(0, guidedWordCount);
    const guidedItems: PlanItemCandidate[] = [];
    for (const templateKey of guidedKeys) {
      const template = templates.get(templateKey) as ActivityTemplateFact;
      for (const slot of guidedWords) {
        guidedItems.push({
          position: (position += 1),
          sectionKey: "guided_practice",
          templateKey,
          microSkillKey,
          canonicalWordId: slot.canonicalWordId,
          targetWord: displayWordOf(slot.canonicalWordId),
          learningItemId: slot.learningItemId,
          payload: {
            // Slice 7a: instruction line + Tier-C prompt-copy source, so the
            // registry can render a warm, template-specific prompt (never a
            // naked box) for the content-dependent guided steps.
            childFacingCopy: template.childFacingCopy,
            purpose: template.purpose,
            childResponse: template.childResponse,
            teachingObjective: content.teachingObjective,
            requiresContrastWords: template.requiresContrastWords,
            requiresSentenceContext: template.requiresSentenceContext,
          },
          expectedEvidenceKind: template.evidenceKind,
          provenance: `lesson_word:${slot.provenance}`,
        });
      }
    }
    sections.push({
      sectionKey: "guided_practice",
      purpose: `Family-specific guided sequence (${familyKey})`,
      items: guidedItems,
    });

    // Production covers all lesson words: controlled spelling, then
    // dictation — or the diagnostic probe, which replaces the lesson's
    // dictation and is never additional.
    const productionItems: PlanItemCandidate[] = result.lessonWords.map((slot) => ({
      position: (position += 1),
      sectionKey: "lesson_production",
      templateKey: "CONTROLLED_SPELLING",
      microSkillKey,
      canonicalWordId: slot.canonicalWordId,
      targetWord: displayWordOf(slot.canonicalWordId),
      learningItemId: slot.learningItemId,
      payload: { childFacingCopy: controlledTemplate.childFacingCopy },
      expectedEvidenceKind: controlledTemplate.evidenceKind,
      provenance: `lesson_word:${slot.provenance}`,
    }));
    sections.push({
      sectionKey: "lesson_production",
      purpose: "Controlled spelling production on all lesson words",
      items: productionItems,
    });

    if (result.probePlan !== null && probeTemplate !== undefined) {
      sections.push({
        sectionKey: "lesson_probe",
        purpose: "Cold diagnostic dictation probe (replaces lesson dictation)",
        items: [
          {
            position: (position += 1),
            sectionKey: "lesson_probe",
            templateKey: "DIAGNOSTIC_DICTATION_PROBE",
            microSkillKey,
            canonicalWordId: null,
            targetWord: null,
            learningItemId: null,
            payload: {
              childFacingCopy: probeTemplate.childFacingCopy,
              words: result.probePlan.canonicalWordIds.map((canonicalWordId) => ({
                canonicalWordId,
                targetWord: displayWordOf(canonicalWordId),
              })),
            },
            expectedEvidenceKind: probeTemplate.evidenceKind,
            provenance: "diagnostic_probe",
          },
        ],
      });
    } else if (dictationTemplate !== undefined) {
      sections.push({
        sectionKey: "lesson_dictation",
        purpose: "Dictation production on all lesson words",
        items: result.lessonWords.map((slot) => ({
          position: (position += 1),
          sectionKey: "lesson_dictation",
          templateKey: dictationKey,
          microSkillKey,
          canonicalWordId: slot.canonicalWordId,
          targetWord: displayWordOf(slot.canonicalWordId),
          learningItemId: slot.learningItemId,
          payload: {
            childFacingCopy: dictationTemplate.childFacingCopy,
            requiresSentenceContext: dictationTemplate.requiresSentenceContext,
          },
          expectedEvidenceKind: dictationTemplate.evidenceKind,
          provenance: `lesson_word:${slot.provenance}`,
        })),
      });
    }
    return sections;
  };

  return { ...result, composed: true, build };
}
