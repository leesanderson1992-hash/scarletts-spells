import type { WritingIssueRow } from "../../writing-practice/types";
import type { WritingEngineCandidateHypothesis } from "../types";

import type { WritingIssueRepository } from "../core/writing-issues";
import type { WritingEngineStage3bAuthenticSubmissionVerificationResult } from "./stage3b-authentic-submission-verification-types";

export type WritingEngineStage3cAuthenticWritingIssuePromotionInput = {
  verificationResult: WritingEngineStage3bAuthenticSubmissionVerificationResult;
  issueId?: string;
  nowIso?: string;
};

export type WritingEngineStage3cAuthenticWritingIssuePromotionPersistenceInput = {
  promotionInput: WritingEngineStage3cAuthenticWritingIssuePromotionInput;
  repository: WritingIssueRepository;
  nowIso?: string;
};

export type WritingEngineStage3cDurableIssueTruth = {
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

export type WritingEngineStage3cAuthenticWritingIssuePromotionResult = {
  sourceType: "authentic_writing";
  verificationResult: WritingEngineStage3bAuthenticSubmissionVerificationResult;
  action: "promoted" | "auditable_rejection";
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision:
    WritingEngineStage3bAuthenticSubmissionVerificationResult["parentDecision"];
  parentVerifiedTruth:
    WritingEngineStage3bAuthenticSubmissionVerificationResult["parentVerifiedTruth"];
  hasDurableIssueTruth: boolean;
  durableIssueTruth: WritingEngineStage3cDurableIssueTruth | null;
  writingIssueRecord: WritingIssueRow | null;
};

export type WritingEngineStage3cAuthenticWritingIssuePromotionBuildResult = {
  insertRecord: Omit<
    WritingIssueRow,
    "id" | "created_at" | "updated_at"
  > | null;
  result: WritingEngineStage3cAuthenticWritingIssuePromotionResult;
};
