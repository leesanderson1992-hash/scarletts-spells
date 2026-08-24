import type {
  ReviewOriginalOutcome,
  ReviewWritingDisposition,
} from "./contracts";

export type ReviewR3ResultSource =
  | "review_writing"
  | "review_audio_check"
  | null;

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
      | "invalid_response";
  };

export interface ReviewR3Gateway {
  hydrate(): Promise<ReviewR3SessionView | null>;
  submitWriting(input: ReviewR3WritingSubmission): Promise<ReviewR3GatewayResult>;
  submitAudioCheck(input: ReviewR3AudioSubmission): Promise<ReviewR3GatewayResult>;
}
