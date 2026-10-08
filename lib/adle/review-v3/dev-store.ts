import "server-only";

import type { CompiledReviewSnapshotV3 } from "./contracts";
import { isReviewCompletionReady } from "./outcome-state";

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
import type {
  ReviewR4EncounterSubmission,
  ReviewR4GatewayResult,
  ReviewR4MemoryCueSubmission,
  ReviewR4RetrySubmission,
  ReviewR4SessionView,
  ReviewR4TrickySpanSubmission,
} from "./r4-contracts";
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
} from "./r4-state";

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

export interface ReviewDevelopmentStoredState {
  r3: ReviewR3StoredState;
  r4: ReviewR4StoredState;
}

/** Existing development adapter, reusable with isolated snapshots and storage. */
export function createReviewDevelopmentStore(
  snapshot: CompiledReviewSnapshotV3,
  initial?: ReviewDevelopmentStoredState,
) {
  let r3 = initial?.r3 ?? createReviewR3StoredState(snapshot);
  let r4 = initial?.r4 ?? createReviewR4StoredState();
function currentState(): ReviewR3StoredState {
  r3 ??= createReviewR3StoredState(snapshot);
  return r3;
}

function currentRepairState(): ReviewR4StoredState {
  r4 ??= createReviewR4StoredState();
  return r4;
}

function hydrateReviewR3DevSession(): ReviewR3SessionView {
  return reviewR3SessionView(snapshot, currentState());
}

function hydrateReviewR4DevSession(): ReviewR4SessionView {
  return reviewR4SessionView({
    snapshot,
    reviewSession: hydrateReviewR3DevSession(),
    state: currentRepairState(),
  });
}

function persistRepairTransition(transition: {
  state: ReviewR4StoredState;
  result: ReviewR4GatewayResult;
}) {
  if (!transition.result.ok) return transition.result;
  r4 = transition.state;
  const repairByEncounter = new Map(transition.state.repairs.map((repair) => [
    repair.encounterId,
    repair,
  ]));
  const r3State = currentState();
  r3 = {
    ...r3State,
    encounters: r3State.encounters.map((encounter) => {
      const repair = repairByEncounter.get(encounter.encounterId);
      if (!repair) return encounter;
      const repairState = repair.stage !== "terminal"
        ? "in_progress" as const
        : repair.terminalOutcome === "repair_completed"
          ? "completed_correct" as const
          : "attempted_not_secured" as const;
      return { ...encounter, repairState };
    }),
  };
  return {
    ...transition.result,
    session: hydrateReviewR4DevSession(),
  };
}

function repairInput<T extends ReviewR4EncounterSubmission>(submission: T) {
  return {
    snapshot,
    reviewSession: hydrateReviewR3DevSession(),
    state: currentRepairState(),
    submission,
  };
}

function beginReviewR4DevRepair(submission: ReviewR4EncounterSubmission) {
  return persistRepairTransition(beginReviewRepair(repairInput(submission)));
}

function moveReviewR4DevToTrickyPart(submission: ReviewR4EncounterSubmission) {
  return persistRepairTransition(moveReviewRepairToTrickyPart(repairInput(submission)));
}

function saveReviewR4DevTrickySpan(submission: ReviewR4TrickySpanSubmission) {
  return persistRepairTransition(saveReviewRepairTrickySpan(repairInput(submission)));
}

function saveReviewR4DevMemoryCue(submission: ReviewR4MemoryCueSubmission) {
  return persistRepairTransition(saveReviewRepairMemoryCue(repairInput(submission)));
}

function moveReviewR4DevToCover(submission: ReviewR4EncounterSubmission) {
  return persistRepairTransition(moveReviewRepairToCover(repairInput(submission)));
}

function moveReviewR4DevToTryAgain(submission: ReviewR4EncounterSubmission) {
  return persistRepairTransition(moveReviewRepairToTryAgain(repairInput(submission)));
}

function submitReviewR4DevRetry(submission: ReviewR4RetrySubmission) {
  return persistRepairTransition(submitReviewRepairRetry(repairInput(submission)));
}

function submitReviewR3DevWriting(
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
  if (transition.result.ok) r3 = transition.state;
  return transition.result;
}

function answerReviewR31DevSuggestion(
  submission: ReviewR31DecisionSubmission,
): ReviewR3GatewayResult {
  const transition = answerReviewR31Suggestion({ snapshot, state: currentState(), submission });
  if (transition.result.ok) r3 = transition.state;
  return transition.result;
}

function answerReviewR31DevAttemptQuestion(
  submission: ReviewR31DecisionSubmission,
): ReviewR3GatewayResult {
  const transition = answerReviewR31AttemptQuestion({ snapshot, state: currentState(), submission });
  if (transition.result.ok) r3 = transition.state;
  return transition.result;
}

function confirmReviewR31DevWritingSpan(
  submission: ReviewR31SpanSubmission,
): ReviewR3GatewayResult {
  const transition = confirmReviewR31WritingSpan({ snapshot, state: currentState(), submission });
  if (transition.result.ok) r3 = transition.state;
  return transition.result;
}

function submitReviewR3DevAudio(
  submission: ReviewR3AudioSubmission,
): ReviewR3GatewayResult {
  const transition = submitReviewR3AudioCheck({
    snapshot,
    state: currentState(),
    submission,
  });
  if (transition.result.ok) r3 = transition.state;
  return transition.result;
}

function resetReviewR3DevSession(): ReviewR3SessionView {
  r3 = createReviewR3StoredState(snapshot);
  r4 = createReviewR4StoredState();
  return reviewR3SessionView(snapshot, r3);
}

  return {
    hydrateReviewR3DevSession,
    hydrateReviewR4DevSession,
    beginReviewR4DevRepair,
    moveReviewR4DevToTrickyPart,
    saveReviewR4DevTrickySpan,
    saveReviewR4DevMemoryCue,
    moveReviewR4DevToCover,
    moveReviewR4DevToTryAgain,
    submitReviewR4DevRetry,
    submitReviewR3DevWriting,
    answerReviewR31DevSuggestion,
    answerReviewR31DevAttemptQuestion,
    confirmReviewR31DevWritingSpan,
    submitReviewR3DevAudio,
    resetReviewR3DevSession,
    exportState: (): ReviewDevelopmentStoredState => ({ r3: currentState(), r4: currentRepairState() }),
    canFinalize: () => isReviewCompletionReady(currentState().encounters),
  };
}

declare global {
  var __adleReviewDevelopmentStore: ReturnType<typeof createReviewDevelopmentStore> | undefined;
}
const defaultStore = globalThis.__adleReviewDevelopmentStore ??=
  createReviewDevelopmentStore(reviewWritingChallengeDevSnapshot());
export const {
  hydrateReviewR3DevSession,
  hydrateReviewR4DevSession,
  beginReviewR4DevRepair,
  moveReviewR4DevToTrickyPart,
  saveReviewR4DevTrickySpan,
  saveReviewR4DevMemoryCue,
  moveReviewR4DevToCover,
  moveReviewR4DevToTryAgain,
  submitReviewR4DevRetry,
  submitReviewR3DevWriting,
  answerReviewR31DevSuggestion,
  answerReviewR31DevAttemptQuestion,
  confirmReviewR31DevWritingSpan,
  submitReviewR3DevAudio,
  resetReviewR3DevSession
} = defaultStore;
