import {
  addDays,
  createReviewBundle,
  failClosedAuthenticUseProvider,
  resolveBundleReview,
  resolveCatchUpRetest,
  resolvePreRetirementCheck,
  REVIEW_POLICY_V1,
  type AuthenticUseProvider,
  type ReviewBundleFact,
  type ReviewOutcomeEvent,
  type ScheduleWordFact,
  type WordReviewOutcome,
} from "../lib/adle/review-scheduler";
import {
  dueCatchUpRetests,
  dueReviewWords,
  reviewSessionQueue,
  throttlePredicate,
} from "../lib/adle/review-due-queue";
import { taughtWordHistoryProviderFromFacts } from "../lib/adle/taught-word-history";
import { isReviewEligible } from "../lib/adle/dictionary-eligibility";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const policy = REVIEW_POLICY_V1;
const alwaysAuthenticUse: AuthenticUseProvider = { hasAuthenticUseSince: () => true };

function allPass(words: readonly ScheduleWordFact[], bundleId: string): WordReviewOutcome[] {
  return words
    .filter((w) => w.bundleId === bundleId && w.membershipStatus === "scheduled" && w.rowStatus === "active")
    .map((w) => ({ canonicalWordId: w.canonicalWordId, passed: true }));
}

interface CleanRunResult {
  bundle: ReviewBundleFact;
  words: ScheduleWordFact[];
  events: ReviewOutcomeEvent[];
  reviewDates: string[];
}

/** Drive a bundle through every scheduled review, all passes, reviewing
 * exactly on each due date. */
function runCleanLadder(taughtOn: string, provider: AuthenticUseProvider): CleanRunResult {
  let { bundle, words } = createReviewBundle(policy, {
    bundleId: "b1",
    childId: "child-1",
    sourceRef: "lesson-2026-07-05",
    taughtOn,
    words: [{ canonicalWordId: "w1" }, { canonicalWordId: "w2" }],
  });
  const events: ReviewOutcomeEvent[] = [];
  const reviewDates: string[] = [];
  while (bundle.bundleStatus === "active") {
    const completedOn = bundle.nextDueOn;
    reviewDates.push(completedOn);
    const result = resolveBundleReview(policy, bundle, words, allPass(words, "b1"), completedOn, provider);
    bundle = result.bundle;
    words = result.words;
    events.push(...result.events);
  }
  return { bundle, words, events, reviewDates };
}

// --- Interval ladder truth (rolling anchors, on-time reviews) ---------------

{
  const run = runCleanLadder("2026-01-01", alwaysAuthenticUse);
  // Gaps 1/3/7/14/28/56 rolling from each completion date.
  assert(
    run.reviewDates.join(",") ===
      ["2026-01-02", "2026-01-05", "2026-01-12", "2026-01-26", "2026-02-23", "2026-04-20"].join(","),
    `clean ladder reviews on the pinned 1/3/7/14/28/56 rolling gaps, got ${run.reviewDates.join(",")}`,
  );
  assert(run.bundle.bundleStatus === "completed", "final-interval resolution completes the bundle");
  const passEvents = run.events.filter((e) => e.eventType === "review_pass");
  assert(passEvents.length === 12, "two words x six ladder reviews emit twelve review_pass events");
  assert(
    run.words.every((w) => w.membershipStatus === "retired"),
    "with authentic use since the 28-day review, a clean 56-day pass retires immediately",
  );
  assert(
    run.words.every((w) => w.last28DayReviewOn === "2026-02-23"),
    "passing the 28-day review stamps the authentic-use anchor date",
  );
}

// --- 112-day conditionality --------------------------------------------------

{
  // Fail-closed default provider: no authentic use -> the check, never early retirement.
  const run = runCleanLadder("2026-01-01", failClosedAuthenticUseProvider);
  assert(
    run.words.every((w) => w.membershipStatus === "awaiting_pre_retirement_check"),
    "default authentic-use provider fails closed into the pre-retirement check",
  );
  assert(
    run.words.every((w) => w.preRetirementCheckDueOn === addDays("2026-04-20", 112)),
    "the check is due 112 days after the 56-day pass (owner-confirmed anchor)",
  );
  assert(
    run.events.filter((e) => e.eventType === "retirement_check_scheduled").length === 2,
    "check scheduling is recorded in the outcome ledger",
  );

  // Clean check pass -> retired.
  const checked = resolvePreRetirementCheck(policy, run.words[0], true, run.words[0].preRetirementCheckDueOn!);
  assert(checked.word.membershipStatus === "retired", "clean 112-day pass retires the word");
  assert(
    checked.events.map((e) => e.eventType).join(",") === "retirement_check_pass,retired",
    "112-day pass emits check-pass then retired",
  );

  // Check fail -> the standard catch-up ladder, never a deduction concept.
  const failed = resolvePreRetirementCheck(policy, run.words[1], false, run.words[1].preRetirementCheckDueOn!);
  assert(failed.word.membershipStatus === "catch_up" && failed.word.catchUpStage === 1, "112-day fail enters catch-up");
  assert(
    failed.word.nextRetestDueOn === addDays(run.words[1].preRetirementCheckDueOn!, 1),
    "112-day fail's first retest is due next day",
  );
  // Recovery from a failed check retires (one check only — documented pin).
  const completedBundle: ReviewBundleFact = { ...run.bundle };
  const recovered = resolveCatchUpRetest(policy, completedBundle, failed.word, true, failed.word.nextRetestDueOn!);
  assert(
    recovered.word.membershipStatus === "retired",
    "catch-up recovery from a failed pre-retirement check retires the word (single check pin)",
  );
}

{
  // A 56-day review WITHOUT authentic use but with a provider that has use
  // since the 28-day review -> immediate retirement; use only BEFORE the
  // 28-day review must not count.
  const sinceDates: string[] = [];
  const recorder: AuthenticUseProvider = {
    hasAuthenticUseSince: (_c, _w, since) => {
      sinceDates.push(since);
      return false;
    },
  };
  runCleanLadder("2026-01-01", recorder);
  assert(
    sinceDates.every((d) => d === "2026-02-23"),
    "the authentic-use window is measured from the 28-day review date",
  );
}

// --- Catch-up timing, ejection, parent pause ---------------------------------

{
  let { bundle, words } = createReviewBundle(policy, {
    bundleId: "b2",
    childId: "child-1",
    sourceRef: "lesson-2026-07-05",
    taughtOn: "2026-01-01",
    words: [{ canonicalWordId: "wf" }, { canonicalWordId: "wp" }],
  });
  // Day 1 review: wf fails, wp passes.
  const day1 = resolveBundleReview(
    policy,
    bundle,
    words,
    [
      { canonicalWordId: "wf", passed: false },
      { canonicalWordId: "wp", passed: true },
    ],
    "2026-01-02",
  );
  bundle = day1.bundle;
  words = day1.words;
  const wf1 = words.find((w) => w.canonicalWordId === "wf")!;
  assert(wf1.membershipStatus === "catch_up" && wf1.catchUpStage === 1, "failed review word enters catch-up stage 1");
  assert(wf1.nextRetestDueOn === "2026-01-03", "first catch-up retest is due NEXT DAY (amendment item 5)");
  assert(wf1.failedReviewOn === "2026-01-02", "the failed review date anchors the catch-up ladder");
  assert(
    bundle.intervalIndex === 1 && bundle.nextDueOn === "2026-01-05",
    "the bundle advances without waiting for the catch-up word",
  );

  // First retest fails -> second at +3 days from the FAILED REVIEW.
  const retest1 = resolveCatchUpRetest(policy, bundle, wf1, false, "2026-01-03");
  assert(retest1.word.catchUpStage === 2, "first retest failure moves to stage 2");
  assert(
    retest1.word.nextRetestDueOn === "2026-01-05",
    "second retest is due +3 days from the failed review — two chances inside the 7-day window",
  );

  // Second retest passes -> rejoins the bundle's current schedule.
  const recovered = resolveCatchUpRetest(policy, bundle, retest1.word, true, "2026-01-05");
  assert(
    recovered.word.membershipStatus === "scheduled" && recovered.word.catchUpStage === 0,
    "catch-up recovery rejoins the bundle's schedule at its current interval (never a reset)",
  );

  // Alternate branch: second retest fails -> ejection, reteach flag, bundle unaffected.
  const ejected = resolveCatchUpRetest(policy, bundle, retest1.word, false, "2026-01-05");
  assert(ejected.word.membershipStatus === "ejected_pending_reteach", "second retest failure ejects to pending reteach");
  assert(
    ejected.events.map((e) => e.eventType).join(",") === "retest_fail,ejected,reteach_priority_flagged",
    "ejection emits the reteach-priority fact for the Slice 3 composer",
  );

  // Post-reteach cycle: ejection becomes a parent-review pause.
  const reteachWord: ScheduleWordFact = { ...retest1.word, reteachCycleCount: 1 };
  const paused = resolveCatchUpRetest(policy, bundle, reteachWord, false, "2026-01-05");
  assert(
    paused.word.membershipStatus === "paused_parent_review",
    "a word ejected again after a reteach cycle pauses for parent review",
  );
  assert(
    dueCatchUpRetests([paused.word], "2026-12-31").length === 0 &&
      dueReviewWords([bundle], [paused.word], "2026-12-31").length === 0,
    "a paused word is absent from every due-queue read",
  );
}

// --- Non-clean final pass takes the check regardless of authentic use ---------

{
  let { bundle, words } = createReviewBundle(policy, {
    bundleId: "b3",
    childId: "child-1",
    sourceRef: "lesson",
    taughtOn: "2026-01-01",
    words: [{ canonicalWordId: "wx" }],
  });
  // Pass everything up to (not including) the final review.
  for (let i = 0; i < policy.intervalLadderDays.length - 1; i += 1) {
    const r = resolveBundleReview(policy, bundle, words, allPass(words, "b3"), bundle.nextDueOn, alwaysAuthenticUse);
    bundle = r.bundle;
    words = r.words;
  }
  // Fail the 56-day review, then catch up next day.
  const finalFail = resolveBundleReview(
    policy,
    bundle,
    words,
    [{ canonicalWordId: "wx", passed: false }],
    bundle.nextDueOn,
    alwaysAuthenticUse,
  );
  assert(finalFail.bundle.bundleStatus === "completed", "final-interval resolution completes the bundle even on failure");
  const failedWord = finalFail.words[0];
  const caughtUp = resolveCatchUpRetest(policy, finalFail.bundle, failedWord, true, failedWord.nextRetestDueOn!);
  assert(
    caughtUp.word.membershipStatus === "awaiting_pre_retirement_check",
    "a caught-up final pass is not clean: it takes the pre-retirement check even with authentic use (documented pin)",
  );
}

// --- Throttle edge and session cap --------------------------------------------

{
  function scheduledFixture(count: number, retests: number): { bundles: ReviewBundleFact[]; words: ScheduleWordFact[] } {
    const bundles: ReviewBundleFact[] = [
      {
        bundleId: "bt",
        childId: "child-1",
        sourceRef: "lesson",
        intervalIndex: 2,
        nextDueOn: "2026-03-01",
        schedulePolicyVersion: policy.schedulePolicyVersion,
        bundleStatus: "active",
        rowStatus: "active",
      },
    ];
    const words: ScheduleWordFact[] = [];
    for (let i = 0; i < count; i += 1) {
      words.push({
        childId: "child-1",
        canonicalWordId: `sw${String(i).padStart(2, "0")}`,
        bundleId: "bt",
        membershipStatus: "scheduled",
        catchUpStage: 0,
        nextRetestDueOn: null,
        failedReviewOn: null,
        preRetirementCheckDueOn: null,
        last28DayReviewOn: null,
        reteachCycleCount: 0,
        taughtOn: addDays("2026-01-01", i),
        rowStatus: "active",
      });
    }
    for (let i = 0; i < retests; i += 1) {
      words.push({
        childId: "child-1",
        canonicalWordId: `cw${String(i).padStart(2, "0")}`,
        bundleId: "bt",
        membershipStatus: "catch_up",
        catchUpStage: 1,
        nextRetestDueOn: "2026-02-20",
        failedReviewOn: "2026-02-19",
        preRetirementCheckDueOn: null,
        last28DayReviewOn: null,
        reteachCycleCount: 0,
        taughtOn: "2025-12-01",
        rowStatus: "active",
      });
    }
    return { bundles, words };
  }

  const atCap = scheduledFixture(8, 2);
  const atCapDecision = throttlePredicate(policy, atCap.bundles, atCap.words, "2026-03-01");
  assert(
    atCapDecision.totalDue === 10 && atCapDecision.lessonAllowed,
    "exactly 10 due (8 reviews + 2 retests) allows the Part 2 lesson",
  );
  assert(
    atCapDecision.dueCatchUpRetestCount === 2,
    "catch-up retests count in the throttle predicate",
  );

  const overCap = scheduledFixture(9, 2);
  const overCapDecision = throttlePredicate(policy, overCap.bundles, overCap.words, "2026-03-01");
  assert(
    overCapDecision.totalDue === 11 && !overCapDecision.lessonAllowed,
    "11 due blocks the lesson: review-only day",
  );

  const queue = reviewSessionQueue(policy, overCap.bundles, overCap.words, "2026-03-01");
  assert(queue.length === 10, "the session queue caps at 10");
  assert(
    queue[0].kind === "catch_up_retest" && queue[1].kind === "catch_up_retest",
    "oldest-first: the earlier-due catch-up retests lead the queue",
  );
  const trimmed = overCap.words.filter(
    (w) => !queue.some((q) => q.canonicalWordId === w.canonicalWordId),
  );
  assert(trimmed.length === 1, "one word is trimmed by the cap");
  assert(
    trimmed[0].membershipStatus === "scheduled",
    "a trimmed word keeps its state untouched — still due tomorrow, no penalty",
  );

  // Deterministic ordering: repeat runs are byte-identical.
  const again = reviewSessionQueue(policy, overCap.bundles, overCap.words, "2026-03-01");
  assert(
    JSON.stringify(queue) === JSON.stringify(again),
    "the session queue is deterministic for identical inputs",
  );
}

// --- Forward-only property and guards ------------------------------------------

{
  const { bundle, words } = createReviewBundle(policy, {
    bundleId: "b4",
    childId: "child-1",
    sourceRef: "lesson",
    taughtOn: "2026-01-01",
    words: [{ canonicalWordId: "wg" }],
  });

  let threw = false;
  try {
    resolveBundleReview(policy, bundle, words, allPass(words, "b4"), "2026-01-01");
  } catch {
    threw = true;
  }
  assert(threw, "a review before the due date is refused (reviews never run early)");

  threw = false;
  try {
    resolveBundleReview(
      policy,
      { ...bundle, schedulePolicyVersion: "review_policy_v0_unknown" },
      words,
      allPass(words, "b4"),
      "2026-01-02",
    );
  } catch {
    threw = true;
  }
  assert(threw, "an unknown policy version is refused, never guessed");

  threw = false;
  try {
    resolveBundleReview(policy, bundle, words, [], "2026-01-02");
  } catch {
    threw = true;
  }
  assert(threw, "outcomes must cover exactly the bundle's scheduled words");

  // Overdue processing: a late review still only moves forward.
  const late = resolveBundleReview(policy, bundle, words, allPass(words, "b4"), "2026-01-20");
  assert(
    late.bundle.intervalIndex === 1 && late.bundle.nextDueOn === "2026-01-23",
    "rolling anchor: a late review rolls the next due date forward from completion — absence never demotes",
  );
}

{
  // Across a mixed 200-day scenario (fails, catch-ups, ejections, overdue
  // days), no bundle interval ever decreases and no due date moves earlier.
  let { bundle, words } = createReviewBundle(policy, {
    bundleId: "b5",
    childId: "child-1",
    sourceRef: "lesson",
    taughtOn: "2026-01-01",
    words: [{ canonicalWordId: "m1" }, { canonicalWordId: "m2" }, { canonicalWordId: "m3" }],
  });
  const intervalTrace: number[] = [bundle.intervalIndex];
  const dueTrace: string[] = [bundle.nextDueOn];
  // Deterministic outcome pattern: m1 fails every review then recovers at
  // stage 2; m2 fails once and never recovers (ejects); m3 always passes.
  let reviewCount = 0;
  while (bundle.bundleStatus === "active") {
    const lateBy = reviewCount % 2 === 0 ? 0 : 2; // alternate on-time and overdue
    const completedOn = addDays(bundle.nextDueOn, lateBy);
    const scheduled = words.filter((w) => w.membershipStatus === "scheduled");
    const outcomes = scheduled.map((w) => ({
      canonicalWordId: w.canonicalWordId,
      passed: w.canonicalWordId === "m3" || (w.canonicalWordId === "m1" && reviewCount % 2 === 1),
    }));
    const resolved = resolveBundleReview(policy, bundle, words, outcomes, completedOn, failClosedAuthenticUseProvider);
    bundle = resolved.bundle;
    words = resolved.words;
    intervalTrace.push(bundle.intervalIndex);
    dueTrace.push(bundle.nextDueOn);
    // Resolve any due retests, deterministically: m1 recovers at stage 2, m2 never.
    for (const word of words.filter((w) => w.membershipStatus === "catch_up")) {
      const first = resolveCatchUpRetest(policy, bundle, word, false, word.nextRetestDueOn!);
      words = words.map((w) => (w.canonicalWordId === word.canonicalWordId ? first.word : w));
      if (first.word.membershipStatus === "catch_up") {
        const second = resolveCatchUpRetest(
          policy,
          bundle,
          first.word,
          word.canonicalWordId === "m1",
          first.word.nextRetestDueOn!,
        );
        words = words.map((w) => (w.canonicalWordId === word.canonicalWordId ? second.word : w));
      }
    }
    reviewCount += 1;
    assert(reviewCount < 50, "mixed scenario terminates");
  }
  for (let i = 1; i < intervalTrace.length; i += 1) {
    assert(intervalTrace[i] >= intervalTrace[i - 1], "bundle interval index never decreases");
    assert(dueTrace[i] >= dueTrace[i - 1], "bundle due date never moves earlier");
  }
  const m2 = words.find((w) => w.canonicalWordId === "m2")!;
  assert(m2.membershipStatus === "ejected_pending_reteach", "the never-recovering word ejected, not demoted");
}

// --- Determinism of transitions -------------------------------------------------

{
  const runA = runCleanLadder("2026-01-01", failClosedAuthenticUseProvider);
  const runB = runCleanLadder("2026-01-01", failClosedAuthenticUseProvider);
  assert(
    JSON.stringify(runA) === JSON.stringify(runB),
    "identical inputs produce byte-identical state and event output",
  );
}

// --- Empty state fails closed ----------------------------------------------------

{
  assert(dueReviewWords([], [], "2026-07-05").length === 0, "no state -> nothing due");
  const decision = throttlePredicate(policy, [], [], "2026-07-05");
  assert(
    decision.lessonAllowed && decision.totalDue === 0,
    "no review debt -> lesson allowed with zero counts",
  );
}

// --- Real TaughtWordHistoryProvider backs eligibility status 4 --------------------

{
  const provider = taughtWordHistoryProviderFromFacts([
    {
      childId: "child-1",
      canonicalWordId: "w1",
      eventKind: "taught",
      occurredOn: "2026-07-01",
      sourceRef: "lesson-1",
      rowStatus: "active",
    },
    {
      childId: "child-1",
      canonicalWordId: "w2",
      eventKind: "probed",
      occurredOn: "2026-07-02",
      sourceRef: "probe-1",
      rowStatus: "active",
    },
    {
      childId: "child-1",
      canonicalWordId: "w3",
      eventKind: "taught",
      occurredOn: "2026-07-03",
      sourceRef: "lesson-2",
      rowStatus: "superseded",
    },
  ]);
  assert(isReviewEligible("child-1", "w1", provider), "a taught word is review-eligible");
  assert(isReviewEligible("child-1", "w2", provider), "a probed word is review-eligible");
  assert(!isReviewEligible("child-1", "w3", provider), "an inactive history row does not count");
  assert(!isReviewEligible("child-1", "w4", provider), "an untaught word stays ineligible");
  assert(!isReviewEligible("child-2", "w1", provider), "another child's history does not leak");
  assert(!isReviewEligible("child-1", "w1"), "the fail-closed default remains the default");
}

console.log("ADLE review scheduler regression passed");
