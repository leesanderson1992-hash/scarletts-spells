import type { ParentVerificationRepository } from "../core/verification";
import type {
  ParentVerificationRecord,
  RecordParentVerificationCommand,
  VerifiedOutcome,
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineVerificationDecision,
} from "../types";

import type { WritingEngineStage4aPunctuationCandidate } from "./stage4a-authentic-submission-analysis";

export type WritingEngineStage4bAuthenticSubmissionVerificationInput = {
  childId: string;
  parentUserId: string;
  hypothesis: WritingEngineStage4aPunctuationCandidate;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode?: string | null;
  verifiedMicroSkillKey?: string | null;
  verifiedTemplateKey?: string | null;
  note?: string | null;
  metadata?: WritingEngineSourceMetadata;
  verificationId?: string;
  nowIso?: string;
};

export type WritingEngineStage4bAuthenticSubmissionVerificationPersistenceInput = {
  verificationInput: WritingEngineStage4bAuthenticSubmissionVerificationInput;
  repository: ParentVerificationRepository;
  nowIso?: string;
};

export type WritingEngineStage4bAuthenticSubmissionVerificationResult = {
  sourceType: "authentic_writing";
  hypothesis: WritingEngineStage4aPunctuationCandidate;
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision: WritingEngineVerificationDecision;
  parentVerifiedTruth: {
    categoryCode: string | null;
    microSkillKey: string | null;
    templateKey: string | null;
  } | null;
  verificationRecord: ParentVerificationRecord;
  verifiedOutcome: VerifiedOutcome;
  hasMasteryUpdatingIntent: boolean;
};

export type WritingEngineStage4bAuthenticSubmissionVerificationBuildResult = {
  command: RecordParentVerificationCommand;
  result: WritingEngineStage4bAuthenticSubmissionVerificationResult;
};
