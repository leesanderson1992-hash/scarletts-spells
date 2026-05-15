import type { ParentVerificationRepository } from "../core/verification";
import type {
  ParentVerificationRecord,
  RecordParentVerificationCommand,
  VerifiedOutcome,
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineVerificationDecision,
} from "../types";

import type { WritingEngineStage3aAuthenticSubmissionHypothesis } from "./stage3a-authentic-submission-analysis";

export type WritingEngineStage3bAuthenticSubmissionVerificationInput = {
  childId: string;
  parentUserId: string;
  hypothesis: WritingEngineStage3aAuthenticSubmissionHypothesis;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode?: string | null;
  verifiedMicroSkillKey?: string | null;
  verifiedTemplateKey?: string | null;
  note?: string | null;
  metadata?: WritingEngineSourceMetadata;
  verificationId?: string;
  nowIso?: string;
};

export type WritingEngineStage3bAuthenticSubmissionVerificationPersistenceInput = {
  verificationInput: WritingEngineStage3bAuthenticSubmissionVerificationInput;
  repository: ParentVerificationRepository;
  nowIso?: string;
};

export type WritingEngineStage3bAuthenticSubmissionVerificationResult = {
  sourceType: "authentic_writing";
  hypothesis: WritingEngineStage3aAuthenticSubmissionHypothesis;
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

export type WritingEngineStage3bAuthenticSubmissionVerificationBuildResult = {
  command: RecordParentVerificationCommand;
  result: WritingEngineStage3bAuthenticSubmissionVerificationResult;
};
