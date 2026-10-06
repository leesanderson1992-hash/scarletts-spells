"use server";

import {
  addMissedWordToSubmissionReviewImpl,
  acceptSubmissionReviewIssueImpl,
  rejectSubmissionReviewIssueImpl,
} from "./actions/lesson-submission-review-actions";
import {
  approveSubmissionReviewImpl,
  deleteSubmissionFromReviewImpl,
  finaliseWritingIssueClassificationImpl,
  returnSubmissionToChildImpl,
  saveWritingIssueReasonDraftImpl,
} from "./actions/review-completion-actions";
import { recordReviewWorkVerificationActionImpl } from "./actions/parent-verification-actions";
import { resolveContextReviewSuggestionImpl } from "./actions/context-review-actions";
import { recordContextAdvisoryParentDecisionImpl, promoteContextDiagnosticExampleImpl } from "./actions/context-advisory-decision-actions";
import { finaliseContextualLearningOutcomeImpl } from "./actions/contextual-learning-actions";
import { addParentContextualMissImpl } from "./actions/parent-added-context-actions";
import { promoteParentContextualCaseImpl } from "./actions/context-feedback-research-actions";
import { recordPassageReviewEventImpl, retryPassageContextScanImpl } from "./actions/passage-context-actions";
import {
  captureSubmissionSpellingCandidateMappingImpl,
  promoteParentLocalCandidateMappingImpl,
  recommendParentLocalCanonicalMappingImpl,
  revertParentLocalCandidateMappingImpl,
} from "./actions/candidate-mapping-actions";
import { captureSpellingCatalogReviewCaseImpl } from "./actions/catalog-review-case-actions";
import { releaseAdlePausedWordImpl } from "./actions/adle-paused-words-actions";
import {
  addAdleReviewParentSpellingCandidate as addAdleReviewParentSpellingCandidateImpl,
  confirmAdleReviewParentSpellingCandidate as confirmAdleReviewParentSpellingCandidateImpl,
  rejectAdleReviewParentSpellingCandidate as rejectAdleReviewParentSpellingCandidateImpl,
  sendAdleReviewParentSpellingCandidateToCatalog as sendAdleReviewParentSpellingCandidateToCatalogImpl,
  submitAdleReviewWorkInspection as submitAdleReviewWorkInspectionImpl,
} from "./actions/adle-review-work-actions";

export async function addMissedWordToSubmissionReview(formData: FormData) {
  return addMissedWordToSubmissionReviewImpl(formData);
}

export async function addParentContextualMiss(formData: FormData) {
  return addParentContextualMissImpl(formData);
}

export async function recordPassageReviewEvent(formData: FormData) {
  return recordPassageReviewEventImpl(formData);
}

export async function retryPassageContextScan(formData: FormData) {
  return retryPassageContextScanImpl(formData);
}

export async function promoteParentContextualCase(formData: FormData) {
  return promoteParentContextualCaseImpl(formData);
}

export async function acceptSubmissionReviewIssue(formData: FormData) {
  return acceptSubmissionReviewIssueImpl(formData);
}

export async function rejectSubmissionReviewIssue(formData: FormData) {
  return rejectSubmissionReviewIssueImpl(formData);
}

export async function recordReviewWorkVerificationAction(formData: FormData) {
  return recordReviewWorkVerificationActionImpl(formData);
}

export async function resolveContextReviewSuggestion(formData: FormData) {
  return resolveContextReviewSuggestionImpl(formData);
}

export async function recordContextAdvisoryParentDecision(formData: FormData) {
  return recordContextAdvisoryParentDecisionImpl(formData);
}

export async function promoteContextDiagnosticExample(formData: FormData) {
  return promoteContextDiagnosticExampleImpl(formData);
}

export async function finaliseContextualLearningOutcome(formData: FormData) {
  return finaliseContextualLearningOutcomeImpl(formData);
}

export async function captureSubmissionSpellingCandidateMapping(formData: FormData) {
  return captureSubmissionSpellingCandidateMappingImpl(formData);
}

export async function captureSpellingCatalogReviewCase(formData: FormData) {
  return captureSpellingCatalogReviewCaseImpl(formData);
}

export async function promoteParentLocalCandidateMapping(formData: FormData) {
  return promoteParentLocalCandidateMappingImpl(formData);
}

export async function recommendParentLocalCanonicalMapping(formData: FormData) {
  return recommendParentLocalCanonicalMappingImpl(formData);
}

export async function revertParentLocalCandidateMapping(formData: FormData) {
  return revertParentLocalCandidateMappingImpl(formData);
}

export async function deleteSubmissionFromReview(formData: FormData) {
  return deleteSubmissionFromReviewImpl(formData);
}

export async function finaliseWritingIssueClassification(formData: FormData) {
  return finaliseWritingIssueClassificationImpl(formData);
}

export async function saveWritingIssueReasonDraft(formData: FormData) {
  return saveWritingIssueReasonDraftImpl(formData);
}

export async function returnSubmissionToChild(formData: FormData) {
  return returnSubmissionToChildImpl(formData);
}

export async function approveSubmissionReview(formData: FormData) {
  return approveSubmissionReviewImpl(formData);
}

export async function releaseAdlePausedWord(formData: FormData) {
  return releaseAdlePausedWordImpl(formData);
}

export async function submitAdleReviewWorkInspection(formData: FormData) {
  return submitAdleReviewWorkInspectionImpl(formData);
}

export async function addAdleReviewParentSpellingCandidate(formData: FormData) {
  return addAdleReviewParentSpellingCandidateImpl(formData);
}

export async function confirmAdleReviewParentSpellingCandidate(formData: FormData) {
  return confirmAdleReviewParentSpellingCandidateImpl(formData);
}

export async function rejectAdleReviewParentSpellingCandidate(formData: FormData) {
  return rejectAdleReviewParentSpellingCandidateImpl(formData);
}

export async function sendAdleReviewParentSpellingCandidateToCatalog(formData: FormData) {
  return sendAdleReviewParentSpellingCandidateToCatalogImpl(formData);
}
