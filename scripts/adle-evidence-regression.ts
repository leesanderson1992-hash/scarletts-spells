/**
 * ADLE Slice 4 (4H): evidence-engine regression — fixture-backed,
 * DB-independent. Covers the v1 weight table, the one recency rule, every
 * cap, the ladder property, state edges, the §3.1 deduction table and
 * boundary, the slip limit/re-entry, the real AuthenticUseProvider, the
 * authentic-use review credit, the fail-closed bridge, and determinism.
 *
 * Ladder-figure note (regression-pinned): under the exact v1 pricing
 * (cold = 3+ day memory gap; cold credit once per 28 days) the clean
 * 1/3/7/14/28/56 run prices to 6.75, reproducing queue_sim_v2.py's credit()
 * arithmetic exactly. The blueprint amendment item 7's "~5.75" parenthetical
 * under-adds its own sequence; the protected property it pins (clean ladder
 * < 8; retirement alone never masters) holds with margin and is asserted
 * here. Flagged for a figure-correction amendment at Slice 4 closeout.
 */

import {
  EVIDENCE_POLICY_V1,
  normaliseAttempt,
  slipDeduction,
} from "../lib/adle/evidence-policy";
import {
  diffDays,
  priceWordEvidence,
  type AuthenticUseEventFact,
  type OutcomeEventFact,
  type SlippageEventFact,
  type TaughtHistoryFact,
  type WordPricingFacts,
} from "../lib/adle/evidence-pricing";
import {
  computeWordEvidenceState,
  isSlipEligibleState,
} from "../lib/adle/word-evidence-state";
import {
  applyAuthenticUseCredit,
  authenticUseBridge,
  authenticUseProviderFromFacts,
  intervalWindowStart,
  type AuthenticUseCandidate,
} from "../lib/adle/authentic-use";
import {
  detectWritingSlips,
  respondToSlip,
  wordStateAsOf,
  type WritingSlipCandidate,
} from "../lib/adle/slippage";
import {
  addDays,
  createReviewBundle,
  resolveBundleReview,
  REVIEW_POLICY_V1,
  type ReviewBundleFact,
  type ReviewOutcomeEvent,
  type ScheduleWordFact,
} from "../lib/adle/review-scheduler";
import { dueReviewWords } from "../lib/adle/review-due-queue";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}
function approx(a: number, b: number, message: string) {
  assert(Math.abs(a - b) < 1e-9, `${message} (got ${a}, expected ${b})`);
}

const policy = EVIDENCE_POLICY_V1;
const reviewPolicy = REVIEW_POLICY_V1;
const CHILD = "child-1";
const WORD = "w-because";
const NORMALISED = "because";

function emptyFacts(overrides: Partial<WordPricingFacts> = {}): WordPricingFacts {
  return {
    childId: CHILD,
    canonicalWordId: WORD,
    normalisedWord: NORMALISED,
    skillFamilyKey: "D4_PAT",
    outcomeEvents: [],
    taughtHistory: [],
    authenticUseEvents: [],
    slippageEvents: [],
    ...overrides,
  };
}

function taught(occurredOn: string, attemptText: string | null, kind: "taught" | "probed" = "taught"): TaughtHistoryFact {
  return { childId: CHILD, canonicalWordId: WORD, eventKind: kind, occurredOn, sourceRef: `${kind}:${occurredOn}`, rowStatus: "active", attemptText };
}
function outcome(event: ReviewOutcomeEvent, attemptText: string | null = NORMALISED): OutcomeEventFact {
  return { ...event, attemptText };
}
function authenticUse(occurredOn: string, pieceRef: string, parentVerified = true, useKind: AuthenticUseEventFact["useKind"] = "authentic_correct_use"): AuthenticUseEventFact {
  return { childId: CHILD, canonicalWordId: WORD, occurredOn, useKind, parentVerified, pieceRef, sourceRef: `wi:${pieceRef}`, rowStatus: "active" };
}

// --- 1. weight table + deduction table truth --------------------------------

assert(policy.evidencePolicyVersion === "evidence_policy_v1_2026-07-04", "policy version");
approx(policy.weights.authenticCorrectUse, 2.0, "authentic weight");
approx(policy.weights.selfCorrectionInWriting, 1.5, "self-correction weight");
approx(policy.weights.dictationCold, 1.5, "cold weight");
approx(policy.weights.dictationRecent, 0.5, "recent weight");
approx(policy.weights.controlledLessonSpelling, 0.75, "controlled weight");
approx(policy.weights.guidedOrRecognition, 0.25, "guided weight");
approx(policy.weights.exposure, 0, "exposure weight");
approx(slipDeduction(policy, "authentic_writing"), -1.0, "§3.1 authentic deduction");
approx(slipDeduction(policy, "dictation_cold"), -0.75, "§3.1 cold deduction");
approx(slipDeduction(policy, "dictation_recent"), -0.25, "§3.1 recent deduction");
approx(slipDeduction(policy, "controlled_lesson"), -0.375, "§3.1 controlled deduction");
assert(normaliseAttempt(" Because! ") === "because", "attempt normalisation");
assert(normaliseAttempt(null) === null && normaliseAttempt("!!") === null, "attempt normalisation fail-closed");

// --- 2. recency rule + cold cap ---------------------------------------------

{
  // taught d0 (exposure), review passes at gaps 1 / 3 / 14 / 28.
  const events: OutcomeEventFact[] = [
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: "2026-01-02", intervalIndex: 0, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: "2026-01-05", intervalIndex: 1, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: "2026-01-19", intervalIndex: 2, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: "2026-02-16", intervalIndex: 3, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
  ];
  const pricing = priceWordEvidence(policy, emptyFacts({
    taughtHistory: [taught("2026-01-01", NORMALISED)],
    outcomeEvents: events,
  }));
  const reviews = pricing.entries.filter((entry) => entry.kind === "review_production");
  approx(reviews[0].weight, 0.5, "gap 1 prices recent");
  assert(reviews[0].recency === "recent", "gap 1 recency class");
  approx(reviews[1].weight, 1.5, "gap 3 prices cold (memory gap, not screen)");
  assert(reviews[1].recency === "cold", "gap 3 recency class");
  approx(reviews[2].weight, 0.5, "cold credit inside 28d downgrades to recent");
  assert(reviews[2].capApplied === "cold_cap_downgraded", "cold cap marker");
  approx(reviews[3].weight, 1.5, "cold credit reopens at 28d");
  const lesson = pricing.entries.find((entry) => entry.kind === "lesson_production");
  approx(lesson!.weight, 0.75, "lesson production prices controlled 0.75");
  assert(lesson!.isProduction === false, "controlled is never an unprompted production");
}

// --- 3. session + interval-window caps ---------------------------------------

{
  const events: OutcomeEventFact[] = [
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: "2026-01-10", intervalIndex: 2, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
    // duplicate credit attempt in the same window on a later day
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "retest_pass", occurredOn: "2026-01-11", intervalIndex: 2, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
    // different bundle, same day as first: session cap
    outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b2", eventType: "review_pass", occurredOn: "2026-01-10", intervalIndex: 0, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }),
  ];
  const pricing = priceWordEvidence(policy, emptyFacts({ outcomeEvents: events }));
  // chronological: b1 pass (01-10), b2 same-day pass (01-10), retest (01-11)
  const [first, sessionDup, windowDup] = pricing.entries.filter((entry) => entry.kind === "review_production");
  assert(first.weight > 0, "first credit prices");
  assert(windowDup.capApplied === "interval_window_cap" && windowDup.weight === 0, "one review credit per interval window");
  assert(sessionDup.capApplied === "session_cap" && sessionDup.weight === 0, "same-session successes do not stack");
}

// --- 4. clean ladder property (amendment item 7) ------------------------------

function runCleanLadder(taughtOn: string): { facts: WordPricingFacts; events: OutcomeEventFact[] } {
  let { bundle, words } = createReviewBundle(reviewPolicy, {
    bundleId: "ladder-b", childId: CHILD, sourceRef: "lesson-ladder", taughtOn,
    words: [{ canonicalWordId: WORD }],
  });
  const all: OutcomeEventFact[] = [];
  while (bundle.bundleStatus === "active") {
    // always-true provider so the final pass retires cleanly (the 112-day
    // conditionality is Slice 2's regression territory; here we need the
    // retired exit to assert retirement-never-masters).
    const resolution = resolveBundleReview(
      reviewPolicy, bundle, words,
      words.filter((w) => w.membershipStatus === "scheduled").map((w) => ({ canonicalWordId: w.canonicalWordId, passed: true })),
      bundle.nextDueOn,
      { hasAuthenticUseSince: () => true },
    );
    bundle = resolution.bundle;
    words = resolution.words;
    all.push(...resolution.events.map((event) => outcome(event)));
  }
  return {
    facts: emptyFacts({ taughtHistory: [taught(taughtOn, NORMALISED)], outcomeEvents: all }),
    events: all,
  };
}

{
  const { facts } = runCleanLadder("2026-01-01");
  const pricing = priceWordEvidence(policy, facts);
  approx(pricing.score, 6.75, "clean ladder prices to exactly 6.75 under v1 (queue_sim_v2 credit() parity)");
  assert(pricing.score < policy.masteredEdge.minScore, "protected property: clean ladder < mastery score");
  const state = computeWordEvidenceState(policy, pricing, facts);
  assert(state.state === "review_retired", "clean final pass without authentic use retires, never masters");
  assert(pricing.productions.length === 6, "six review productions on the clean ladder");
}

// --- 5. homophone family validity ---------------------------------------------

{
  const facts = emptyFacts({
    skillFamilyKey: policy.homophoneFamilyKey,
    taughtHistory: [taught("2026-01-01", NORMALISED), taught("2026-01-20", NORMALISED, "probed")],
    outcomeEvents: [outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: "2026-01-05", intervalIndex: 0, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion })],
  });
  const pricing = priceWordEvidence(policy, facts);
  const lesson = pricing.entries.find((entry) => entry.kind === "lesson_production");
  const probe = pricing.entries.find((entry) => entry.kind === "probe_production");
  const review = pricing.entries.find((entry) => entry.kind === "review_production");
  assert(lesson!.weight === 0 && lesson!.capApplied === "homophone_dictation_invalid", "homophone lesson dictation carries no evidence");
  assert(probe!.weight === 0 && probe!.capApplied === "homophone_dictation_invalid", "homophone probe dictation carries no evidence");
  assert(review!.weight > 0, "homophone review production prices (composer sentence-context guarantee)");
}

// --- 6. correctness-derivation pin ---------------------------------------------

{
  const pricing = priceWordEvidence(policy, emptyFacts({
    taughtHistory: [taught("2026-01-01", "becuase"), taught("2026-01-02", null), taught("2026-01-03", "Because!")],
  }));
  const [wrong, missing, right] = pricing.entries;
  assert(wrong.weight === 0, "mismatched attempt earns nothing");
  assert(missing.weight === 0, "null attempt earns nothing (fail closed)");
  approx(right.weight, 0.75, "normalised match earns controlled credit");
}

// --- 7. state edges ---------------------------------------------------------------

{
  const unseen = computeWordEvidenceState(policy, priceWordEvidence(policy, emptyFacts()), { outcomeEvents: [], taughtHistory: [], slippageEvents: [] });
  assert(unseen.state === "unseen", "no facts -> unseen");

  const activeFacts = emptyFacts({ taughtHistory: [taught("2026-01-01", "becuase")] });
  const active = computeWordEvidenceState(policy, priceWordEvidence(policy, activeFacts), { outcomeEvents: [], taughtHistory: activeFacts.taughtHistory, slippageEvents: [] });
  assert(active.state === "active", "any encounter -> active");

  const producedFacts = emptyFacts({ taughtHistory: [taught("2026-01-01", NORMALISED, "probed")] });
  const produced = computeWordEvidenceState(policy, priceWordEvidence(policy, producedFacts), { outcomeEvents: [], taughtHistory: producedFacts.taughtHistory, slippageEvents: [] });
  assert(produced.state === "produced", "one cold correct probe -> produced");

  const controlledOnly = emptyFacts({ taughtHistory: [taught("2026-01-01", NORMALISED)] });
  const controlled = computeWordEvidenceState(policy, priceWordEvidence(policy, controlledOnly), { outcomeEvents: [], taughtHistory: controlledOnly.taughtHistory, slippageEvents: [] });
  assert(controlled.state === "active", "controlled lesson spelling alone never reaches produced");

  // secure: 3 productions / 2 windows / >= 7-day span
  const mk = (day: string, idx: number, bundle = "b1") => outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: bundle, eventType: "review_pass", occurredOn: day, intervalIndex: idx, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion });
  const secureFacts = emptyFacts({ taughtHistory: [taught("2026-01-01", NORMALISED, "probed")], outcomeEvents: [mk("2026-01-05", 0), mk("2026-01-12", 1)] });
  const secure = computeWordEvidenceState(policy, priceWordEvidence(policy, secureFacts), { outcomeEvents: secureFacts.outcomeEvents, taughtHistory: secureFacts.taughtHistory, slippageEvents: [] });
  assert(secure.state === "secure", "3 productions / 2 windows / 11-day span -> secure");

  const oneWindow = emptyFacts({ taughtHistory: [taught("2026-01-01", NORMALISED, "probed"), taught("2026-01-12", NORMALISED, "probed")], outcomeEvents: [mk("2026-01-05", 0)] });
  const oneWindowState = computeWordEvidenceState(policy, priceWordEvidence(policy, oneWindow), { outcomeEvents: oneWindow.outcomeEvents, taughtHistory: oneWindow.taughtHistory, slippageEvents: [] });
  assert(oneWindowState.state === "produced", "3 productions in 1 interval window stay produced");

  const shortSpan = emptyFacts({ taughtHistory: [taught("2026-01-01", NORMALISED, "probed")], outcomeEvents: [mk("2026-01-04", 0), mk("2026-01-06", 1)] });
  const shortSpanState = computeWordEvidenceState(policy, priceWordEvidence(policy, shortSpan), { outcomeEvents: shortSpan.outcomeEvents, taughtHistory: shortSpan.taughtHistory, slippageEvents: [] });
  assert(shortSpanState.state === "produced", "5-day span fails the 7-day secure edge");
}

// --- 8. mastered edge --------------------------------------------------------------

{
  const { facts } = runCleanLadder("2026-01-01");
  const ladderState = computeWordEvidenceState(policy, priceWordEvidence(policy, facts), facts);
  assert(ladderState.state === "review_retired", "ladder alone: no mastery (score + parent gate both unmet)");

  const unverified = emptyFacts({ ...facts, authenticUseEvents: [authenticUse("2026-05-10", "piece-1", false)] });
  const unverifiedState = computeWordEvidenceState(policy, priceWordEvidence(policy, unverified), unverified);
  assert(unverifiedState.state === "review_retired", "score >= 8 with only unverified authentic use never masters (parent gate)");

  const verified = emptyFacts({ ...facts, authenticUseEvents: [authenticUse("2026-05-10", "piece-1", true)] });
  const verifiedPricing = priceWordEvidence(policy, verified);
  assert(verifiedPricing.score >= policy.masteredEdge.minScore, "verified authentic use crosses the score bar");
  const verifiedState = computeWordEvidenceState(policy, verifiedPricing, verified);
  assert(verifiedState.state === "mastered", "full gate met -> mastered");

  // pure-authentic path: span/day edges bite individually
  const pieces = (days: string[]) => days.map((day, i) => authenticUse(day, `p${i}`, true));
  const shortSpanMastery = emptyFacts({ authenticUseEvents: pieces(["2026-01-01", "2026-01-05", "2026-01-09", "2026-01-13", "2026-01-17"]) });
  const shortSpanMasteryState = computeWordEvidenceState(policy, priceWordEvidence(policy, shortSpanMastery), shortSpanMastery);
  assert(shortSpanMasteryState.state !== "mastered", "16-day span fails the 21-day mastered edge");
  const fewDays = emptyFacts({ authenticUseEvents: [...pieces(["2026-01-01", "2026-01-10", "2026-01-25"]), authenticUse("2026-01-25", "p9", true), authenticUse("2026-01-10", "p8", true)] });
  const fewDaysState = computeWordEvidenceState(policy, priceWordEvidence(policy, fewDays), fewDays);
  assert(fewDaysState.state !== "mastered", "5 productions on 3 distinct days fail the 4-day mastered edge");
  const fullAuthentic = emptyFacts({ authenticUseEvents: pieces(["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-19", "2026-01-22"]) });
  const fullAuthenticState = computeWordEvidenceState(policy, priceWordEvidence(policy, fullAuthentic), fullAuthentic);
  assert(fullAuthenticState.state === "mastered", "5 verified authentic productions / 5 days / 21-day span -> mastered");
}

// --- 9. deductions + slip lifecycle ---------------------------------------------

{
  const slip = (occurredOn: string, ordinal: number, selfCorrected = false): SlippageEventFact => ({
    childId: CHILD, canonicalWordId: WORD, occurredOn, contextKind: "authentic_writing",
    selfCorrected, attemptText: "becuase", sourceRef: `slip:${occurredOn}`, slipOrdinal: ordinal, rowStatus: "active",
  });
  const mk = (day: string, idx: number) => outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: day, intervalIndex: idx, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion });
  const base = { taughtHistory: [taught("2026-01-01", NORMALISED, "probed")], outcomeEvents: [mk("2026-01-05", 0), mk("2026-01-12", 1)] };

  const slipped = emptyFacts({ ...base, slippageEvents: [slip("2026-02-01", 1)] });
  const slippedPricing = priceWordEvidence(policy, slipped);
  const deduction = slippedPricing.entries.find((entry) => entry.kind === "slippage_deduction");
  approx(deduction!.weight, -1.0, "authentic slip deducts -1.0");
  const slippedState = computeWordEvidenceState(policy, slippedPricing, slipped);
  assert(slippedState.slipped === true, "unresolved slip on a secure word sets the flag");
  assert(slippedState.state === "produced", "secure edge fails while a slip is unresolved (plan pin)");

  const selfCorrected = emptyFacts({ ...base, slippageEvents: [slip("2026-02-01", 1, true)] });
  const selfCorrectedPricing = priceWordEvidence(policy, selfCorrected);
  const noDeduction = selfCorrectedPricing.entries.find((entry) => entry.kind === "slippage_deduction");
  assert(noDeduction!.weight === 0 && noDeduction!.capApplied === "self_corrected_no_deduction", "self-corrected slip deducts nothing");
  const selfCorrectedState = computeWordEvidenceState(policy, selfCorrectedPricing, selfCorrected);
  assert(selfCorrectedState.state === "secure" && selfCorrectedState.slipped === false, "self-corrected slip neither flags nor demotes");

  const resolved = emptyFacts({ ...base, outcomeEvents: [...base.outcomeEvents, mk("2026-02-10", 2)], slippageEvents: [slip("2026-02-01", 1)] });
  const resolvedState = computeWordEvidenceState(policy, priceWordEvidence(policy, resolved), resolved);
  assert(resolvedState.state === "secure" && resolvedState.slipped === false, "a later correct production resolves the slip");

  // scheduled review failures price zero — no negative path in the pricer
  const failed = emptyFacts({ outcomeEvents: [outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_fail", occurredOn: "2026-01-05", intervalIndex: 0, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion }, "becuase")] });
  const failedPricing = priceWordEvidence(policy, failed);
  assert(failedPricing.score === 0 && failedPricing.entries.length === 0, "§3.1 boundary: scheduled review failures never deduct here");
}

// --- 10. slippage detection: eligibility as of the slip date -----------------------

{
  const wordIdByNormalised = new Map([[NORMALISED, WORD]]);
  const candidate = (occurredOn: string, selfCorrected = false): WritingSlipCandidate => ({
    childId: CHILD, observedText: "becuase", targetNormalised: NORMALISED, occurredOn, selfCorrected, sourceRef: `wi:${occurredOn}`,
  });
  const mk = (day: string, idx: number) => outcome({ childId: CHILD, canonicalWordId: WORD, bundleId: "b1", eventType: "review_pass", occurredOn: day, intervalIndex: idx, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion });
  const secureFacts = emptyFacts({ taughtHistory: [taught("2026-01-01", NORMALISED, "probed")], outcomeEvents: [mk("2026-01-05", 0), mk("2026-01-12", 1)] });

  const detection = detectWritingSlips(policy, [candidate("2026-02-01")], wordIdByNormalised, new Map([[WORD, secureFacts]]));
  assert(detection.slips.length === 1 && detection.slips[0].slipOrdinal === 1, "slip on a secure word detected with ordinal 1");

  const early = detectWritingSlips(policy, [candidate("2026-01-06")], wordIdByNormalised, new Map([[WORD, secureFacts]]));
  assert(early.slips.length === 0 && early.notSlipEligible.length === 1, "the same word was not yet secure on 2026-01-06: not a slip (as-of-date eligibility)");

  const unmatchedDetection = detectWritingSlips(policy, [{ ...candidate("2026-02-01"), targetNormalised: "notaword" }], wordIdByNormalised, new Map([[WORD, secureFacts]]));
  assert(unmatchedDetection.unmatched.length === 1 && unmatchedDetection.slips.length === 0, "no canonical match: surfaced, never guessed");

  const withPrior = emptyFacts({ ...secureFacts, slippageEvents: [
    { childId: CHILD, canonicalWordId: WORD, occurredOn: "2026-02-01", contextKind: "authentic_writing", selfCorrected: false, attemptText: "becuase", sourceRef: "slip:1", slipOrdinal: 1, rowStatus: "active" },
    { childId: CHILD, canonicalWordId: WORD, occurredOn: "2026-02-05", contextKind: "authentic_writing", selfCorrected: false, attemptText: "becuase", sourceRef: "slip:2", slipOrdinal: 2, rowStatus: "active" },
  ] });
  // Slip-agnostic eligibility: with two unresolved slips the secure edge
  // fails (state produced) but the slipped flag keeps the word
  // slip-eligible, so the third misspelling is detected with ordinal 3 —
  // the blueprint's third-slip lesson re-entry can trigger.
  const stateNow = wordStateAsOf(policy, withPrior, "2026-02-10");
  assert(!isSlipEligibleState(stateNow.state) && stateNow.state === "produced", "two unresolved slips drop the secure edge");
  assert(stateNow.slipped === true, "slip-agnostic flag keeps the word slip-eligible");
  const thirdDetection = detectWritingSlips(policy, [candidate("2026-02-10")], wordIdByNormalised, new Map([[WORD, withPrior]]));
  assert(thirdDetection.slips.length === 1 && thirdDetection.slips[0].slipOrdinal === 3, "third misspelling detects as slip ordinal 3 (over the limit)");
}

// --- 11. slip response: re-entry and lesson re-entry --------------------------------

{
  const slipFact = (ordinal: number, selfCorrected = false): SlippageEventFact => ({
    childId: CHILD, canonicalWordId: WORD, occurredOn: "2026-03-01", contextKind: "authentic_writing",
    selfCorrected, attemptText: "becuase", sourceRef: "wi:slip", slipOrdinal: ordinal, rowStatus: "active",
  });
  const retiredWord: ScheduleWordFact = {
    childId: CHILD, canonicalWordId: WORD, bundleId: "ladder-b", membershipStatus: "retired",
    catchUpStage: 0, nextRetestDueOn: null, failedReviewOn: null, preRetirementCheckDueOn: null,
    last28DayReviewOn: null, reteachCycleCount: 0, taughtOn: "2026-01-01", rowStatus: "active",
  };

  const reentry = respondToSlip(reviewPolicy, policy, { slip: slipFact(1), microSkillKey: "D4_PAT_X", activeScheduleWord: retiredWord, taughtOn: "2026-01-01", reentryBundleId: "reentry-1" });
  assert(reentry.reentryBundle !== null, "slip 1 on a retired word re-enters review");
  assert(reentry.reentryBundle!.intervalIndex === reviewPolicy.intervalLadderDays.indexOf(policy.slippageReentryGapDays), "re-entry at the 7-day ladder position");
  assert(reentry.reentryBundle!.nextDueOn === addDays("2026-03-01", 7), "re-entry check due slip date + 7");
  assert(reentry.reentryWord!.membershipStatus === "scheduled", "re-entry word is scheduled");
  assert(reentry.learningItemIntake === null, "slips 1-2 never reach the lesson");

  const stillScheduled = respondToSlip(reviewPolicy, policy, { slip: slipFact(1), microSkillKey: "D4_PAT_X", activeScheduleWord: { ...retiredWord, membershipStatus: "scheduled" }, taughtOn: "2026-01-01", reentryBundleId: "reentry-2" });
  assert(stillScheduled.reentryBundle === null && stillScheduled.learningItemIntake === null, "a word already in review is never rescheduled by a slip");

  const selfCorrectedResponse = respondToSlip(reviewPolicy, policy, { slip: slipFact(1, true), microSkillKey: "D4_PAT_X", activeScheduleWord: retiredWord, taughtOn: "2026-01-01", reentryBundleId: "reentry-3" });
  assert(selfCorrectedResponse.reentryBundle !== null, "self-corrected slip of a retired word still gets the interval check");

  const third = respondToSlip(reviewPolicy, policy, { slip: slipFact(3), microSkillKey: "D4_PAT_X", activeScheduleWord: retiredWord, taughtOn: "2026-01-01", reentryBundleId: "reentry-4" });
  assert(third.reentryBundle === null && third.learningItemIntake !== null, "the third slip rejoins the lesson, not review");
  assert(third.learningItemIntake!.sourceKind === "slippage_reentry" && third.learningItemIntake!.reteachPriority === true && third.learningItemIntake!.itemStatus === "pending_reteach", "slippage_reentry intake shape");
  assert(third.learningItemIntake!.ejectedOn === "2026-03-01", "reteach ordering anchor carries the slip date");

  const unmapped = respondToSlip(reviewPolicy, policy, { slip: slipFact(3), microSkillKey: null, activeScheduleWord: retiredWord, taughtOn: "2026-01-01", reentryBundleId: "reentry-5" });
  assert(unmapped.unmappedReentry === true && unmapped.learningItemIntake === null, "unknown skill on a third slip is surfaced, never guessed");
}

// --- 12. real AuthenticUseProvider behind the retirement decision -------------------

{
  const provider = authenticUseProviderFromFacts([
    authenticUse("2026-03-01", "piece-a", true),
    authenticUse("2026-04-01", "piece-b", false),
  ]);
  assert(provider.hasAuthenticUseSince(CHILD, WORD, "2026-03-01") === true, "boundary date inclusive");
  assert(provider.hasAuthenticUseSince(CHILD, WORD, "2026-03-02") === false, "unverified events never count");
  assert(provider.hasAuthenticUseSince(CHILD, "w-other", "2026-01-01") === false, "word-scoped");

  // Slice 2 retirement decision changes only via the fed-in facts.
  let { bundle, words } = createReviewBundle(reviewPolicy, { bundleId: "prov-b", childId: CHILD, sourceRef: "lesson-p", taughtOn: "2026-01-01", words: [{ canonicalWordId: WORD }] });
  while (bundle.intervalIndex < reviewPolicy.intervalLadderDays.length - 1) {
    const r = resolveBundleReview(reviewPolicy, bundle, words, [{ canonicalWordId: WORD, passed: true }], bundle.nextDueOn);
    bundle = r.bundle; words = r.words;
  }
  const use = authenticUse(addDays(bundle.nextDueOn, -1), "piece-c", true);
  const finalWith = resolveBundleReview(reviewPolicy, bundle, words, [{ canonicalWordId: WORD, passed: true }], bundle.nextDueOn, authenticUseProviderFromFacts([use]));
  assert(finalWith.words[0].membershipStatus === "retired", "authentic use since the 28-day review: retire immediately");
  const finalWithout = resolveBundleReview(reviewPolicy, bundle, words, [{ canonicalWordId: WORD, passed: true }], bundle.nextDueOn, authenticUseProviderFromFacts([]));
  assert(finalWithout.words[0].membershipStatus === "awaiting_pre_retirement_check", "no facts: fail closed into the 112-day check");
}

// --- 13. authentic-use review credit (amendment item 3) ------------------------------

{
  const { bundle, words } = createReviewBundle(reviewPolicy, { bundleId: "credit-b", childId: CHILD, sourceRef: "lesson-c", taughtOn: "2026-06-01", words: [{ canonicalWordId: WORD }] });
  // advance to the 7-day interval: pass day-1 and day-3 reviews
  let b = bundle; let w = words;
  for (let i = 0; i < 2; i++) {
    const r = resolveBundleReview(reviewPolicy, b, w, [{ canonicalWordId: WORD, passed: true }], b.nextDueOn);
    b = r.bundle; w = r.words;
  }
  const today = b.nextDueOn; // the 7-day review is due today
  const queue = dueReviewWords([b], w, today);
  assert(queue.length === 1 && queue[0].kind === "bundle_review", "fixture: one due bundle review");
  const windowStart = intervalWindowStart(reviewPolicy, queue[0], new Map([[b.bundleId, b]]), new Map([[WORD, w[0]]]));
  assert(windowStart === addDays(today, -7), "window start is the previous review's completion date");

  const inWindow = authenticUse(addDays(today, -2), "piece-w", true);
  const credited = applyAuthenticUseCredit(reviewPolicy, { queue, bundles: [b], scheduleWords: w, authenticUseEvents: [inWindow], consumedPieceRefs: new Set(), today });
  assert(credited.credits.length === 1 && credited.remaining.length === 0, "in-window verified use credits the due review");
  assert(credited.credits[0].creditedPieceRef === "piece-w", "credit names the consumed piece");

  const beforeWindow = authenticUse(addDays(today, -10), "piece-x", true);
  const stale = applyAuthenticUseCredit(reviewPolicy, { queue, bundles: [b], scheduleWords: w, authenticUseEvents: [beforeWindow], consumedPieceRefs: new Set(), today });
  assert(stale.credits.length === 0 && stale.remaining.length === 1, "a use before the window start never credits");

  const consumed = applyAuthenticUseCredit(reviewPolicy, { queue, bundles: [b], scheduleWords: w, authenticUseEvents: [inWindow], consumedPieceRefs: new Set(["piece-w"]), today });
  assert(consumed.credits.length === 0, "a consumed event never credits twice (once per interval window)");

  const unverifiedUse = authenticUse(addDays(today, -2), "piece-y", false);
  const unverifiedCredit = applyAuthenticUseCredit(reviewPolicy, { queue, bundles: [b], scheduleWords: w, authenticUseEvents: [unverifiedUse], consumedPieceRefs: new Set(), today });
  assert(unverifiedCredit.credits.length === 0, "only parent-verified uses credit");

  // credited outcome feeds the unchanged Slice 2 transition as a pass
  const resolved = resolveBundleReview(reviewPolicy, b, w, [{ canonicalWordId: WORD, passed: true }], today);
  assert(resolved.bundle.intervalIndex === b.intervalIndex + 1, "credited pass advances the bundle forward only");
}

// --- 14. fail-closed bridge + corpus preview scan -----------------------------------

{
  const wordIdByNormalised = new Map([[NORMALISED, WORD]]);
  const candidates: AuthenticUseCandidate[] = [
    { childId: CHILD, observedWord: "Because,", occurredOn: "2026-06-01", pieceRef: "piece-1", sourceRef: "ws:1", useKind: "authentic_correct_use", pieceParentReviewed: true },
    { childId: CHILD, observedWord: "because", occurredOn: "2026-06-01", pieceRef: "piece-1", sourceRef: "ws:1", useKind: "authentic_correct_use", pieceParentReviewed: true },
    { childId: CHILD, observedWord: "because", occurredOn: "2026-06-02", pieceRef: "piece-2", sourceRef: "ws:2", useKind: "authentic_correct_use", pieceParentReviewed: false },
    { childId: CHILD, observedWord: "xyzzy", occurredOn: "2026-06-03", pieceRef: "piece-3", sourceRef: "ws:3", useKind: "authentic_correct_use", pieceParentReviewed: true },
  ];
  const bridge = authenticUseBridge(candidates, wordIdByNormalised, "2026-07-05T00:00:00Z");
  assert(bridge.events.length === 1, "reviewed-piece match becomes an event; per-piece duplicate deduped");
  assert(bridge.events[0].canonicalWordId === WORD && bridge.events[0].parentVerified === true, "bridged event shape");
  assert(bridge.previewCandidates.length === 1 && bridge.previewCandidates[0].requiresOwnerConfirmation === true, "unreviewed piece is report-only until owner confirmation");
  assert(bridge.unmatched.length === 1 && bridge.unmatched[0].observedWord === "xyzzy", "no canonical match: surfaced, never guessed");
}

// --- 15. determinism ------------------------------------------------------------------

{
  const { facts } = runCleanLadder("2026-01-01");
  const withExtras = emptyFacts({ ...facts, authenticUseEvents: [authenticUse("2026-05-10", "piece-1", true)], slippageEvents: [{ childId: CHILD, canonicalWordId: WORD, occurredOn: "2026-06-01", contextKind: "dictation_cold", selfCorrected: false, attemptText: "becuase", sourceRef: "probe:x", slipOrdinal: 1, rowStatus: "active" }] });
  const run = () => {
    const pricing = priceWordEvidence(policy, withExtras);
    const state = computeWordEvidenceState(policy, pricing, withExtras);
    return JSON.stringify({ pricing, state });
  };
  assert(run() === run(), "identical facts -> byte-identical pricing and state");
  const cold = priceWordEvidence(policy, withExtras).entries.find((entry) => entry.kind === "slippage_deduction");
  approx(cold!.weight, -0.75, "cold-dictation slip deducts -0.75");
}

// --- misc: diffDays sanity ------------------------------------------------------------

assert(diffDays("2026-01-01", "2026-01-29") === 28, "diffDays");

console.log("adle-evidence-regression: all checks passed");
