import type { ParentVerificationRepository } from "../core/verification";
import type {
  ParentVerificationRecord,
  RecordParentVerificationCommand,
  VerifiedOutcome,
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineVerificationDecision,
} from "../types";

import type { WritingEngineStage5aSentenceBoundaryCandidate } from "./stage5a-authentic-submission-analysis";

export type WritingEngineStage5bAuthenticSubmissionVerificationInput = {
  childId: string;
  parentUserId: string;
  hypothesis: WritingEngineStage5aSentenceBoundaryCandidate;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode?: string | null;
  verifiedMicroSkillKey?: string | null;
  verifiedTemplateKey?: string | null;
  note?: string | null;
  metadata?: WritingEngineSourceMetadata;
  verificationId?: string;
  nowIso?: string;
};

export type WritingEngineStage5bAuthenticSubmissionVerificationPersistenceInput =
  {
    verificationInput: WritingEngineStage5bAuthenticSubmissionVerificationInput;
    repository: ParentVerificationRepository;
    nowIso?: string;
  };

export type WritingEngineStage5bAuthenticSubmissionVerificationResult = {
  sourceType: "authentic_writing";
  hypothesis: WritingEngineStage5aSentenceBoundaryCandidate;
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

export type WritingEngineStage5bAuthenticSubmissionVerificationBuildResult = {
  command: RecordParentVerificationCommand;
  result: WritingEngineStage5bAuthenticSubmissionVerificationResult;
};
