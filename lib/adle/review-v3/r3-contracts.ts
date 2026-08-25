import type {
  ReviewOriginalOutcome,
  ReviewWritingDisposition,
} from "./contracts";

export type ReviewR3ResultSource =
  | "review_writing"
  | "review_audio_check"
  | null;

export type ReviewR31WritingAttributionPrompt =
  | { kind: "confirm_suggestion"; observedText: string }
  | { kind: "ask_attempt" }
  | { kind: "select_attempt" };

export interface ReviewR3EncounterView {
  encounterId: string;
  targetOrder: number;
  writingDisposition: ReviewWritingDisposition;
  originalOutcome: ReviewOriginalOutcome;
  resultSource: ReviewR3ResultSource;
  authenticUseCandidate: boolean;
  audioCheckEligible: boolean;
  submittedAudioResponse: string | null;
  audioCheckLocked: boolean;
  governedCorrectSpellingReveal: string | null;
  repairRequired: boolean;
  writingAttributionPrompt: ReviewR31WritingAttributionPrompt | null;
  confirmedWritingAttempt: string | null;
}

export interface ReviewR3SessionView {
  assignmentId: string;
  snapshotFingerprint: string;
  submittedWritingFrozen: boolean;
  submittedWritingText: string | null;
  encounters: readonly ReviewR3EncounterView[];
}

export interface ReviewR3WritingSubmission {
  finalWriting: string;
  idempotencyKey: string;
}

export interface ReviewR3AudioSubmission {
  encounterId: string;
  response: string;
  idempotencyKey: string;
}

export interface ReviewR31DecisionSubmission {
  encounterId: string;
  decision: "yes" | "no";
  idempotencyKey: string;
}

export interface ReviewR31SpanSubmission {
  encounterId: string;
  startOffset: number;
  endOffset: number;
  idempotencyKey: string;
}

export type ReviewR3GatewayResult =
  | { ok: true; session: ReviewR3SessionView; replayed: boolean }
  | {
    ok: false;
    code:
      | "writing_submission_conflict"
      | "writing_not_submitted"
      | "encounter_not_found"
      | "audio_check_not_eligible"
      | "audio_response_conflict"
      | "invalid_response"
      | "attribution_confirmation_not_eligible"
      | "attribution_confirmation_conflict"
      | "invalid_writing_span"
      | "writing_span_already_consumed";
  };

export interface ReviewR3Gateway {
  hydrate(): Promise<ReviewR3SessionView | null>;
  submitWriting(input: ReviewR3WritingSubmission): Promise<ReviewR3GatewayResult>;
  submitAudioCheck(input: ReviewR3AudioSubmission): Promise<ReviewR3GatewayResult>;
  confirmSuggestion(input: ReviewR31DecisionSubmission): Promise<ReviewR3GatewayResult>;
  answerAttemptQuestion(input: ReviewR31DecisionSubmission): Promise<ReviewR3GatewayResult>;
  confirmWritingSpan(input: ReviewR31SpanSubmission): Promise<ReviewR3GatewayResult>;
}
