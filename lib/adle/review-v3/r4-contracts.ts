import type { ReviewR3SessionView } from "./r3-contracts";

export type ReviewRepairStage =
  | "compare"
  | "tricky_part"
  | "memory_cue"
  | "look"
  | "cover"
  | "try_again"
  | "terminal";

export type ReviewRepairTerminalOutcome =
  | "repair_completed"
  | "repair_attempted_not_secured";

export interface ReviewMemoryCueVersionView {
  cueVersionId: string;
  canonicalWordId: string;
  spellingAuthorityReferenceId: string;
  spellingAuthorityVersion: string;
  graphemeStart: number;
  graphemeEnd: number;
  selectedText: string;
  cueText: string;
  versionNumber: number;
}

export interface ReviewRepairAttemptView {
  attemptNumber: 1 | 2;
  response: string;
  correct: boolean;
}

export interface ReviewRepairEncounterView {
  encounterId: string;
  targetOrder: number;
  stage: ReviewRepairStage;
  attemptedForm: string | null;
  correctSpellingReveal: string | null;
  trickyTextReveal: string | null;
  trickyGraphemeStart: number | null;
  trickyGraphemeEnd: number | null;
  cueVersionUsed: ReviewMemoryCueVersionView | null;
  availableExistingCue: ReviewMemoryCueVersionView | null;
  attempts: readonly ReviewRepairAttemptView[];
  terminalOutcome: ReviewRepairTerminalOutcome | null;
}

export interface ReviewR4SessionView {
  reviewSession: ReviewR3SessionView;
  activeRepair: ReviewRepairEncounterView | null;
  nextRepairEncounterId: string | null;
  terminalRepairs: readonly ReviewRepairEncounterView[];
  allRequiredRepairsTerminal: boolean;
}

export interface ReviewR4EncounterSubmission {
  encounterId: string;
  idempotencyKey: string;
}

export interface ReviewR4TrickySpanSubmission extends ReviewR4EncounterSubmission {
  graphemeStart: number;
  graphemeEnd: number;
  selectedText: string;
}

export interface ReviewR4MemoryCueSubmission extends ReviewR4EncounterSubmission {
  cueText: string;
  retainCueVersionId?: string;
}

export interface ReviewR4RetrySubmission extends ReviewR4EncounterSubmission {
  response: string;
}

export type ReviewR4FailureCode =
  | "repair_not_eligible"
  | "repair_transition_conflict"
  | "invalid_grapheme_span"
  | "invalid_memory_cue"
  | "memory_cue_not_eligible"
  | "repair_retry_not_eligible"
  | "repair_retry_conflict"
  | "encounter_not_found";

export type ReviewR4GatewayResult =
  | { ok: true; session: ReviewR4SessionView; replayed: boolean }
  | { ok: false; code: ReviewR4FailureCode };

export interface ReviewR4Gateway {
  hydrate(reviewSession: ReviewR3SessionView): Promise<ReviewR4SessionView>;
  beginRepair(input: ReviewR4EncounterSubmission): Promise<ReviewR4GatewayResult>;
  moveToTrickyPart(input: ReviewR4EncounterSubmission): Promise<ReviewR4GatewayResult>;
  saveTrickySpan(input: ReviewR4TrickySpanSubmission): Promise<ReviewR4GatewayResult>;
  saveMemoryCue(input: ReviewR4MemoryCueSubmission): Promise<ReviewR4GatewayResult>;
  moveToCover(input: ReviewR4EncounterSubmission): Promise<ReviewR4GatewayResult>;
  moveToTryAgain(input: ReviewR4EncounterSubmission): Promise<ReviewR4GatewayResult>;
  submitRepairRetry(input: ReviewR4RetrySubmission): Promise<ReviewR4GatewayResult>;
}
