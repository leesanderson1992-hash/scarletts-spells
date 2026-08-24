import type {
  CompiledReviewSnapshotV3,
  ReviewRuntimeEncounterStateV1,
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
} from "./r3-contracts";
import type { ReviewWritingEvaluation } from "./r3-evaluation";
import { isExactReviewAudioResponse } from "./target-word-matcher";

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
            audioAttempt === null,
          submittedAudioResponse: audioAttempt?.response ?? null,
          audioCheckLocked: audioAttempt !== null,
          governedCorrectSpellingReveal: failedAudioAttempt
            ? target.canonicalSpelling
            : null,
          repairRequired:
            encounter.originalOutcome === "failure" &&
            encounter.repairState === "required",
        };
      }),
  };
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
