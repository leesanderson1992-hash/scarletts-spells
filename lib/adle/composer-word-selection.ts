/**
 * ADLE Slice 3 (3C): the 5-word rule — lesson word selection in the pinned
 * fill order (blueprint "Lesson word selection"):
 *   1. the child's unresolved learning items for the skill, oldest first
 *   2. misses from a cold diagnostic dictation probe (injected as facts once
 *      the probe has run; misses are learning items by then)
 *   3. new, slightly harder, in-band stretch words from the same skill
 *
 * Every dictionary-sourced word (probe and stretch) passes the status-3 gate
 * isAssignmentDiagnosticEligible(childBand); levels come from
 * effectiveComplexityLevel. The 5 words sit within adjacent complexity bands
 * (the selected set spans at most two consecutive banding v1.1 levels); a
 * much-harder outlier waits for a later lesson.
 *
 * Probe rules: diagnostic-eligible, same skill, at or near the cluster's
 * level, not previously taught to this child (Slice 2 taught-history
 * provider), band appropriate, capped at one probe per micro-skill per 14
 * days (adle_probe_runs facts). A passed probe never cancels the lesson —
 * stretch words fill instead. Probe misspellings without canonical truth are
 * the completion path's concern (3D); nothing here invents resolver truth.
 */

import {
  effectiveComplexityLevel,
  isAssignmentDiagnosticEligible,
  APPROVED_SUPPORT_REVIEW_STATUSES,
  type BandingOverrideFact,
  type BandingVersionFact,
  type ChildBandProfile,
  type DictionaryWordFact,
  type TaughtWordHistoryProvider,
  type WordBandingFact,
  type WordSupportFact,
} from "./dictionary-eligibility";
import {
  learningItemFromStretchSelection,
  selectableLearningItems,
  type LearningItemFact,
} from "./learning-items";
import { addDays, type IsoDate, type SchedulerRowStatus } from "./review-scheduler";
import type { ComposerPolicy } from "./composer-policy";

export interface ComposerDictionaryFacts {
  words: readonly DictionaryWordFact[];
  supports: readonly WordSupportFact[];
  bandings: readonly WordBandingFact[];
  overrides: readonly BandingOverrideFact[];
  activeBandingVersion: BandingVersionFact;
  activeTeachingSkillKeys: ReadonlySet<string>;
}

export interface ProbeRunFact {
  childId: string;
  microSkillKey: string;
  runOn: IsoDate;
  rowStatus: SchedulerRowStatus;
}

export type LessonWordProvenance = "learning_item" | "probe_miss" | "stretch";

export interface LessonWordSlot {
  canonicalWordId: string;
  provenance: LessonWordProvenance;
  learningItemId: string | null;
  complexityLevel: number | null;
}

export interface ProbePlan {
  templateKey: "DIAGNOSTIC_DICTATION_PROBE";
  canonicalWordIds: readonly string[];
}

export type WordSelectionSkipReason =
  | "probe_cap_reached"
  | "no_diagnostic_eligible_words"
  | "missing_required_words";

export interface WordSelectionFacts {
  learningItems: readonly LearningItemFact[];
  dictionary: ComposerDictionaryFacts;
  taughtHistory: TaughtWordHistoryProvider;
  probeRuns: readonly ProbeRunFact[];
  /** Word ids missed on a cold probe already completed today for this skill
   * (their probe-miss learning items land via the 3D completion path). */
  probeMissWordIdsToday: readonly string[];
}

export interface WordSelectionResult {
  slots: LessonWordSlot[];
  probePlan: ProbePlan | null;
  /** Items the composition creates for stretch words, so every generated
   * assignment item traces to an active learning item. */
  stretchItemIntakes: LearningItemFact[];
  deferredOutlierWordIds: string[];
  skipReasons: WordSelectionSkipReason[];
  complexityWindow: { min: number; max: number } | null;
}

interface EligibleWord {
  canonicalWordId: string;
  wordKey: string;
  frequencyBand: string | null;
  level: number | null;
}

function frequencyRank(band: string | null): number {
  const cleaned = (band ?? "").toLowerCase();
  if (cleaned === "high") return 0;
  if (cleaned === "medium") return 1;
  if (cleaned === "low") return 2;
  return 3;
}

/** The adjacent-band constraint as a running window: a candidate fits when
 * including its level keeps the selected set within two consecutive levels.
 * Words unbanded under the active version never widen the window. */
function fitsWindow(window: { min: number; max: number } | null, level: number | null): boolean {
  if (level === null || window === null) {
    return true;
  }
  return Math.max(window.max, level) - Math.min(window.min, level) <= 1;
}

function widen(
  window: { min: number; max: number } | null,
  level: number | null,
): { min: number; max: number } | null {
  if (level === null) {
    return window;
  }
  if (window === null) {
    return { min: level, max: level };
  }
  return { min: Math.min(window.min, level), max: Math.max(window.max, level) };
}

export function selectLessonWords(
  microSkillKey: string,
  childId: string,
  facts: WordSelectionFacts,
  childBand: ChildBandProfile,
  policy: ComposerPolicy,
  today: IsoDate,
): WordSelectionResult {
  const { dictionary } = facts;
  const skipReasons: WordSelectionSkipReason[] = [];
  const supportsByWord = new Map<string, WordSupportFact[]>();
  for (const support of dictionary.supports) {
    const list = supportsByWord.get(support.canonicalWordId);
    if (list) {
      list.push(support);
    } else {
      supportsByWord.set(support.canonicalWordId, [support]);
    }
  }
  const bandingByWord = new Map(dictionary.bandings.map((b) => [b.canonicalWordId, b]));
  const overrideByWord = new Map(dictionary.overrides.map((o) => [o.canonicalWordId, o]));
  const wordById = new Map(dictionary.words.map((w) => [w.canonicalWordId, w]));
  const levelOf = (canonicalWordId: string): number | null =>
    effectiveComplexityLevel(
      bandingByWord.get(canonicalWordId) ?? null,
      overrideByWord.get(canonicalWordId) ?? null,
      dictionary.activeBandingVersion,
    );

  // --- Fill order 1: unresolved learning items for the skill, oldest first.
  const skillItems = selectableLearningItems(facts.learningItems).filter(
    (item) => item.childId === childId && item.microSkillKey === microSkillKey,
  );
  const slots: LessonWordSlot[] = [];
  const deferredOutlierWordIds: string[] = [];
  let window: { min: number; max: number } | null = null;
  const usedWordIds = new Set<string>();
  const itemByWordId = new Map(skillItems.map((item) => [item.canonicalWordId, item]));

  for (const item of skillItems) {
    if (slots.length >= policy.lessonWordCount || usedWordIds.has(item.canonicalWordId)) {
      continue;
    }
    const level = levelOf(item.canonicalWordId);
    if (!fitsWindow(window, level)) {
      deferredOutlierWordIds.push(item.canonicalWordId);
      continue;
    }
    window = widen(window, level);
    usedWordIds.add(item.canonicalWordId);
    slots.push({
      canonicalWordId: item.canonicalWordId,
      provenance: "learning_item",
      learningItemId: item.learningItemId,
      complexityLevel: level,
    });
  }

  // --- Fill order 2: misses from today's completed cold probe.
  for (const canonicalWordId of facts.probeMissWordIdsToday) {
    if (slots.length >= policy.lessonWordCount || usedWordIds.has(canonicalWordId)) {
      continue;
    }
    const level = levelOf(canonicalWordId);
    if (!fitsWindow(window, level)) {
      deferredOutlierWordIds.push(canonicalWordId);
      continue;
    }
    window = widen(window, level);
    usedWordIds.add(canonicalWordId);
    slots.push({
      canonicalWordId,
      provenance: "probe_miss",
      learningItemId: itemByWordId.get(canonicalWordId)?.learningItemId ?? null,
      complexityLevel: level,
    });
  }

  // --- Shared candidate pool for probe and stretch words: status 3
  // (assignment/diagnostic-eligible for this child band), mapped to this
  // skill, never taught or probed for this child, not already an item or a
  // selected word.
  const hasActiveItem = new Set(
    facts.learningItems
      .filter((item) => item.childId === childId && item.rowStatus === "active" && item.itemStatus !== "resolved")
      .map((item) => item.canonicalWordId),
  );
  const newWordCandidates: EligibleWord[] = [];
  for (const word of dictionary.words) {
    if (usedWordIds.has(word.canonicalWordId) || hasActiveItem.has(word.canonicalWordId)) {
      continue;
    }
    const supports = supportsByWord.get(word.canonicalWordId) ?? [];
    const mappedToSkill = supports.some(
      (support) =>
        support.microSkillKey === microSkillKey &&
        support.rowStatus === "active" &&
        APPROVED_SUPPORT_REVIEW_STATUSES.includes(support.reviewStatus),
    );
    if (!mappedToSkill) {
      continue;
    }
    if (
      !isAssignmentDiagnosticEligible(
        { word, supports, activeTeachingSkillKeys: dictionary.activeTeachingSkillKeys },
        childBand,
      )
    ) {
      continue;
    }
    if (facts.taughtHistory.wasTaughtOrProbed(childId, word.canonicalWordId)) {
      continue;
    }
    newWordCandidates.push({
      canonicalWordId: word.canonicalWordId,
      wordKey: word.wordKey,
      frequencyBand: word.frequencyBand,
      level: levelOf(word.canonicalWordId),
    });
  }

  // --- Probe plan: only when slots remain, under the 14-day cap.
  let probePlan: ProbePlan | null = null;
  const openSlotsBeforeProbe = policy.lessonWordCount - slots.length;
  if (openSlotsBeforeProbe > 0 && facts.probeMissWordIdsToday.length === 0) {
    const capBoundary = addDays(today, -policy.probeCapDays);
    const capBlocked = facts.probeRuns.some(
      (run) =>
        run.rowStatus === "active" &&
        run.childId === childId &&
        run.microSkillKey === microSkillKey &&
        run.runOn > capBoundary,
    );
    if (capBlocked) {
      skipReasons.push("probe_cap_reached");
    } else {
      // At or near the cluster's level: closest to the window's top first
      // (the probe diagnoses the frontier), then stable word order.
      const anchor = window?.max ?? null;
      const probeCandidates = newWordCandidates
        .filter((candidate) => fitsWindow(window, candidate.level))
        .sort((a, b) => {
          if (anchor !== null && a.level !== b.level) {
            const distance = (level: number | null) =>
              level === null ? Number.MAX_SAFE_INTEGER : Math.abs(level - anchor);
            if (distance(a.level) !== distance(b.level)) {
              return distance(a.level) - distance(b.level);
            }
            return (b.level ?? 0) - (a.level ?? 0);
          }
          return a.wordKey < b.wordKey ? -1 : a.wordKey > b.wordKey ? 1 : 0;
        })
        .slice(0, openSlotsBeforeProbe);
      if (probeCandidates.length === 0) {
        skipReasons.push("no_diagnostic_eligible_words");
      } else {
        probePlan = {
          templateKey: "DIAGNOSTIC_DICTATION_PROBE",
          canonicalWordIds: probeCandidates.map((candidate) => candidate.canonicalWordId),
        };
      }
    }
  }

  // --- Fill order 3: new, slightly harder, in-band stretch words. These are
  // the lesson words when the probe passes (a passed probe never cancels the
  // lesson) or cannot run. Slightly harder: highest level that fits the
  // window first, then more frequent (useful), then stable word order.
  const stretchItemIntakes: LearningItemFact[] = [];
  const stretchCandidates = newWordCandidates
    .filter((candidate) => !probePlan?.canonicalWordIds.includes(candidate.canonicalWordId))
    .sort((a, b) => {
      const levelA = a.level ?? -1;
      const levelB = b.level ?? -1;
      if (levelA !== levelB) {
        return levelB - levelA;
      }
      if (frequencyRank(a.frequencyBand) !== frequencyRank(b.frequencyBand)) {
        return frequencyRank(a.frequencyBand) - frequencyRank(b.frequencyBand);
      }
      return a.wordKey < b.wordKey ? -1 : a.wordKey > b.wordKey ? 1 : 0;
    });
  for (const candidate of stretchCandidates) {
    if (slots.length >= policy.lessonWordCount) {
      break;
    }
    if (!fitsWindow(window, candidate.level)) {
      continue;
    }
    window = widen(window, candidate.level);
    usedWordIds.add(candidate.canonicalWordId);
    const intake = learningItemFromStretchSelection({
      childId,
      canonicalWordId: candidate.canonicalWordId,
      microSkillKey,
      stretchSourceRef: `stretch:${childId}:${today}:${microSkillKey}`,
      selectedOn: today,
    });
    stretchItemIntakes.push(intake);
    slots.push({
      canonicalWordId: candidate.canonicalWordId,
      provenance: "stretch",
      learningItemId: intake.learningItemId,
      complexityLevel: candidate.level,
    });
  }

  if (slots.length < policy.lessonWordCount) {
    skipReasons.push("missing_required_words");
  }

  return {
    slots,
    probePlan,
    stretchItemIntakes,
    deferredOutlierWordIds,
    skipReasons,
    complexityWindow: window,
  };
}
