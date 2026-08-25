import "server-only";

import { reviewWritingChallengeDevSnapshot } from "./dev-snapshot";
import { evaluateSubmittedReviewWriting } from "./r3-evaluation";
import {
  createReviewR3StoredState,
  reviewR3SessionView,
  submitReviewR3AudioCheck,
  submitReviewR3Writing,
  answerReviewR31AttemptQuestion,
  answerReviewR31Suggestion,
  confirmReviewR31WritingSpan,
  type ReviewR3StoredState,
} from "./r3-state";
import type {
  ReviewR3AudioSubmission,
  ReviewR3GatewayResult,
  ReviewR3SessionView,
  ReviewR3WritingSubmission,
  ReviewR31DecisionSubmission,
  ReviewR31SpanSubmission,
} from "./r3-contracts";

const snapshot = reviewWritingChallengeDevSnapshot();
const DEV_GOVERNED_MAPPINGS = [
  {
    mappingId: "dev-governed-neccesary",
    misspellingNormalized: "neccesary",
    correctSpellingNormalized: "necessary",
    microSkillKey: "DEV_REVIEW",
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
    authorityReference: "dev:resolver-visible-token-safe:neccesary",
  },
  {
    mappingId: "dev-governed-nesessary",
    misspellingNormalized: "nesessary",
    correctSpellingNormalized: "necessary",
    microSkillKey: "DEV_REVIEW",
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
    authorityReference: "dev:resolver-visible-token-safe:nesessary",
  },
] as const;
const DEV_SUGGESTIONS = [{
  observedNormalized: "buisness",
  correctSpellingNormalized: "business",
  resolverVersion: "dev-non-authoritative-suggestion-v1",
  source: "heuristic_correction_resolver" as const,
}];

declare global {
  // Development-only server memory lets browser checks prove fresh-page hydration.
  var __adleReviewR3DevState: ReviewR3StoredState | undefined;
}

function currentState(): ReviewR3StoredState {
  globalThis.__adleReviewR3DevState ??= createReviewR3StoredState(snapshot);
  return globalThis.__adleReviewR3DevState;
}

export function hydrateReviewR3DevSession(): ReviewR3SessionView {
  return reviewR3SessionView(snapshot, currentState());
}

export function submitReviewR3DevWriting(
  submission: ReviewR3WritingSubmission,
): ReviewR3GatewayResult {
  const state = currentState();
  const transition = submitReviewR3Writing({
    snapshot,
    state,
    submission,
    evaluations: evaluateSubmittedReviewWriting({
      writing: submission.finalWriting,
      targets: snapshot.targets,
      governedMappings: DEV_GOVERNED_MAPPINGS,
      confirmationFlow: { nonAuthoritativeSuggestions: DEV_SUGGESTIONS },
    }),
  });
  if (transition.result.ok) globalThis.__adleReviewR3DevState = transition.state;
  return transition.result;
}

export function answerReviewR31DevSuggestion(
  submission: ReviewR31DecisionSubmission,
): ReviewR3GatewayResult {
  const transition = answerReviewR31Suggestion({ snapshot, state: currentState(), submission });
  if (transition.result.ok) globalThis.__adleReviewR3DevState = transition.state;
  return transition.result;
}

export function answerReviewR31DevAttemptQuestion(
  submission: ReviewR31DecisionSubmission,
): ReviewR3GatewayResult {
  const transition = answerReviewR31AttemptQuestion({ snapshot, state: currentState(), submission });
  if (transition.result.ok) globalThis.__adleReviewR3DevState = transition.state;
  return transition.result;
}

export function confirmReviewR31DevWritingSpan(
  submission: ReviewR31SpanSubmission,
): ReviewR3GatewayResult {
  const transition = confirmReviewR31WritingSpan({ snapshot, state: currentState(), submission });
  if (transition.result.ok) globalThis.__adleReviewR3DevState = transition.state;
  return transition.result;
}

export function submitReviewR3DevAudio(
  submission: ReviewR3AudioSubmission,
): ReviewR3GatewayResult {
  const transition = submitReviewR3AudioCheck({
    snapshot,
    state: currentState(),
    submission,
  });
  if (transition.result.ok) globalThis.__adleReviewR3DevState = transition.state;
  return transition.result;
}

export function resetReviewR3DevSession(): ReviewR3SessionView {
  globalThis.__adleReviewR3DevState = createReviewR3StoredState(snapshot);
  return reviewR3SessionView(snapshot, globalThis.__adleReviewR3DevState);
}
