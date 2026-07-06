/**
 * ADLE Slice 2 (2B): review-scheduler day-advance logic — pure, server-only
 * transitions over scheduler facts. The current date is always an injected
 * parameter; nothing here reads a clock, so every transition is deterministic.
 *
 * Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
 * (review model; 2026-07-04 amendment items 5, 6, 8) and the approved
 * formula-numbers proposal (§3.1 boundary, §3.4, §4b). Owner-approved pins
 * (2026-07-05, Slice 2 plan open questions):
 * - rolling anchor: the next due date rolls from the actual review
 *   completion date, never the originally scheduled date
 * - the pre-retirement check is due `preRetirementCheckGapDays` (112) days
 *   after a non-clean 56-day pass
 * - ejected words re-enter as pending learning_items in Slice 3; here the
 *   scheduler only emits the ejection/reteach-priority facts
 *
 * "Bundles only move forward" is structural: there is no function in this
 * module that lowers an interval index or moves a due date earlier, and the
 * resolve functions refuse to run before their due dates.
 *
 * Documented interpretive pins (regression-covered):
 * - a catch-up recovery at the final (56-day) interval is not a clean pass,
 *   so it always takes the pre-retirement check regardless of authentic use
 * - a catch-up recovery from a failed pre-retirement check retires the word
 *   (the single check was already taken; the amendment specifies one check)
 */

export type IsoDate = string; // YYYY-MM-DD, UTC calendar date

export interface ReviewPolicy {
  schedulePolicyVersion: string;
  /** Rolling gaps in days from the previous review (not offsets from taught). */
  intervalLadderDays: readonly number[];
  /** Days after a failed review: first retest, then second retest. */
  catchUpOffsetsDays: readonly [number, number];
  sessionCap: number;
  preRetirementCheckGapDays: number;
}

export const REVIEW_POLICY_V1: ReviewPolicy = {
  schedulePolicyVersion: "review_policy_v1_2026-07-04",
  intervalLadderDays: [1, 3, 7, 14, 28, 56],
  catchUpOffsetsDays: [1, 3],
  sessionCap: 10,
  preRetirementCheckGapDays: 112,
};

export function addDays(date: IsoDate, days: number): IsoDate {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid ISO date: ${date}`);
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export type SchedulerRowStatus = "draft" | "active" | "rejected" | "superseded";
export type BundleStatus = "active" | "completed";

export type WordMembershipStatus =
  | "scheduled"
  | "catch_up"
  | "ejected_pending_reteach"
  | "paused_parent_review"
  | "awaiting_pre_retirement_check"
  | "retired";

export interface ReviewBundleFact {
  bundleId: string;
  childId: string;
  sourceRef: string;
  intervalIndex: number;
  nextDueOn: IsoDate;
  schedulePolicyVersion: string;
  bundleStatus: BundleStatus;
  rowStatus: SchedulerRowStatus;
}

export interface ScheduleWordFact {
  childId: string;
  canonicalWordId: string;
  bundleId: string;
  membershipStatus: WordMembershipStatus;
  catchUpStage: 0 | 1 | 2;
  nextRetestDueOn: IsoDate | null;
  failedReviewOn: IsoDate | null;
  preRetirementCheckDueOn: IsoDate | null;
  last28DayReviewOn: IsoDate | null;
  reteachCycleCount: number;
  taughtOn: IsoDate;
  rowStatus: SchedulerRowStatus;
}

export type ReviewOutcomeEventType =
  | "review_pass"
  | "review_fail"
  | "retest_pass"
  | "retest_fail"
  | "ejected"
  | "reteach_priority_flagged"
  | "paused_parent_review"
  | "retirement_check_scheduled"
  | "retirement_check_pass"
  | "retirement_check_fail"
  | "retired";

export interface ReviewOutcomeEvent {
  childId: string;
  canonicalWordId: string;
  bundleId: string | null;
  eventType: ReviewOutcomeEventType;
  occurredOn: IsoDate;
  intervalIndex: number | null;
  schedulePolicyVersion: string;
}

/**
 * Authentic-use lookup for the conditional pre-retirement check (amendment
 * item 6). The real provider is Slice 4 territory (evidence engine /
 * writing-engine boundary); the default fails closed in the pedagogically
 * safe direction: no provider -> no authentic use -> the word takes the
 * 112-day check (an extra ~1-response check, never a premature retirement).
 */
export interface AuthenticUseProvider {
  hasAuthenticUseSince(childId: string, canonicalWordId: string, sinceDate: IsoDate): boolean;
}

export const failClosedAuthenticUseProvider: AuthenticUseProvider = {
  hasAuthenticUseSince: () => false,
};

function requirePolicyMatch(policy: ReviewPolicy, version: string, context: string): void {
  if (policy.schedulePolicyVersion !== version) {
    throw new Error(
      `${context}: policy version mismatch (${version} vs active ${policy.schedulePolicyVersion}) — refuse, don't guess`,
    );
  }
}

function isFinalInterval(policy: ReviewPolicy, intervalIndex: number): boolean {
  return intervalIndex === policy.intervalLadderDays.length - 1;
}

/** The ladder position whose gap is 28 days: passing it stamps the anchor
 * date the retirement decision's authentic-use window is measured from. */
function is28DayInterval(policy: ReviewPolicy, intervalIndex: number): boolean {
  return policy.intervalLadderDays[intervalIndex] === 28;
}

export interface CreateBundleParams {
  bundleId: string;
  childId: string;
  sourceRef: string;
  taughtOn: IsoDate;
  words: readonly { canonicalWordId: string; reteachCycleCount?: number }[];
}

export interface CreateBundleResult {
  bundle: ReviewBundleFact;
  words: ScheduleWordFact[];
}

/** A successful lesson's words enter the 1-day review as a new bundle
 * (blueprint "Lesson flow" step 4). Reteach re-entry passes the word's
 * incremented reteachCycleCount (Slice 3's responsibility). */
export function createReviewBundle(policy: ReviewPolicy, params: CreateBundleParams): CreateBundleResult {
  if (params.words.length === 0) {
    throw new Error("createReviewBundle: a bundle needs at least one word");
  }
  const bundle: ReviewBundleFact = {
    bundleId: params.bundleId,
    childId: params.childId,
    sourceRef: params.sourceRef,
    intervalIndex: 0,
    nextDueOn: addDays(params.taughtOn, policy.intervalLadderDays[0]),
    schedulePolicyVersion: policy.schedulePolicyVersion,
    bundleStatus: "active",
    rowStatus: "active",
  };
  const words = params.words.map<ScheduleWordFact>((entry) => ({
    childId: params.childId,
    canonicalWordId: entry.canonicalWordId,
    bundleId: params.bundleId,
    membershipStatus: "scheduled",
    catchUpStage: 0,
    nextRetestDueOn: null,
    failedReviewOn: null,
    preRetirementCheckDueOn: null,
    last28DayReviewOn: null,
    reteachCycleCount: entry.reteachCycleCount ?? 0,
    taughtOn: params.taughtOn,
    rowStatus: "active",
  }));
  return { bundle, words };
}

export interface WordReviewOutcome {
  canonicalWordId: string;
  passed: boolean;
}

export interface BundleReviewResolution {
  bundle: ReviewBundleFact;
  words: ScheduleWordFact[];
  events: ReviewOutcomeEvent[];
}

function retirementDecision(
  policy: ReviewPolicy,
  word: ScheduleWordFact,
  completedOn: IsoDate,
  authenticUse: AuthenticUseProvider,
  events: ReviewOutcomeEvent[],
): ScheduleWordFact {
  const qualifies =
    word.last28DayReviewOn !== null &&
    authenticUse.hasAuthenticUseSince(word.childId, word.canonicalWordId, word.last28DayReviewOn);
  if (qualifies) {
    events.push({
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: word.bundleId,
      eventType: "retired",
      occurredOn: completedOn,
      intervalIndex: null,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    });
    return { ...word, membershipStatus: "retired" };
  }
  events.push({
    childId: word.childId,
    canonicalWordId: word.canonicalWordId,
    bundleId: word.bundleId,
    eventType: "retirement_check_scheduled",
    occurredOn: completedOn,
    intervalIndex: null,
    schedulePolicyVersion: policy.schedulePolicyVersion,
  });
  return {
    ...word,
    membershipStatus: "awaiting_pre_retirement_check",
    preRetirementCheckDueOn: addDays(completedOn, policy.preRetirementCheckGapDays),
  };
}

function enterCatchUp(
  policy: ReviewPolicy,
  word: ScheduleWordFact,
  failedOn: IsoDate,
): ScheduleWordFact {
  return {
    ...word,
    membershipStatus: "catch_up",
    catchUpStage: 1,
    failedReviewOn: failedOn,
    nextRetestDueOn: addDays(failedOn, policy.catchUpOffsetsDays[0]),
  };
}

/**
 * Resolve a due bundle-review session: one pass/fail outcome per currently
 * scheduled member word. Non-scheduled members (catch-up, ejected, paused,
 * awaiting check, retired) pass through untouched — a catch-up word's bundle
 * continues without waiting for it (blueprint "Failed words").
 *
 * Bundle advance (rolling anchor): interval_index + 1, next due =
 * completion date + the next ladder gap. Final-interval resolution always
 * completes the bundle. A non-final bundle with no scheduled or catch-up
 * members left also completes (everything ejected/paused).
 */
export function resolveBundleReview(
  policy: ReviewPolicy,
  bundle: ReviewBundleFact,
  memberWords: readonly ScheduleWordFact[],
  outcomes: readonly WordReviewOutcome[],
  completedOn: IsoDate,
  authenticUse: AuthenticUseProvider = failClosedAuthenticUseProvider,
): BundleReviewResolution {
  requirePolicyMatch(policy, bundle.schedulePolicyVersion, "resolveBundleReview");
  if (bundle.bundleStatus !== "active" || bundle.rowStatus !== "active") {
    throw new Error("resolveBundleReview: bundle is not active");
  }
  if (completedOn < bundle.nextDueOn) {
    throw new Error(
      `resolveBundleReview: review on ${completedOn} is before due date ${bundle.nextDueOn} — reviews never run early`,
    );
  }

  const scheduled = memberWords.filter(
    (word) =>
      word.bundleId === bundle.bundleId &&
      word.rowStatus === "active" &&
      word.membershipStatus === "scheduled",
  );
  const outcomeByWord = new Map(outcomes.map((outcome) => [outcome.canonicalWordId, outcome.passed]));
  if (
    outcomes.length !== scheduled.length ||
    !scheduled.every((word) => outcomeByWord.has(word.canonicalWordId))
  ) {
    throw new Error(
      "resolveBundleReview: outcomes must cover exactly the bundle's scheduled words",
    );
  }

  const events: ReviewOutcomeEvent[] = [];
  const final = isFinalInterval(policy, bundle.intervalIndex);

  const words = memberWords.map((word) => {
    if (!outcomeByWord.has(word.canonicalWordId) || word.membershipStatus !== "scheduled") {
      return word;
    }
    const passed = outcomeByWord.get(word.canonicalWordId) === true;
    events.push({
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: bundle.bundleId,
      eventType: passed ? "review_pass" : "review_fail",
      occurredOn: completedOn,
      intervalIndex: bundle.intervalIndex,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    });
    if (!passed) {
      return enterCatchUp(policy, word, completedOn);
    }
    const stamped = is28DayInterval(policy, bundle.intervalIndex)
      ? { ...word, last28DayReviewOn: completedOn }
      : word;
    if (final) {
      return retirementDecision(policy, stamped, completedOn, authenticUse, events);
    }
    return stamped;
  });

  const anyRemaining = words.some(
    (word) =>
      word.bundleId === bundle.bundleId &&
      word.rowStatus === "active" &&
      (word.membershipStatus === "scheduled" || word.membershipStatus === "catch_up"),
  );

  const advancedBundle: ReviewBundleFact =
    final || !anyRemaining
      ? { ...bundle, bundleStatus: "completed" }
      : {
          ...bundle,
          intervalIndex: bundle.intervalIndex + 1,
          nextDueOn: addDays(completedOn, policy.intervalLadderDays[bundle.intervalIndex + 1]),
        };

  return { bundle: advancedBundle, words, events };
}

export interface CatchUpRetestResolution {
  word: ScheduleWordFact;
  events: ReviewOutcomeEvent[];
}

/**
 * Resolve a due catch-up retest (amendment item 5: first retest next day,
 * second at +3 days from the failed review, then ejection — two chances).
 *
 * Recovery destination depends on where the word's bundle stands:
 * - active bundle: the word rejoins its bundle's current schedule
 * - completed bundle, no check taken yet: the recovery was not a clean
 *   final pass, so the word takes the pre-retirement check (documented pin)
 * - completed bundle, check already taken (recovery from a failed
 *   pre-retirement check): the word retires — the amendment specifies one
 *   check (documented pin)
 *
 * A stage-2 failure ejects to pending reteach, or pauses for parent review
 * when the word has already been through a reteach cycle (blueprint
 * "Failed words"; skip reason word_pending_parent_review).
 */
export function resolveCatchUpRetest(
  policy: ReviewPolicy,
  bundle: ReviewBundleFact,
  word: ScheduleWordFact,
  passed: boolean,
  completedOn: IsoDate,
): CatchUpRetestResolution {
  requirePolicyMatch(policy, bundle.schedulePolicyVersion, "resolveCatchUpRetest");
  if (word.membershipStatus !== "catch_up" || word.rowStatus !== "active") {
    throw new Error("resolveCatchUpRetest: word is not in catch-up");
  }
  if (word.bundleId !== bundle.bundleId) {
    throw new Error("resolveCatchUpRetest: word does not belong to this bundle");
  }
  if (word.nextRetestDueOn === null || completedOn < word.nextRetestDueOn) {
    throw new Error("resolveCatchUpRetest: retest is not due yet — retests never run early");
  }

  const events: ReviewOutcomeEvent[] = [
    {
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: bundle.bundleId,
      eventType: passed ? "retest_pass" : "retest_fail",
      occurredOn: completedOn,
      intervalIndex: bundle.intervalIndex,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    },
  ];

  if (passed) {
    const recovered: ScheduleWordFact = {
      ...word,
      membershipStatus: "scheduled",
      catchUpStage: 0,
      nextRetestDueOn: null,
    };
    if (bundle.bundleStatus === "active") {
      return { word: recovered, events };
    }
    if (word.preRetirementCheckDueOn !== null) {
      events.push({
        childId: word.childId,
        canonicalWordId: word.canonicalWordId,
        bundleId: bundle.bundleId,
        eventType: "retired",
        occurredOn: completedOn,
        intervalIndex: null,
        schedulePolicyVersion: policy.schedulePolicyVersion,
      });
      return { word: { ...recovered, membershipStatus: "retired" }, events };
    }
    events.push({
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: bundle.bundleId,
      eventType: "retirement_check_scheduled",
      occurredOn: completedOn,
      intervalIndex: null,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    });
    return {
      word: {
        ...recovered,
        membershipStatus: "awaiting_pre_retirement_check",
        preRetirementCheckDueOn: addDays(completedOn, policy.preRetirementCheckGapDays),
      },
      events,
    };
  }

  if (word.catchUpStage === 1) {
    if (word.failedReviewOn === null) {
      throw new Error("resolveCatchUpRetest: catch-up word is missing its failed-review anchor");
    }
    return {
      word: {
        ...word,
        catchUpStage: 2,
        nextRetestDueOn: addDays(word.failedReviewOn, policy.catchUpOffsetsDays[1]),
      },
      events,
    };
  }

  // Stage-2 failure: ejection replaces demotion.
  if (word.reteachCycleCount >= 1) {
    events.push({
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: bundle.bundleId,
      eventType: "paused_parent_review",
      occurredOn: completedOn,
      intervalIndex: null,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    });
    return {
      word: { ...word, membershipStatus: "paused_parent_review", catchUpStage: 0, nextRetestDueOn: null },
      events,
    };
  }
  events.push(
    {
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: bundle.bundleId,
      eventType: "ejected",
      occurredOn: completedOn,
      intervalIndex: null,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    },
    {
      childId: word.childId,
      canonicalWordId: word.canonicalWordId,
      bundleId: bundle.bundleId,
      eventType: "reteach_priority_flagged",
      occurredOn: completedOn,
      intervalIndex: null,
      schedulePolicyVersion: policy.schedulePolicyVersion,
    },
  );
  return {
    word: { ...word, membershipStatus: "ejected_pending_reteach", catchUpStage: 0, nextRetestDueOn: null },
    events,
  };
}

export type PausedWordReleaseDecision = "resume" | "retire";

export interface PausedWordReleaseResult {
  word: ScheduleWordFact;
  events: ReviewOutcomeEvent[];
}

/**
 * Slice 6: parent release of a word paused by a post-reteach failure (the
 * previously missing exit from paused_parent_review). Two decisions only:
 * - resume: the word returns to the reteach path (ejected_pending_reteach) —
 *   the composer re-teaches it through the normal lesson flow and
 *   onLessonCompleted creates fresh schedule rows exactly as for any
 *   ejection; nothing here reschedules or lowers an interval.
 * - retire: the word leaves daily practice permanently (parent decision).
 * Both emit existing ledger event types, so the release is auditable without
 * any schema change. Re-mapping to a different skill/word is the existing
 * candidate-mapping flow's job, never a release decision.
 */
export function releasePausedScheduleWord(
  policy: ReviewPolicy,
  word: ScheduleWordFact,
  decision: PausedWordReleaseDecision,
  releasedOn: IsoDate,
): PausedWordReleaseResult {
  if (word.membershipStatus !== "paused_parent_review" || word.rowStatus !== "active") {
    throw new Error("releasePausedScheduleWord: word is not paused for parent review");
  }
  const base = {
    childId: word.childId,
    canonicalWordId: word.canonicalWordId,
    bundleId: word.bundleId,
    intervalIndex: null,
    schedulePolicyVersion: policy.schedulePolicyVersion,
  };
  if (decision === "resume") {
    return {
      word: { ...word, membershipStatus: "ejected_pending_reteach" },
      events: [{ ...base, eventType: "reteach_priority_flagged", occurredOn: releasedOn }],
    };
  }
  return {
    word: { ...word, membershipStatus: "retired" },
    events: [{ ...base, eventType: "retired", occurredOn: releasedOn }],
  };
}

export interface PreRetirementCheckResolution {
  word: ScheduleWordFact;
  events: ReviewOutcomeEvent[];
}

/**
 * Resolve a due pre-retirement (112-day) check. A clean pass retires the
 * word. A failure enters the standard catch-up ladder — scheduled-review
 * failures are always priced by catch-up/ejection, never by deductions
 * (proposal §3.1 boundary). The retained preRetirementCheckDueOn marks that
 * the word's single check was taken, which routes a later catch-up recovery
 * to retirement rather than a second check.
 */
export function resolvePreRetirementCheck(
  policy: ReviewPolicy,
  word: ScheduleWordFact,
  passed: boolean,
  completedOn: IsoDate,
): PreRetirementCheckResolution {
  if (word.membershipStatus !== "awaiting_pre_retirement_check" || word.rowStatus !== "active") {
    throw new Error("resolvePreRetirementCheck: word is not awaiting its check");
  }
  if (word.preRetirementCheckDueOn === null || completedOn < word.preRetirementCheckDueOn) {
    throw new Error("resolvePreRetirementCheck: check is not due yet — checks never run early");
  }

  const base = {
    childId: word.childId,
    canonicalWordId: word.canonicalWordId,
    bundleId: word.bundleId,
    intervalIndex: null,
    schedulePolicyVersion: policy.schedulePolicyVersion,
  };
  if (passed) {
    return {
      word: { ...word, membershipStatus: "retired" },
      events: [
        { ...base, eventType: "retirement_check_pass", occurredOn: completedOn },
        { ...base, eventType: "retired", occurredOn: completedOn },
      ],
    };
  }
  return {
    word: enterCatchUp(policy, word, completedOn),
    events: [{ ...base, eventType: "retirement_check_fail", occurredOn: completedOn }],
  };
}
