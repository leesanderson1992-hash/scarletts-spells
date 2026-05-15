import type { WritingIssueRow } from "../../writing-practice/types";
import type { WritingEngineCandidateHypothesis } from "../types";

import type { WritingIssueRepository } from "../core/writing-issues";
import type { WritingEngineStage5bAuthenticSubmissionVerificationResult } from "./stage5b-authentic-submission-verification-types";

export type WritingEngineStage5cAuthenticWritingIssuePromotionInput = {
  verificationResult: WritingEngineStage5bAuthenticSubmissionVerificationResult;
  issueId?: string;
  nowIso?: string;
};

export type WritingEngineStage5cAuthenticWritingIssuePromotionPersistenceInput =
  {
    promotionInput: WritingEngineStage5cAuthenticWritingIssuePromotionInput;
    repository: WritingIssueRepository;
    nowIso?: string;
  };

export type WritingEngineStage5cDurableIssueTruth = {
  issueStatus: "pending_parent_review";
  finalClassification: null;
  microSkillKey: string;
  approvedReplacement: string;
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision: "accepted" | "overridden";
  parentVerifiedTruth: {
    categoryCode: string | null;
    microSkillKey: string | null;
    templateKey: string | null;
  };
};

export type WritingEngineStage5cAuthenticWritingIssuePromotionResult = {
  sourceType: "authentic_writing";
  verificationResult: WritingEngineStage5bAuthenticSubmissionVerificationResult;
  action: "promoted" | "auditable_rejection";
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision:
    WritingEngineStage5bAuthenticSubmissionVerificationResult["parentDecision"];
  parentVerifiedTruth:
    WritingEngineStage5bAuthenticSubmissionVerificationResult["parentVerifiedTruth"];
  hasDurableIssueTruth: boolean;
  durableIssueTruth: WritingEngineStage5cDurableIssueTruth | null;
  writingIssueRecord: WritingIssueRow | null;
};

export type WritingEngineStage5cAuthenticWritingIssuePromotionBuildResult = {
  insertRecord: Omit<
    WritingIssueRow,
    "id" | "created_at" | "updated_at"
  > | null;
  result: WritingEngineStage5cAuthenticWritingIssuePromotionResult;
};
