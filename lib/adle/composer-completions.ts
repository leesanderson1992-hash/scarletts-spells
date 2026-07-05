/**
 * ADLE Slice 3 (3D): completion write path — pure transition helpers for
 * what a finished lesson / probe / review session writes back. Scheduler
 * state moves only through the Slice 2 module's transitions; learning items
 * move through the Slice 3 intake/transition functions. No evidence, no
 * proficiency, no reward state, anywhere.
 *
 * Raw attempt text (owner decision 6, 2026-07-05): every helper accepts the
 * child's raw attempt per produced word and attaches it to the corresponding
 * facts (taught/probed history rows, outcome events, learning-item intake).
 * Capture only — nothing here reads, prices, or analyses it.
 *
 * All outputs are deterministic values keyed by the caller's source refs;
 * the persistence layer (3E) enforces idempotence per (child, day,
 * source_ref) with uniqueness guards over those refs.
 */

import {
  itemAwaitingReviewOutcome,
  learningItemFromEjection,
  learningItemFromProbeMiss,
  pauseItemForParentReview,
  type LearningItemFact,
} from "./learning-items";
import {
  createReviewBundle,
  resolveBundleReview,
  resolveCatchUpRetest,
  resolvePreRetirementCheck,
  type AuthenticUseProvider,
  failClosedAuthenticUseProvider,
  type IsoDate,
  type ReviewBundleFact,
  type ReviewOutcomeEvent,
  type ReviewPolicy,
  type ScheduleWordFact,
} from "./review-scheduler";
import type { DueItemKind } from "./review-due-queue";
import type { TaughtWordEventKind, TaughtWordHistoryFact } from "./taught-word-history";

/** A taught/probed history fact carrying the raw attempt text column added
 * by the 3A migration. */
export interface TaughtWordHistoryWithAttempt extends TaughtWordHistoryFact {
  attemptText: string | null;
}

export interface OutcomeEventWithAttempt extends ReviewOutcomeEvent {
  attemptText: string | null;
}

export interface ProducedWordAttempt {
  canonicalWordId: string;
  attemptText: string;
  correct: boolean;
}

// ---------------------------------------------------------------------------
// Lesson completion
// ---------------------------------------------------------------------------

export interface LessonCompletionParams {
  childId: string;
  microSkillKey: string;
  completedOn: IsoDate;
  /** Idempotency key for the day's lesson, e.g. `lesson:{child}:{date}:{skill}`. */
  sourceRef: string;
  /** Storage-assigned id for the new review bundle. */
  bundleId: string;
  /** All five produced lesson words with raw attempts. */
  producedWords: readonly ProducedWordAttempt[];
  /** The child's learning items (any status) — matched by (word, skill). */
  learningItems: readonly LearningItemFact[];
}

export interface LessonCompletionResult {
  /** New 1-day review bundle over the successfully produced words (Slice 2
   * createReviewBundle); reteach re-entries carry their incremented
   * reteachCycleCount on the new schedule rows. Null when nothing succeeded. */
  bundle: ReviewBundleFact | null;
  scheduleWords: ScheduleWordFact[];
  /** One taught event per produced word (taught either way — the word was
   * in the lesson; correctness is the evidence engine's concern). */
  taughtEvents: TaughtWordHistoryWithAttempt[];
  /** Items for successful words flip to awaiting_review_outcome; items for
   * missed words stay selectable (returned unchanged for visibility). */
  itemTransitions: LearningItemFact[];
}

export function onLessonCompleted(
  policy: ReviewPolicy,
  params: LessonCompletionParams,
): LessonCompletionResult {
  if (params.producedWords.length === 0) {
    throw new Error("onLessonCompleted: a completed lesson has produced words");
  }
  const itemByWordId = new Map(
    params.learningItems
      .filter(
        (item) =>
          item.childId === params.childId &&
          item.microSkillKey === params.microSkillKey &&
          item.rowStatus === "active",
      )
      .map((item) => [item.canonicalWordId, item]),
  );

  const taughtEvents: TaughtWordHistoryWithAttempt[] = params.producedWords.map((word) => ({
    childId: params.childId,
    canonicalWordId: word.canonicalWordId,
    eventKind: "taught" as TaughtWordEventKind,
    occurredOn: params.completedOn,
    sourceRef: params.sourceRef,
    rowStatus: "active",
    attemptText: word.attemptText,
  }));

  const successful = params.producedWords.filter((word) => word.correct);
  let bundle: ReviewBundleFact | null = null;
  let scheduleWords: ScheduleWordFact[] = [];
  if (successful.length > 0) {
    const created = createReviewBundle(policy, {
      bundleId: params.bundleId,
      childId: params.childId,
      sourceRef: params.sourceRef,
      taughtOn: params.completedOn,
      words: successful.map((word) => {
        const item = itemByWordId.get(word.canonicalWordId);
        // A reteach re-entry increments the word's reteach cycle count on
        // its new schedule row (Slice 2 owns the count's semantics).
        const reteachCycleCount =
          item !== undefined && item.sourceKind === "review_ejection" && item.reteachPriority
            ? 1
            : 0;
        return { canonicalWordId: word.canonicalWordId, reteachCycleCount };
      }),
    });
    bundle = created.bundle;
    scheduleWords = created.words;
  }

  const itemTransitions: LearningItemFact[] = [];
  for (const word of params.producedWords) {
    const item = itemByWordId.get(word.canonicalWordId);
    if (item === undefined) {
      continue;
    }
    itemTransitions.push(word.correct ? itemAwaitingReviewOutcome(item) : item);
  }

  return { bundle, scheduleWords, taughtEvents, itemTransitions };
}

// ---------------------------------------------------------------------------
// Probe completion
// ---------------------------------------------------------------------------

export interface ProbeWordOutcome {
  /** Null when the child's misspelling has no canonical dictionary truth. */
  canonicalWordId: string | null;
  targetWord: string;
  attemptText: string;
  correct: boolean;
}

export interface ProbeCompletionParams {
  childId: string;
  microSkillKey: string;
  completedOn: IsoDate;
  /** Idempotency key, e.g. `probe:{child}:{date}:{skill}`. */
  sourceRef: string;
  words: readonly ProbeWordOutcome[];
}

export interface ProbeRunRecord {
  childId: string;
  microSkillKey: string;
  runOn: IsoDate;
  wordCount: number;
  sourceRef: string;
}

export interface CandidateQueueRoute {
  childId: string;
  targetWord: string;
  attemptText: string;
  microSkillKey: string;
  sourceRef: string;
}

export interface ProbeCompletionResult {
  probeRun: ProbeRunRecord;
  /** One probed event per word with canonical truth (correct or not), so
   * eligibility status 4 and "not previously taught" stay consistent. */
  probedEvents: TaughtWordHistoryWithAttempt[];
  /** Cold misses with canonical truth become learning items. */
  itemIntakes: LearningItemFact[];
  /** Misses without canonical truth are routed (returned, never written)
   * toward the existing candidate-mapping queue — the composer never
   * invents resolver truth. */
  candidateQueueRoutes: CandidateQueueRoute[];
}

export function onProbeCompleted(params: ProbeCompletionParams): ProbeCompletionResult {
  if (params.words.length === 0) {
    throw new Error("onProbeCompleted: a completed probe has words");
  }
  const probedEvents: TaughtWordHistoryWithAttempt[] = [];
  const itemIntakes: LearningItemFact[] = [];
  const candidateQueueRoutes: CandidateQueueRoute[] = [];
  for (const word of params.words) {
    if (word.canonicalWordId === null) {
      if (!word.correct) {
        candidateQueueRoutes.push({
          childId: params.childId,
          targetWord: word.targetWord,
          attemptText: word.attemptText,
          microSkillKey: params.microSkillKey,
          sourceRef: params.sourceRef,
        });
      }
      continue;
    }
    probedEvents.push({
      childId: params.childId,
      canonicalWordId: word.canonicalWordId,
      eventKind: "probed",
      occurredOn: params.completedOn,
      sourceRef: params.sourceRef,
      rowStatus: "active",
      attemptText: word.attemptText,
    });
    if (!word.correct) {
      itemIntakes.push(
        learningItemFromProbeMiss({
          childId: params.childId,
          canonicalWordId: word.canonicalWordId,
          microSkillKey: params.microSkillKey,
          attemptText: word.attemptText,
          probeSourceRef: params.sourceRef,
          missedOn: params.completedOn,
        }),
      );
    }
  }
  return {
    probeRun: {
      childId: params.childId,
      microSkillKey: params.microSkillKey,
      runOn: params.completedOn,
      wordCount: params.words.length,
      sourceRef: params.sourceRef,
    },
    probedEvents,
    itemIntakes,
    candidateQueueRoutes,
  };
}

// ---------------------------------------------------------------------------
// Review session completion
// ---------------------------------------------------------------------------

export interface ReviewItemOutcome {
  canonicalWordId: string;
  bundleId: string;
  kind: DueItemKind;
  passed: boolean;
  attemptText: string;
}

export interface ReviewSessionCompletionParams {
  childId: string;
  completedOn: IsoDate;
  /** Idempotency key, e.g. `review:{child}:{date}`. */
  sourceRef: string;
  bundles: readonly ReviewBundleFact[];
  scheduleWords: readonly ScheduleWordFact[];
  outcomes: readonly ReviewItemOutcome[];
  /** canonical_word_id -> primary micro_skill_key, for ejection intake and
   * the reopen facts. Unknown words fail closed into unmappedEjections. */
  microSkillKeyByWordId: ReadonlyMap<string, string>;
  authenticUse?: AuthenticUseProvider;
}

export interface ReviewSessionCompletionResult {
  updatedBundles: ReviewBundleFact[];
  updatedScheduleWords: ScheduleWordFact[];
  outcomeEvents: OutcomeEventWithAttempt[];
  /** Ejections re-entering as pending-reteach learning items. */
  itemIntakes: LearningItemFact[];
  /** Ejected words whose skill is unknown — surfaced, never guessed. */
  unmappedEjections: string[];
  /** 3+-wrong reopen rule: when three or more words are wrong in one
   * session, the failed words' micro-skills are flagged as reteach demand
   * (documented pin: each failed word's skill is flagged). */
  reopenMicroSkillKeys: string[];
  /** Words paused for parent review by a post-reteach failure — the
   * word_pending_parent_review skip evidence for later composition. */
  pausedForParentReview: string[];
}

export function onReviewSessionCompleted(
  policy: ReviewPolicy,
  params: ReviewSessionCompletionParams,
): ReviewSessionCompletionResult {
  const authenticUse = params.authenticUse ?? failClosedAuthenticUseProvider;
  const attemptByWordId = new Map(
    params.outcomes.map((outcome) => [outcome.canonicalWordId, outcome.attemptText]),
  );

  const bundleById = new Map(params.bundles.map((bundle) => [bundle.bundleId, bundle]));
  let words = [...params.scheduleWords];
  const updatedBundles = new Map<string, ReviewBundleFact>();
  const events: ReviewOutcomeEvent[] = [];

  // Bundle reviews: group by bundle and resolve through Slice 2.
  const bundleOutcomes = new Map<string, ReviewItemOutcome[]>();
  for (const outcome of params.outcomes) {
    if (outcome.kind === "bundle_review") {
      const list = bundleOutcomes.get(outcome.bundleId);
      if (list) {
        list.push(outcome);
      } else {
        bundleOutcomes.set(outcome.bundleId, [outcome]);
      }
    }
  }
  for (const [bundleId, outcomes] of [...bundleOutcomes.entries()].sort()) {
    const bundle = bundleById.get(bundleId);
    if (bundle === undefined) {
      throw new Error(`onReviewSessionCompleted: unknown bundle ${bundleId}`);
    }
    const members = words.filter((word) => word.bundleId === bundleId);
    const resolution = resolveBundleReview(
      policy,
      bundle,
      members,
      outcomes.map((outcome) => ({
        canonicalWordId: outcome.canonicalWordId,
        passed: outcome.passed,
      })),
      params.completedOn,
      authenticUse,
    );
    updatedBundles.set(bundleId, resolution.bundle);
    const resolvedByWord = new Map(resolution.words.map((word) => [word.canonicalWordId, word]));
    words = words.map((word) =>
      word.bundleId === bundleId ? resolvedByWord.get(word.canonicalWordId) ?? word : word,
    );
    events.push(...resolution.events);
  }

  // Catch-up retests and pre-retirement checks resolve per word.
  for (const outcome of params.outcomes) {
    if (outcome.kind === "bundle_review") {
      continue;
    }
    const bundle = updatedBundles.get(outcome.bundleId) ?? bundleById.get(outcome.bundleId);
    if (bundle === undefined) {
      throw new Error(`onReviewSessionCompleted: unknown bundle ${outcome.bundleId}`);
    }
    const index = words.findIndex(
      (word) =>
        word.canonicalWordId === outcome.canonicalWordId &&
        word.bundleId === outcome.bundleId &&
        word.rowStatus === "active",
    );
    if (index === -1) {
      throw new Error(
        `onReviewSessionCompleted: no active schedule word for ${outcome.canonicalWordId}`,
      );
    }
    if (outcome.kind === "catch_up_retest") {
      const resolution = resolveCatchUpRetest(
        policy,
        bundle,
        words[index],
        outcome.passed,
        params.completedOn,
      );
      words = [...words.slice(0, index), resolution.word, ...words.slice(index + 1)];
      events.push(...resolution.events);
    } else {
      const resolution = resolvePreRetirementCheck(
        policy,
        words[index],
        outcome.passed,
        params.completedOn,
      );
      words = [...words.slice(0, index), resolution.word, ...words.slice(index + 1)];
      events.push(...resolution.events);
    }
  }

  // Attach raw attempt text to the production outcome events (pass/fail
  // events for the word the child actually produced this session).
  const productionEventTypes = new Set([
    "review_pass",
    "review_fail",
    "retest_pass",
    "retest_fail",
    "retirement_check_pass",
    "retirement_check_fail",
  ]);
  const outcomeEvents: OutcomeEventWithAttempt[] = events.map((event) => ({
    ...event,
    attemptText: productionEventTypes.has(event.eventType)
      ? attemptByWordId.get(event.canonicalWordId) ?? null
      : null,
  }));

  // Ejections re-enter as pending-reteach learning items.
  const itemIntakes: LearningItemFact[] = [];
  const unmappedEjections: string[] = [];
  for (const event of events) {
    if (event.eventType !== "ejected") {
      continue;
    }
    const microSkillKey = params.microSkillKeyByWordId.get(event.canonicalWordId);
    if (microSkillKey === undefined) {
      unmappedEjections.push(event.canonicalWordId);
      continue;
    }
    itemIntakes.push(
      learningItemFromEjection({
        childId: params.childId,
        canonicalWordId: event.canonicalWordId,
        microSkillKey,
        ejectedOn: params.completedOn,
        ejectionSourceRef: params.sourceRef,
        attemptText: attemptByWordId.get(event.canonicalWordId) ?? null,
      }),
    );
  }

  // 3+-wrong reopen rule (blueprint review session shape, rule 4).
  const failedOutcomes = params.outcomes.filter((outcome) => !outcome.passed);
  const reopenMicroSkillKeys =
    failedOutcomes.length >= 3
      ? [
          ...new Set(
            failedOutcomes
              .map((outcome) => params.microSkillKeyByWordId.get(outcome.canonicalWordId))
              .filter((skill): skill is string => skill !== undefined),
          ),
        ].sort()
      : [];

  const pausedForParentReview = events
    .filter((event) => event.eventType === "paused_parent_review")
    .map((event) => event.canonicalWordId)
    .sort();

  return {
    updatedBundles: [...updatedBundles.values()],
    updatedScheduleWords: words,
    outcomeEvents,
    itemIntakes,
    unmappedEjections,
    reopenMicroSkillKeys,
    pausedForParentReview,
  };
}

/** Learning-item follow-up for a paused word: the schedulable item (if any)
 * pauses too, so composition skips it with word_pending_parent_review. */
export function pauseItemsForParentReview(
  items: readonly LearningItemFact[],
  childId: string,
  pausedWordIds: readonly string[],
): LearningItemFact[] {
  const paused = new Set(pausedWordIds);
  return items
    .filter(
      (item) =>
        item.childId === childId && item.rowStatus === "active" && paused.has(item.canonicalWordId),
    )
    .map(pauseItemForParentReview);
}
