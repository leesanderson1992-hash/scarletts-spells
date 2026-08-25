import type {
  CompiledReviewSnapshotV3,
  ReviewRuntimeEncounterStateV1,
  ReviewSnapshotJsonValue,
} from "./contracts";
import {
  createPendingReviewEncounterState,
  submitAudioRetrievalCheck,
  submitWritingDisposition,
} from "./outcome-state";
import type {
  ReviewR3AudioSubmission,
  ReviewR3EncounterView,
  ReviewR3GatewayResult,
  ReviewR3SessionView,
  ReviewR3WritingSubmission,
  ReviewR31DecisionSubmission,
  ReviewR31SpanSubmission,
} from "./r3-contracts";
import type { ReviewWritingEvaluation } from "./r3-evaluation";
import {
  isExactReviewAudioResponse,
  validateReviewWritingSelection,
} from "./target-word-matcher";

export interface ReviewR3StoredAudioAttempt {
  encounterId: string;
  response: string;
  correct: boolean;
  idempotencyKey: string;
}

export interface ReviewR3StoredState {
  assignmentId: string;
  snapshotFingerprint: string;
  submittedWritingText: string | null;
  writingIdempotencyKey: string | null;
  encounters: readonly ReviewRuntimeEncounterStateV1[];
  audioAttempts: readonly ReviewR3StoredAudioAttempt[];
}

export function createReviewR3StoredState(
  snapshot: CompiledReviewSnapshotV3,
): ReviewR3StoredState {
  return {
    assignmentId: snapshot.assignment.assignmentId,
    snapshotFingerprint: snapshot.provenance.sourceFingerprint,
    submittedWritingText: null,
    writingIdempotencyKey: null,
    encounters: [...snapshot.targets]
      .sort((left, right) => left.order - right.order)
      .map((target) => createPendingReviewEncounterState(target.encounterId)),
    audioAttempts: [],
  };
}

function resultSource(
  source: ReviewRuntimeEncounterStateV1["originalOutcomeSource"],
): ReviewR3EncounterView["resultSource"] {
  if (source === "writing") return "review_writing";
  if (source === "audio_retrieval_check") return "review_audio_check";
  return null;
}

function provenanceValue(
  encounter: ReviewRuntimeEncounterStateV1,
  key: string,
): ReviewSnapshotJsonValue | undefined {
  return encounter.attributionProvenance?.[key];
}

function provenanceString(encounter: ReviewRuntimeEncounterStateV1, key: string): string | null {
  const value = provenanceValue(encounter, key);
  return typeof value === "string" ? value : null;
}

function provenanceNumber(encounter: ReviewRuntimeEncounterStateV1, key: string): number | null {
  const value = provenanceValue(encounter, key);
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function attributionPrompt(
  encounter: ReviewRuntimeEncounterStateV1,
): ReviewR3EncounterView["writingAttributionPrompt"] {
  if (encounter.originalOutcome !== "pending") return null;
  const state = provenanceString(encounter, "r31ConfirmationState");
  if (state === "suggestion_confirmation_required") {
    const observedText = provenanceString(encounter, "observedText");
    return observedText ? { kind: "confirm_suggestion", observedText } : null;
  }
  if (state === "attempt_question_required") return { kind: "ask_attempt" };
  if (state === "span_selection_required") return { kind: "select_attempt" };
  return null;
}

function r31AudioEligible(encounter: ReviewRuntimeEncounterStateV1): boolean {
  const state = provenanceString(encounter, "r31ConfirmationState");
  return state === null || state === "no_attempt_confirmed";
}

export function reviewR3SessionView(
  snapshot: CompiledReviewSnapshotV3,
  state: ReviewR3StoredState,
): ReviewR3SessionView {
  const encounterById = new Map(state.encounters.map((encounter) => [encounter.encounterId, encounter]));
  const attemptByEncounter = new Map(state.audioAttempts.map((attempt) => [attempt.encounterId, attempt]));
  return {
    assignmentId: state.assignmentId,
    snapshotFingerprint: state.snapshotFingerprint,
    submittedWritingFrozen: state.submittedWritingText !== null,
    submittedWritingText: state.submittedWritingText,
    encounters: [...snapshot.targets]
      .sort((left, right) => left.order - right.order)
      .map((target) => {
        const encounter = encounterById.get(target.encounterId) ??
          createPendingReviewEncounterState(target.encounterId);
        const audioAttempt = attemptByEncounter.get(target.encounterId) ?? null;
        const failedAudioAttempt = audioAttempt?.correct === false;
        return {
          encounterId: target.encounterId,
          targetOrder: target.order,
          writingDisposition: encounter.writingDisposition ?? "unaccounted_for",
          originalOutcome: encounter.originalOutcome,
          resultSource: resultSource(encounter.originalOutcomeSource),
          authenticUseCandidate:
            encounter.writingDisposition === "correct_in_writing" &&
            encounter.originalOutcome === "success",
          audioCheckEligible:
            encounter.writingDisposition === "unaccounted_for" &&
            encounter.originalOutcome === "pending" &&
            audioAttempt === null &&
            r31AudioEligible(encounter),
          submittedAudioResponse: audioAttempt?.response ?? null,
          audioCheckLocked: audioAttempt !== null,
          governedCorrectSpellingReveal: failedAudioAttempt
            ? target.canonicalSpelling
            : null,
          repairRequired:
            encounter.originalOutcome === "failure" &&
            encounter.repairState === "required",
          repairState: encounter.repairState,
          writingAttributionPrompt: attributionPrompt(encounter),
          confirmedWritingAttempt: encounter.originalOutcomeSource === "writing"
            ? provenanceString(encounter, "observedText")
            : null,
        };
      }),
  };
}

function updateEncounter(
  state: ReviewR3StoredState,
  encounterIndex: number,
  encounter: ReviewRuntimeEncounterStateV1,
): ReviewR3StoredState {
  const encounters = [...state.encounters];
  encounters[encounterIndex] = encounter;
  return { ...state, encounters };
}

function transitionResult(
  snapshot: CompiledReviewSnapshotV3,
  state: ReviewR3StoredState,
  replayed: boolean,
): ReviewR3GatewayResult {
  return { ok: true, session: reviewR3SessionView(snapshot, state), replayed };
}

function spansOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function spanConsumedByAnotherEncounter(
  state: ReviewR3StoredState,
  encounterId: string,
  startOffset: number,
  endOffset: number,
): boolean {
  return state.encounters.some((encounter) => {
    if (encounter.encounterId === encounterId) return false;
    const start = provenanceNumber(encounter, "confirmedSpanStart") ??
      provenanceNumber(encounter, "matchedSpanStart");
    const end = provenanceNumber(encounter, "confirmedSpanEnd") ??
      provenanceNumber(encounter, "matchedSpanEnd");
    return start !== null && end !== null && spansOverlap(startOffset, endOffset, start, end);
  });
}

function confirmedWritingFailure(
  encounter: ReviewRuntimeEncounterStateV1,
  input: {
    observedText: string;
    startOffset: number;
    endOffset: number;
    confirmationSource: "learner_confirmed_suggestion" | "learner_selected_span";
    idempotencyKey: string;
  },
): ReviewRuntimeEncounterStateV1 {
  return {
    ...encounter,
    writingDisposition: "attributable_misspelling",
    originalOutcome: "failure",
    originalOutcomeSource: "writing",
    attributionAlgorithmVersion: "learner_confirmed_writing_intent_v1",
    attributionProvenance: {
      ...(encounter.attributionProvenance ?? {}),
      authorityLevel: "learner_confirmed",
      r31ConfirmationState: "confirmed_writing_failure",
      confirmationSource: input.confirmationSource,
      confirmationIdempotencyKey: input.idempotencyKey,
      observedText: input.observedText,
      observedNormalized: input.observedText.normalize("NFC").toLowerCase(),
      confirmedSpanStart: input.startOffset,
      confirmedSpanEnd: input.endOffset,
    },
    repairState: "required",
  };
}

export function answerReviewR31Suggestion(input: {
  snapshot: CompiledReviewSnapshotV3;
  state: ReviewR3StoredState;
  submission: ReviewR31DecisionSubmission;
}): { state: ReviewR3StoredState; result: ReviewR3GatewayResult } {
  const encounterIndex = input.state.encounters.findIndex((encounter) =>
    encounter.encounterId === input.submission.encounterId,
  );
  if (encounterIndex < 0) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  const encounter = input.state.encounters[encounterIndex];
  const priorDecision = provenanceString(encounter, "suggestionDecision");
  const confirmationSource = provenanceString(encounter, "confirmationSource");
  if (priorDecision !== null || confirmationSource === "learner_confirmed_suggestion") {
    const prior = priorDecision ?? "yes";
    return prior === input.submission.decision
      ? { state: input.state, result: transitionResult(input.snapshot, input.state, true) }
      : { state: input.state, result: { ok: false, code: "attribution_confirmation_conflict" } };
  }
  if (encounter.originalOutcome !== "pending" || encounter.writingDisposition !== "unaccounted_for" ||
    provenanceString(encounter, "r31ConfirmationState") !== "suggestion_confirmation_required") {
    return { state: input.state, result: { ok: false, code: "attribution_confirmation_not_eligible" } };
  }
  if (input.submission.decision === "no") {
    const nextState = updateEncounter(input.state, encounterIndex, {
      ...encounter,
      attributionProvenance: {
        ...(encounter.attributionProvenance ?? {}),
        suggestionDecision: "no",
        r31ConfirmationState: "attempt_question_required",
      },
    });
    return { state: nextState, result: transitionResult(input.snapshot, nextState, false) };
  }
  const startOffset = provenanceNumber(encounter, "suggestedSpanStart");
  const endOffset = provenanceNumber(encounter, "suggestedSpanEnd");
  if (input.state.submittedWritingText === null || startOffset === null || endOffset === null) {
    return { state: input.state, result: { ok: false, code: "invalid_writing_span" } };
  }
  const selection = validateReviewWritingSelection(input.state.submittedWritingText, startOffset, endOffset);
  if (!selection) return { state: input.state, result: { ok: false, code: "invalid_writing_span" } };
  if (spanConsumedByAnotherEncounter(input.state, encounter.encounterId, startOffset, endOffset)) {
    return { state: input.state, result: { ok: false, code: "writing_span_already_consumed" } };
  }
  const nextState = updateEncounter(input.state, encounterIndex, confirmedWritingFailure(encounter, {
    observedText: selection.text,
    startOffset,
    endOffset,
    confirmationSource: "learner_confirmed_suggestion",
    idempotencyKey: input.submission.idempotencyKey,
  }));
  return { state: nextState, result: transitionResult(input.snapshot, nextState, false) };
}

export function answerReviewR31AttemptQuestion(input: {
  snapshot: CompiledReviewSnapshotV3;
  state: ReviewR3StoredState;
  submission: ReviewR31DecisionSubmission;
}): { state: ReviewR3StoredState; result: ReviewR3GatewayResult } {
  const encounterIndex = input.state.encounters.findIndex((encounter) =>
    encounter.encounterId === input.submission.encounterId,
  );
  if (encounterIndex < 0) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  const encounter = input.state.encounters[encounterIndex];
  const priorDecision = provenanceString(encounter, "attemptQuestionDecision");
  if (priorDecision !== null) {
    return priorDecision === input.submission.decision
      ? { state: input.state, result: transitionResult(input.snapshot, input.state, true) }
      : { state: input.state, result: { ok: false, code: "attribution_confirmation_conflict" } };
  }
  if (encounter.originalOutcome !== "pending" || encounter.writingDisposition !== "unaccounted_for" ||
    provenanceString(encounter, "r31ConfirmationState") !== "attempt_question_required") {
    return { state: input.state, result: { ok: false, code: "attribution_confirmation_not_eligible" } };
  }
  const nextState = updateEncounter(input.state, encounterIndex, {
    ...encounter,
    attributionProvenance: {
      ...(encounter.attributionProvenance ?? {}),
      attemptQuestionDecision: input.submission.decision,
      r31ConfirmationState: input.submission.decision === "yes"
        ? "span_selection_required"
        : "no_attempt_confirmed",
    },
  });
  return { state: nextState, result: transitionResult(input.snapshot, nextState, false) };
}

export function confirmReviewR31WritingSpan(input: {
  snapshot: CompiledReviewSnapshotV3;
  state: ReviewR3StoredState;
  submission: ReviewR31SpanSubmission;
}): { state: ReviewR3StoredState; result: ReviewR3GatewayResult } {
  const encounterIndex = input.state.encounters.findIndex((encounter) =>
    encounter.encounterId === input.submission.encounterId,
  );
  if (encounterIndex < 0) return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  const encounter = input.state.encounters[encounterIndex];
  if (encounter.originalOutcome === "failure" &&
    provenanceString(encounter, "confirmationSource") === "learner_selected_span") {
    const sameSpan = provenanceNumber(encounter, "confirmedSpanStart") === input.submission.startOffset &&
      provenanceNumber(encounter, "confirmedSpanEnd") === input.submission.endOffset;
    return sameSpan
      ? { state: input.state, result: transitionResult(input.snapshot, input.state, true) }
      : { state: input.state, result: { ok: false, code: "attribution_confirmation_conflict" } };
  }
  if (encounter.originalOutcome !== "pending" || encounter.writingDisposition !== "unaccounted_for" ||
    provenanceString(encounter, "r31ConfirmationState") !== "span_selection_required" ||
    input.state.submittedWritingText === null) {
    return { state: input.state, result: { ok: false, code: "attribution_confirmation_not_eligible" } };
  }
  const selection = validateReviewWritingSelection(
    input.state.submittedWritingText,
    input.submission.startOffset,
    input.submission.endOffset,
  );
  if (!selection) return { state: input.state, result: { ok: false, code: "invalid_writing_span" } };
  if (spanConsumedByAnotherEncounter(
    input.state,
    encounter.encounterId,
    input.submission.startOffset,
    input.submission.endOffset,
  )) return { state: input.state, result: { ok: false, code: "writing_span_already_consumed" } };
  const nextState = updateEncounter(input.state, encounterIndex, confirmedWritingFailure(encounter, {
    observedText: selection.text,
    startOffset: input.submission.startOffset,
    endOffset: input.submission.endOffset,
    confirmationSource: "learner_selected_span",
    idempotencyKey: input.submission.idempotencyKey,
  }));
  return { state: nextState, result: transitionResult(input.snapshot, nextState, false) };
}

export function submitReviewR3Writing(input: {
  snapshot: CompiledReviewSnapshotV3;
  state: ReviewR3StoredState;
  submission: ReviewR3WritingSubmission;
  evaluations: readonly ReviewWritingEvaluation[];
}): { state: ReviewR3StoredState; result: ReviewR3GatewayResult } {
  if (input.state.submittedWritingText !== null) {
    const replayed = input.state.submittedWritingText === input.submission.finalWriting;
    return replayed
      ? {
        state: input.state,
        result: { ok: true, session: reviewR3SessionView(input.snapshot, input.state), replayed: true },
      }
      : { state: input.state, result: { ok: false, code: "writing_submission_conflict" } };
  }

  const evaluationByEncounter = new Map(input.evaluations.map((evaluation) => [
    evaluation.encounterId,
    evaluation,
  ]));
  const nextEncounters: ReviewRuntimeEncounterStateV1[] = [];
  for (const encounter of input.state.encounters) {
    const evaluation = evaluationByEncounter.get(encounter.encounterId);
    if (!evaluation) {
      return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
    }
    const transition = submitWritingDisposition(encounter, {
      disposition: evaluation.disposition,
      attributionAlgorithmVersion: evaluation.attributionAlgorithmVersion,
      attributionProvenance: {
        ...evaluation.attributionProvenance,
        ...(evaluation.observedText === null ? {} : { observedText: evaluation.observedText }),
      },
    });
    if (!transition.ok) {
      return { state: input.state, result: { ok: false, code: "writing_submission_conflict" } };
    }
    nextEncounters.push(transition.state);
  }

  const nextState: ReviewR3StoredState = {
    ...input.state,
    submittedWritingText: input.submission.finalWriting,
    writingIdempotencyKey: input.submission.idempotencyKey,
    encounters: nextEncounters,
  };
  return {
    state: nextState,
    result: { ok: true, session: reviewR3SessionView(input.snapshot, nextState), replayed: false },
  };
}

export function submitReviewR3AudioCheck(input: {
  snapshot: CompiledReviewSnapshotV3;
  state: ReviewR3StoredState;
  submission: ReviewR3AudioSubmission;
}): { state: ReviewR3StoredState; result: ReviewR3GatewayResult } {
  if (input.state.submittedWritingText === null) {
    return { state: input.state, result: { ok: false, code: "writing_not_submitted" } };
  }
  const response = input.submission.response.normalize("NFC").trim();
  if (response.length === 0) {
    return { state: input.state, result: { ok: false, code: "invalid_response" } };
  }
  const target = input.snapshot.targets.find((candidate) =>
    candidate.encounterId === input.submission.encounterId,
  );
  const encounterIndex = input.state.encounters.findIndex((candidate) =>
    candidate.encounterId === input.submission.encounterId,
  );
  if (!target || encounterIndex < 0) {
    return { state: input.state, result: { ok: false, code: "encounter_not_found" } };
  }
  const existingAttempt = input.state.audioAttempts.find((attempt) =>
    attempt.encounterId === input.submission.encounterId,
  );
  if (existingAttempt) {
    if (existingAttempt.response !== response) {
      return { state: input.state, result: { ok: false, code: "audio_response_conflict" } };
    }
    return {
      state: input.state,
      result: { ok: true, session: reviewR3SessionView(input.snapshot, input.state), replayed: true },
    };
  }
  if (!r31AudioEligible(input.state.encounters[encounterIndex])) {
    return { state: input.state, result: { ok: false, code: "audio_check_not_eligible" } };
  }

  const correct = isExactReviewAudioResponse(response, target);
  const transition = submitAudioRetrievalCheck(input.state.encounters[encounterIndex], correct);
  if (!transition.ok) {
    return { state: input.state, result: { ok: false, code: "audio_check_not_eligible" } };
  }
  const nextEncounters = [...input.state.encounters];
  nextEncounters[encounterIndex] = transition.state;
  const nextState: ReviewR3StoredState = {
    ...input.state,
    encounters: nextEncounters,
    audioAttempts: [...input.state.audioAttempts, {
      encounterId: input.submission.encounterId,
      response,
      correct,
      idempotencyKey: input.submission.idempotencyKey,
    }],
  };
  return {
    state: nextState,
    result: { ok: true, session: reviewR3SessionView(input.snapshot, nextState), replayed: false },
  };
}
