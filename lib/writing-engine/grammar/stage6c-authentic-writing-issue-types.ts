import type { WritingIssueRow } from "../../writing-practice/types";
import type { WritingEngineCandidateHypothesis } from "../types";

import type { WritingIssueRepository } from "../core/writing-issues";
import type { WritingEngineStage6bAuthenticSubmissionVerificationResult } from "./stage6b-authentic-submission-verification-types";

export type WritingEngineStage6cAuthenticWritingIssuePromotionInput = {
  verificationResult: WritingEngineStage6bAuthenticSubmissionVerificationResult;
  issueId?: string;
  nowIso?: string;
};

export type WritingEngineStage6cAuthenticWritingIssuePromotionPersistenceInput = {
  promotionInput: WritingEngineStage6cAuthenticWritingIssuePromotionInput;
  repository: WritingIssueRepository;
  nowIso?: string;
};

export type WritingEngineStage6cDurableIssueTruth = {
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

export type WritingEngineStage6cAuthenticWritingIssuePromotionResult = {
  sourceType: "authentic_writing";
  verificationResult: WritingEngineStage6bAuthenticSubmissionVerificationResult;
  action: "promoted" | "auditable_rejection";
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision:
    WritingEngineStage6bAuthenticSubmissionVerificationResult["parentDecision"];
  parentVerifiedTruth:
    WritingEngineStage6bAuthenticSubmissionVerificationResult["parentVerifiedTruth"];
  hasDurableIssueTruth: boolean;
  durableIssueTruth: WritingEngineStage6cDurableIssueTruth | null;
  writingIssueRecord: WritingIssueRow | null;
};

export type WritingEngineStage6cAuthenticWritingIssuePromotionBuildResult = {
  insertRecord: Omit<
    WritingIssueRow,
    "id" | "created_at" | "updated_at"
  > | null;
  result: WritingEngineStage6cAuthenticWritingIssuePromotionResult;
};
