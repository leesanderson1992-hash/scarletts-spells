import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { reviewWritingChallengeDevSnapshot } from "../lib/adle/review-v3/dev-snapshot";
import {
  evaluateSubmittedReviewWriting,
  type GovernedReviewMisspellingMapping,
  type NonAuthoritativeReviewSuggestion,
} from "../lib/adle/review-v3/r3-evaluation";
import {
  answerReviewR31AttemptQuestion,
  answerReviewR31Suggestion,
  confirmReviewR31WritingSpan,
  createReviewR3StoredState,
  reviewR3SessionView,
  submitReviewR3AudioCheck,
  submitReviewR3Writing,
} from "../lib/adle/review-v3/r3-state";
import { isExactReviewAudioResponse } from "../lib/adle/review-v3/target-word-matcher";

const snapshot = reviewWritingChallengeDevSnapshot();
const writing = "It felt nesessary on Wensday. The buisness was busy.";
const governed: GovernedReviewMisspellingMapping[] = [{
  mappingId: "canonical-nesessary",
  misspellingNormalized: "nesessary",
  correctSpellingNormalized: "necessary",
  microSkillKey: "D4_FIXTURE",
  dialectCode: "en-GB",
  normalizationVersion: "spelling_normalize_v1",
  authorityReference: "resolver-visible-token-safe:canonical-nesessary",
  authorityLevel: "global_canonical",
}];
const suggestions: NonAuthoritativeReviewSuggestion[] = [{
  observedNormalized: "buisness",
  correctSpellingNormalized: "business",
  resolverVersion: "fixture-suggestion-v1",
  source: "heuristic_correction_resolver",
}];

function evaluate(personal: GovernedReviewMisspellingMapping[] = []) {
  return evaluateSubmittedReviewWriting({
    writing,
    targets: snapshot.targets,
    governedMappings: governed,
    confirmationFlow: {
      learnerConfirmedMappings: personal,
      nonAuthoritativeSuggestions: suggestions,
    },
  });
}

const evaluation = evaluate();
assert.deepEqual(evaluation.map((item) => item.disposition), [
  "attributable_misspelling",
  "unaccounted_for",
  "unaccounted_for",
]);
assert.equal(evaluation[0].attributionProvenance.authorityLevel, "authoritative_misspelling");
assert.equal(evaluation[1].attributionProvenance.r31ConfirmationState, "attempt_question_required");
assert.equal(evaluation[2].attributionProvenance.r31ConfirmationState, "suggestion_confirmation_required");
assert.equal(isExactReviewAudioResponse("nesessary", snapshot.targets[0]), false,
  "an authoritative misspelling never becomes an accepted answer");

const exactWins = evaluateSubmittedReviewWriting({
  writing: "Necessary appears correctly, then nesessary appears later.",
  targets: [snapshot.targets[0]],
  governedMappings: governed,
  confirmationFlow: { nonAuthoritativeSuggestions: [] },
});
assert.equal(exactWins[0].disposition, "correct_in_writing");

const initial = createReviewR3StoredState(snapshot);
const submitted = submitReviewR3Writing({
  snapshot,
  state: initial,
  submission: { finalWriting: writing, idempotencyKey: "submit-r31" },
  evaluations: evaluation,
});
assert.equal(submitted.result.ok, true);
assert.equal(submitted.state.encounters[0].originalOutcome, "failure");
if (!submitted.result.ok) throw new Error("R3.1 writing submission failed");
assert.equal(submitted.result.session.encounters[0].writingAttributionPrompt, null);
assert.equal(submitted.result.session.encounters[0].audioCheckEligible, false);
assert.equal(submitted.state.encounters[2].originalOutcome, "pending",
  "a suggestion alone creates no original outcome");
assert.equal(submitted.result.session.encounters[2].writingAttributionPrompt?.kind, "confirm_suggestion");
assert.equal(submitted.result.session.encounters[1].writingAttributionPrompt?.kind, "ask_attempt");
assert.equal(submitted.result.session.encounters[2].audioCheckEligible, false);
assert.deepEqual(submitReviewR3AudioCheck({
  snapshot,
  state: submitted.state,
  submission: { encounterId: "dev-encounter-3", response: "business", idempotencyKey: "skip-suggestion" },
}).result, { ok: false, code: "audio_check_not_eligible" },
"a non-authoritative suggestion cannot be bypassed with an audio check");
assert.deepEqual(submitReviewR3AudioCheck({
  snapshot,
  state: submitted.state,
  submission: { encounterId: "dev-encounter-2", response: "Wednesday", idempotencyKey: "skip-intent" },
}).result, { ok: false, code: "audio_check_not_eligible" },
"an unknown attempt question cannot be bypassed with an audio check");

const suggestionYes = answerReviewR31Suggestion({
  snapshot,
  state: submitted.state,
  submission: { encounterId: "dev-encounter-3", decision: "yes", idempotencyKey: "suggestion-yes" },
});
assert.equal(suggestionYes.state.encounters[2].originalOutcome, "failure");
assert.equal(suggestionYes.state.encounters[2].repairState, "required");
assert.equal(suggestionYes.state.encounters[2].attributionProvenance?.observedText, "buisness");
assert.equal(answerReviewR31Suggestion({
  snapshot,
  state: suggestionYes.state,
  submission: { encounterId: "dev-encounter-3", decision: "yes", idempotencyKey: "suggestion-yes" },
}).result.ok, true, "identical confirmation retries are idempotent");
assert.deepEqual(answerReviewR31Suggestion({
  snapshot,
  state: suggestionYes.state,
  submission: { encounterId: "dev-encounter-3", decision: "no", idempotencyKey: "suggestion-no-conflict" },
}).result, { ok: false, code: "attribution_confirmation_conflict" });
assert.equal(submitReviewR3AudioCheck({
  snapshot,
  state: suggestionYes.state,
  submission: { encounterId: "dev-encounter-3", response: "business", idempotencyKey: "forbidden-audio" },
}).result.ok, false, "a confirmed writing failure cannot become audio success");

const suggestionNo = answerReviewR31Suggestion({
  snapshot,
  state: submitted.state,
  submission: { encounterId: "dev-encounter-3", decision: "no", idempotencyKey: "suggestion-no" },
});
assert.equal(suggestionNo.state.encounters[2].originalOutcome, "pending");
if (!suggestionNo.result.ok) throw new Error("Suggestion rejection failed");
assert.equal(suggestionNo.result.session.encounters[2].writingAttributionPrompt?.kind, "ask_attempt");
const noAttempt = answerReviewR31AttemptQuestion({
  snapshot,
  state: suggestionNo.state,
  submission: { encounterId: "dev-encounter-3", decision: "no", idempotencyKey: "no-attempt" },
});
if (!noAttempt.result.ok) throw new Error("No-attempt confirmation failed");
assert.equal(noAttempt.result.session.encounters[2].audioCheckEligible, true);

const unknownYes = answerReviewR31AttemptQuestion({
  snapshot,
  state: submitted.state,
  submission: { encounterId: "dev-encounter-2", decision: "yes", idempotencyKey: "unknown-yes" },
});
if (!unknownYes.result.ok) throw new Error("Unknown-attempt confirmation failed");
assert.equal(unknownYes.result.session.encounters[1].writingAttributionPrompt?.kind, "select_attempt");
const unknownStart = writing.indexOf("Wensday");
const selected = confirmReviewR31WritingSpan({
  snapshot,
  state: unknownYes.state,
  submission: {
    encounterId: "dev-encounter-2",
    startOffset: unknownStart,
    endOffset: unknownStart + "Wensday".length,
    idempotencyKey: "select-wensday",
  },
});
assert.equal(selected.state.encounters[1].originalOutcome, "failure");
assert.equal(selected.state.encounters[1].attributionProvenance?.observedText, "Wensday");
const selectedReplay = confirmReviewR31WritingSpan({
  snapshot,
  state: selected.state,
  submission: {
    encounterId: "dev-encounter-2",
    startOffset: unknownStart,
    endOffset: unknownStart + "Wensday".length,
    idempotencyKey: "select-wensday",
  },
});
assert.equal(selectedReplay.result.ok && selectedReplay.result.replayed, true);
assert.deepEqual(confirmReviewR31WritingSpan({
  snapshot,
  state: selected.state,
  submission: {
    encounterId: "dev-encounter-2",
    startOffset: unknownStart,
    endOffset: unknownStart + "Wensday".length - 1,
    idempotencyKey: "replace-wensday",
  },
}).result, { ok: false, code: "attribution_confirmation_conflict" });
const hydrated = JSON.parse(JSON.stringify(selected.state)) as typeof selected.state;
assert.equal(reviewR3SessionView(snapshot, hydrated).encounters[1].confirmedWritingAttempt, "Wensday");

const unknownNo = answerReviewR31AttemptQuestion({
  snapshot,
  state: submitted.state,
  submission: { encounterId: "dev-encounter-2", decision: "no", idempotencyKey: "unknown-no" },
});
if (!unknownNo.result.ok) throw new Error("Unknown no-attempt confirmation failed");
assert.equal(unknownNo.result.session.encounters[1].audioCheckEligible, true);

const personalMapping: GovernedReviewMisspellingMapping = {
  ...governed[0],
  mappingId: "learner-encounter-old",
  misspellingNormalized: "wensday",
  correctSpellingNormalized: "wednesday",
  authorityReference: "adle_review_word_encounters:old",
  authorityLevel: "learner_confirmed",
  sourceReviewEncounterId: "old",
};
const personalEvaluation = evaluate([personalMapping]);
assert.equal(personalEvaluation[1].disposition, "attributable_misspelling");
assert.equal(personalEvaluation[1].attributionProvenance.authorityLevel,
  "learner_specific_authoritative_misspelling");
const withoutPersonal = evaluateSubmittedReviewWriting({
  writing: "Wensday",
  targets: [snapshot.targets[1]],
  governedMappings: [],
  confirmationFlow: { learnerConfirmedMappings: [], nonAuthoritativeSuggestions: [] },
});
assert.equal(withoutPersonal[0].disposition, "unaccounted_for",
  "a personal mapping never becomes global canonical truth");

const ambiguous = evaluateSubmittedReviewWriting({
  writing: "wurd",
  targets: [snapshot.targets[0], snapshot.targets[2]],
  governedMappings: [
    { ...governed[0], mappingId: "a", misspellingNormalized: "wurd" },
    { ...governed[0], mappingId: "b", misspellingNormalized: "wurd", correctSpellingNormalized: "business" },
  ],
  confirmationFlow: { nonAuthoritativeSuggestions: [] },
});
assert.deepEqual(ambiguous.map((item) => item.disposition), ["unaccounted_for", "unaccounted_for"]);

const twoUnknownEvaluation = evaluateSubmittedReviewWriting({
  writing: "mystery",
  targets: [snapshot.targets[1], snapshot.targets[2]],
  governedMappings: [],
  confirmationFlow: { nonAuthoritativeSuggestions: [] },
});
const twoUnknown = submitReviewR3Writing({
  snapshot: { ...snapshot, targets: [snapshot.targets[1], snapshot.targets[2]] },
  state: createReviewR3StoredState({ ...snapshot, targets: [snapshot.targets[1], snapshot.targets[2]] }),
  submission: { finalWriting: "mystery", idempotencyKey: "two-unknown" },
  evaluations: twoUnknownEvaluation,
});
let twoState = answerReviewR31AttemptQuestion({
  snapshot: { ...snapshot, targets: [snapshot.targets[1], snapshot.targets[2]] },
  state: twoUnknown.state,
  submission: { encounterId: "dev-encounter-2", decision: "yes", idempotencyKey: "two-first-yes" },
}).state;
twoState = answerReviewR31AttemptQuestion({
  snapshot: { ...snapshot, targets: [snapshot.targets[1], snapshot.targets[2]] },
  state: twoState,
  submission: { encounterId: "dev-encounter-3", decision: "yes", idempotencyKey: "two-second-yes" },
}).state;
twoState = confirmReviewR31WritingSpan({
  snapshot: { ...snapshot, targets: [snapshot.targets[1], snapshot.targets[2]] },
  state: twoState,
  submission: { encounterId: "dev-encounter-2", startOffset: 0, endOffset: 7, idempotencyKey: "consume" },
}).state;
assert.deepEqual(confirmReviewR31WritingSpan({
  snapshot: { ...snapshot, targets: [snapshot.targets[1], snapshot.targets[2]] },
  state: twoState,
  submission: { encounterId: "dev-encounter-3", startOffset: 0, endOffset: 7, idempotencyKey: "consume-again" },
}).result, { ok: false, code: "writing_span_already_consumed" });

const r31Files = [
  "lib/adle/review-v3/r3-evaluation.ts",
  "lib/adle/review-v3/r3-state.ts",
  "lib/adle/review-v3/server-evaluation.ts",
].map((file) => readFileSync(resolve(file), "utf8")).join("\n");
assert.doesNotMatch(r31Files, /setRepairState|complete_review|adle_review_outcome_events|adle_authentic_use_events/);
const serverEvaluation = readFileSync(resolve("lib/adle/review-v3/server-evaluation.ts"), "utf8");
assert.match(serverEvaluation, /\.eq\("child_id", current\.data\.child_id\)/,
  "personal confusion reuse must be scoped to the current child");
assert.match(serverEvaluation,
  /\.eq\("attribution_algorithm_version", "learner_confirmed_writing_intent_v1"\)/,
  "only prior learner-confirmed writing intent may become personal attribution authority");

const r31Migration = readFileSync(resolve(
  "supabase/migrations/20260824140000_add_adle_review_r31_learner_attribution.sql",
), "utf8");
assert.match(r31Migration,
  /grant execute on function public\.transition_adle_review_writing_attribution_r31\([\s\S]*?\) to service_role;/);
assert.match(r31Migration,
  /old\.attribution_provenance->>'r31ConfirmationState' <> 'no_attempt_confirmed'/,
  "durable audio submission must not bypass learner attribution");
assert.doesNotMatch(r31Migration,
  /insert\s+into\s+public\.(adle_review_outcome_events|adle_authentic_use_events)/i);
assert.doesNotMatch(r31Migration,
  /update\s+public\.(adle_review_schedule_words|adle_taught_history|adle_mastery)/i);
assert.doesNotMatch(r31Migration, /insert\s+into\s+public\.daily_assignments/i);

console.log("ADLE Review R3.1 learner attribution regression passed.");
