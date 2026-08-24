import "server-only";

import { reviewWritingChallengeDevSnapshot } from "./dev-snapshot";
import { evaluateSubmittedReviewWriting } from "./r3-evaluation";
import {
  createReviewR3StoredState,
  reviewR3SessionView,
  submitReviewR3AudioCheck,
  submitReviewR3Writing,
  type ReviewR3StoredState,
} from "./r3-state";
import type {
  ReviewR3AudioSubmission,
  ReviewR3GatewayResult,
  ReviewR3SessionView,
  ReviewR3WritingSubmission,
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
] as const;

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
    }),
  });
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
