import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { reviewWritingChallengeDevSnapshot } from "../lib/adle/review-v3/dev-snapshot";
import { validateReviewGraphemeSpan } from "../lib/adle/review-v3/graphemes";
import type { ReviewWritingEvaluation } from "../lib/adle/review-v3/r3-evaluation";
import {
  createReviewR3StoredState,
  reviewR3SessionView,
  submitReviewR3AudioCheck,
  submitReviewR3Writing,
} from "../lib/adle/review-v3/r3-state";
import {
  beginReviewRepair,
  createReviewR4StoredState,
  moveReviewRepairToCover,
  moveReviewRepairToTrickyPart,
  moveReviewRepairToTryAgain,
  reviewR4SessionView,
  saveReviewRepairMemoryCue,
  saveReviewRepairTrickySpan,
  submitReviewRepairRetry,
  type ReviewR4StoredState,
} from "../lib/adle/review-v3/r4-state";

const snapshot = reviewWritingChallengeDevSnapshot();

function evaluations(dispositions: Array<ReviewWritingEvaluation["disposition"]>): ReviewWritingEvaluation[] {
  return snapshot.targets.map((target, index) => ({
    encounterId: target.encounterId,
    targetOrder: target.order,
    disposition: dispositions[index] ?? "unaccounted_for",
    observedText: dispositions[index] === "attributable_misspelling" ? "neccesary" : null,
    attributionAlgorithmVersion: "r4-fixture-v1",
    attributionProvenance: dispositions[index] === "attributable_misspelling"
      ? { observedText: "neccesary" }
      : {},
  }));
}

function writingFailureSession(failedIndexes = [0]) {
  const dispositions = snapshot.targets.map((_, index) =>
    failedIndexes.includes(index) ? "attributable_misspelling" as const : "correct_in_writing" as const,
  );
  const transition = submitReviewR3Writing({
    snapshot,
    state: createReviewR3StoredState(snapshot),
    submission: { finalWriting: "neccesary Wednesday business", idempotencyKey: "r4-writing" },
    evaluations: evaluations(dispositions),
  });
  assert.equal(transition.result.ok, true);
  return { state: transition.state, view: reviewR3SessionView(snapshot, transition.state) };
}

function beginAndSelect(input: {
  reviewSession: ReturnType<typeof writingFailureSession>["view"];
  state?: ReviewR4StoredState;
  encounterId?: string;
  start?: number;
  end?: number;
}) {
  const encounterId = input.encounterId ?? "dev-encounter-1";
  let state = input.state ?? createReviewR4StoredState();
  let transition = beginReviewRepair({
    snapshot, reviewSession: input.reviewSession, state,
    submission: { encounterId, idempotencyKey: `begin:${encounterId}` },
    now: "2026-08-25T10:00:00.000Z",
  });
  assert.equal(transition.result.ok, true);
  state = transition.state;
  const compare = reviewR4SessionView({ snapshot, reviewSession: input.reviewSession, state }).activeRepair;
  assert.equal(compare?.stage, "compare");
  assert.equal(compare?.attemptedForm, "neccesary");
  assert.equal(compare?.correctSpellingReveal, "necessary");
  transition = moveReviewRepairToTrickyPart({
    snapshot, reviewSession: input.reviewSession, state,
    submission: { encounterId, idempotencyKey: `tricky:${encounterId}` },
  });
  assert.equal(transition.result.ok, true);
  state = transition.state;
  const start = input.start ?? 2;
  const end = input.end ?? 3;
  const selectedText = snapshot.targets.find((target) => target.encounterId === encounterId)!
    .canonicalSpelling.slice(start, end);
  transition = saveReviewRepairTrickySpan({
    snapshot, reviewSession: input.reviewSession, state,
    submission: {
      encounterId, graphemeStart: start, graphemeEnd: end, selectedText,
      idempotencyKey: `span:${encounterId}`,
    },
  });
  assert.equal(transition.result.ok, true);
  return transition.state;
}

const unicodeSpelling = `caf${"e\u0301"}`;
assert.deepEqual(validateReviewGraphemeSpan(unicodeSpelling, 3, 4), {
  graphemeStart: 3,
  graphemeEnd: 4,
  selectedText: "é",
});
assert.equal(validateReviewGraphemeSpan(unicodeSpelling, 4, 5), null);
assert.equal(validateReviewGraphemeSpan(unicodeSpelling, 3, 4, "e"), null);

const writingFailure = writingFailureSession();
const originalFailure = structuredClone(writingFailure.view.encounters[0]);
let r4State = beginAndSelect({ reviewSession: writingFailure.view });
const invalidSpan = saveReviewRepairTrickySpan({
  snapshot,
  reviewSession: writingFailure.view,
  state: moveReviewRepairToTrickyPart({
    snapshot,
    reviewSession: writingFailure.view,
    state: beginReviewRepair({
      snapshot,
      reviewSession: writingFailure.view,
      state: createReviewR4StoredState(),
      submission: { encounterId: "dev-encounter-1", idempotencyKey: "invalid-begin" },
    }).state,
    submission: { encounterId: "dev-encounter-1", idempotencyKey: "invalid-tricky" },
  }).state,
  submission: {
    encounterId: "dev-encounter-1", graphemeStart: 99, graphemeEnd: 100,
    selectedText: "x", idempotencyKey: "invalid-span",
  },
});
assert.deepEqual(invalidSpan.result, { ok: false, code: "invalid_grapheme_span" });

const cueTransition = saveReviewRepairMemoryCue({
  snapshot, reviewSession: writingFailure.view, state: r4State,
  submission: {
    encounterId: "dev-encounter-1",
    cueText: "One c, then two sleeves for the two s letters.",
    idempotencyKey: "cue-one",
  },
  now: "2026-08-25T10:01:00.000Z",
});
assert.equal(cueTransition.result.ok, true);
r4State = cueTransition.state;
assert.equal(r4State.cueVersions.length, 1);
assert.equal(r4State.cueVersions[0].childId, "dev-child");
assert.equal(r4State.cueVersions[0].canonicalWordId, "dev-word-1");
let view = reviewR4SessionView({ snapshot, reviewSession: writingFailure.view, state: r4State });
assert.equal(view.activeRepair?.stage, "look");
assert.equal(view.activeRepair?.correctSpellingReveal, "necessary");
assert.equal(view.activeRepair?.cueVersionUsed?.cueText,
  "One c, then two sleeves for the two s letters.");

let transition = moveReviewRepairToCover({
  snapshot, reviewSession: writingFailure.view, state: r4State,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "cover-one" },
});
assert.equal(transition.result.ok, true);
r4State = transition.state;
view = reviewR4SessionView({ snapshot, reviewSession: writingFailure.view, state: r4State });
assert.equal(view.activeRepair?.stage, "cover");
assert.equal(view.activeRepair?.correctSpellingReveal, null);
assert.equal(view.activeRepair?.trickyTextReveal, null);
assert.match(view.activeRepair?.cueVersionUsed?.cueText ?? "", /two sleeves/);
transition = moveReviewRepairToTryAgain({
  snapshot, reviewSession: writingFailure.view, state: r4State,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "try-one" },
});
r4State = transition.state;
const correctRetry = submitReviewRepairRetry({
  snapshot, reviewSession: writingFailure.view, state: r4State,
  submission: { encounterId: "dev-encounter-1", response: "necessary", idempotencyKey: "retry-correct" },
  now: "2026-08-25T10:02:00.000Z",
});
assert.equal(correctRetry.result.ok, true);
assert.equal(correctRetry.state.repairs[0].terminalOutcome, "repair_completed");
assert.equal(correctRetry.state.repairs[0].attempts[0].correct, true);
assert.deepEqual(writingFailure.view.encounters[0], originalFailure,
  "successful repair must not mutate the original scheduled failure");

function readyToRetry() {
  const failure = writingFailureSession();
  let state = beginAndSelect({ reviewSession: failure.view });
  state = saveReviewRepairMemoryCue({
    snapshot, reviewSession: failure.view, state,
    submission: { encounterId: "dev-encounter-1", cueText: "My cue", idempotencyKey: "cue" },
  }).state;
  state = moveReviewRepairToCover({
    snapshot, reviewSession: failure.view, state,
    submission: { encounterId: "dev-encounter-1", idempotencyKey: "cover" },
  }).state;
  state = moveReviewRepairToTryAgain({
    snapshot, reviewSession: failure.view, state,
    submission: { encounterId: "dev-encounter-1", idempotencyKey: "try" },
  }).state;
  return { failure, state };
}

let twoAttempt = readyToRetry();
let firstWrong = submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: twoAttempt.state,
  submission: { encounterId: "dev-encounter-1", response: "wrong", idempotencyKey: "first-wrong" },
});
assert.equal(firstWrong.state.repairs[0].stage, "look");
let secondCycle = moveReviewRepairToCover({
  snapshot, reviewSession: twoAttempt.failure.view, state: firstWrong.state,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "cover-two" },
}).state;
secondCycle = moveReviewRepairToTryAgain({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondCycle,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "try-two" },
}).state;
const secondCorrect = submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondCycle,
  submission: { encounterId: "dev-encounter-1", response: "necessary", idempotencyKey: "second-correct" },
});
assert.equal(secondCorrect.state.repairs[0].terminalOutcome, "repair_completed");
assert.equal(secondCorrect.state.repairs[0].attempts.length, 2);

twoAttempt = readyToRetry();
firstWrong = submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: twoAttempt.state,
  submission: { encounterId: "dev-encounter-1", response: "wrong", idempotencyKey: "wrong-one" },
});
secondCycle = moveReviewRepairToCover({
  snapshot, reviewSession: twoAttempt.failure.view, state: firstWrong.state,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "wrong-cover-two" },
}).state;
secondCycle = moveReviewRepairToTryAgain({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondCycle,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "wrong-try-two" },
}).state;
const secondWrong = submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondCycle,
  submission: { encounterId: "dev-encounter-1", response: "still wrong", idempotencyKey: "wrong-two" },
});
assert.equal(secondWrong.state.repairs[0].terminalOutcome, "repair_attempted_not_secured");
assert.deepEqual(submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondWrong.state,
  submission: { encounterId: "dev-encounter-1", response: "necessary", idempotencyKey: "forbidden-third" },
}).result, { ok: false, code: "repair_retry_not_eligible" });
const replay = submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondWrong.state,
  submission: { encounterId: "dev-encounter-1", response: "still wrong", idempotencyKey: "wrong-two" },
});
assert.equal(replay.result.ok && replay.result.replayed, true);
assert.deepEqual(submitReviewRepairRetry({
  snapshot, reviewSession: twoAttempt.failure.view, state: secondWrong.state,
  submission: { encounterId: "dev-encounter-1", response: "different", idempotencyKey: "wrong-two" },
}).result, { ok: false, code: "repair_transition_conflict" });

const unresolved = submitReviewR3Writing({
  snapshot,
  state: createReviewR3StoredState(snapshot),
  submission: { finalWriting: "none", idempotencyKey: "audio-writing" },
  evaluations: evaluations(["unaccounted_for", "correct_in_writing", "correct_in_writing"]),
});
const audioFailed = submitReviewR3AudioCheck({
  snapshot, state: unresolved.state,
  submission: { encounterId: "dev-encounter-1", response: "wrong", idempotencyKey: "audio-fail" },
});
const audioView = reviewR3SessionView(snapshot, audioFailed.state);
const audioBegin = beginReviewRepair({
  snapshot, reviewSession: audioView, state: createReviewR4StoredState(),
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "audio-begin" },
});
assert.equal(audioBegin.result.ok, true);
assert.equal(reviewR4SessionView({ snapshot, reviewSession: audioView, state: audioBegin.state })
  .activeRepair?.attemptedForm, "wrong");

const multiple = writingFailureSession([0, 1]);
let multipleState = createReviewR4StoredState();
assert.equal(reviewR4SessionView({ snapshot, reviewSession: multiple.view, state: multipleState })
  .nextRepairEncounterId, "dev-encounter-1");
multipleState = beginReviewRepair({
  snapshot, reviewSession: multiple.view, state: multipleState,
  submission: { encounterId: "dev-encounter-1", idempotencyKey: "multiple-first" },
}).state;
assert.deepEqual(beginReviewRepair({
  snapshot, reviewSession: multiple.view, state: multipleState,
  submission: { encounterId: "dev-encounter-2", idempotencyKey: "multiple-skip" },
}).result, { ok: false, code: "repair_not_eligible" });

const successOnly = writingFailureSession([]);
assert.equal(reviewR4SessionView({
  snapshot, reviewSession: successOnly.view, state: correctRetry.state,
}).activeRepair, null, "an existing cue is never surfaced before a failure");

const firstCueState = createReviewR4StoredState({ cueVersions: cueTransition.state.cueVersions });
const laterFailure = writingFailureSession();
let laterState = beginAndSelect({ reviewSession: laterFailure.view, state: firstCueState });
const laterView = reviewR4SessionView({ snapshot, reviewSession: laterFailure.view, state: laterState });
assert.equal(laterView.activeRepair?.availableExistingCue?.cueVersionId, firstCueState.cueVersions[0].cueVersionId);
laterState = saveReviewRepairMemoryCue({
  snapshot, reviewSession: laterFailure.view, state: laterState,
  submission: { encounterId: "dev-encounter-1", cueText: "A better personal cue", idempotencyKey: "cue-two" },
}).state;
assert.equal(laterState.cueVersions.length, 2);
assert.equal(laterState.cueVersions[0].status, "superseded");
assert.equal(laterState.cueVersions[1].supersedesCueVersionId, laterState.cueVersions[0].cueVersionId);
assert.equal(laterState.repairs[0].cueVersionId, laterState.cueVersions[1].cueVersionId);

const hydrated = JSON.parse(JSON.stringify(secondWrong.state)) as ReviewR4StoredState;
assert.equal(reviewR4SessionView({ snapshot, reviewSession: twoAttempt.failure.view, state: hydrated })
  .terminalRepairs[0].terminalOutcome, "repair_attempted_not_secured");

const r4Sources = [
  "lib/adle/review-v3/r4-state.ts",
  "lib/adle/review-v3/r4-contracts.ts",
  "lib/adle/review-v3/r4-persistence.ts",
  "components/adle/review/word-reflection-repair.tsx",
].map((file) => readFileSync(resolve(file), "utf8")).join("\n");
assert.doesNotMatch(r4Sources,
  /adle_review_outcome_events|adle_authentic_use_events|advance.*schedule|complete_review|award.*reward/i);

const migration = readFileSync(resolve(
  "supabase/migrations/20260825120000_add_adle_review_r4_word_repair.sql",
), "utf8");
assert.match(migration, /create table if not exists public\.adle_review_memory_cue_versions/);
assert.match(migration, /create table if not exists public\.adle_review_repair_attempts/);
assert.match(migration, /attempt_number in \(1, 2\)/,
  "durable repair attempts must be capped at two");
assert.match(migration, /'reflection_retry', 'repair_retry'/,
  "the existing attempt-kind authority must explicitly admit repair retries");
assert.match(migration, /'reflection_attempt', 'immediate_repair_attempt'/,
  "the existing evidence-class authority must distinguish immediate repair attempts");
assert.match(migration, /ADLE Review Memory Cue versions are immutable/);
assert.match(migration,
  /grant execute on function public\.transition_adle_review_repair_r4\([\s\S]*?\) to service_role;/);
assert.doesNotMatch(migration,
  /insert\s+into\s+public\.(adle_review_outcome_events|adle_authentic_use_events|daily_assignments)/i);
assert.doesNotMatch(migration, /update\s+public\.adle_review_schedule_words/i);

console.log("PASS: ADLE Review R4 repair state, graphemes, cue history, two retries, resume, and R5 separation");
