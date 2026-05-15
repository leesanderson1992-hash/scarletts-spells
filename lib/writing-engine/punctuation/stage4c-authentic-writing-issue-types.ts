import type { WritingIssueRow } from "../../writing-practice/types";
import type { WritingEngineCandidateHypothesis } from "../types";

import type { WritingIssueRepository } from "../core/writing-issues";
import type { WritingEngineStage4bAuthenticSubmissionVerificationResult } from "./stage4b-authentic-submission-verification-types";

export type WritingEngineStage4cAuthenticWritingIssuePromotionInput = {
  verificationResult: WritingEngineStage4bAuthenticSubmissionVerificationResult;
  issueId?: string;
  nowIso?: string;
};

export type WritingEngineStage4cAuthenticWritingIssuePromotionPersistenceInput = {
  promotionInput: WritingEngineStage4cAuthenticWritingIssuePromotionInput;
  repository: WritingIssueRepository;
  nowIso?: string;
};

export type WritingEngineStage4cDurableIssueTruth = {
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

export type WritingEngineStage4cAuthenticWritingIssuePromotionResult = {
  sourceType: "authentic_writing";
  verificationResult: WritingEngineStage4bAuthenticSubmissionVerificationResult;
  action: "promoted" | "auditable_rejection";
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision:
    WritingEngineStage4bAuthenticSubmissionVerificationResult["parentDecision"];
  parentVerifiedTruth:
    WritingEngineStage4bAuthenticSubmissionVerificationResult["parentVerifiedTruth"];
  hasDurableIssueTruth: boolean;
  durableIssueTruth: WritingEngineStage4cDurableIssueTruth | null;
  writingIssueRecord: WritingIssueRow | null;
};

export type WritingEngineStage4cAuthenticWritingIssuePromotionBuildResult = {
  insertRecord: Omit<
    WritingIssueRow,
    "id" | "created_at" | "updated_at"
  > | null;
  result: WritingEngineStage4cAuthenticWritingIssuePromotionResult;
};
