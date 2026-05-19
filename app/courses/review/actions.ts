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
} from "./actions/review-completion-actions";
import {
  bulkConfirmSubmissionPositiveEvidenceImpl,
  bulkDismissSubmissionPositiveEvidenceImpl,
  confirmSubmissionPositiveEvidenceImpl,
  dismissSubmissionPositiveEvidenceImpl,
} from "./actions/positive-evidence-actions";
import { recordReviewWorkVerificationActionImpl } from "./actions/parent-verification-actions";
import {
  captureSubmissionSpellingCandidateMappingImpl,
  promoteParentLocalCandidateMappingImpl,
  revertParentLocalCandidateMappingImpl,
} from "./actions/candidate-mapping-actions";

export async function addMissedWordToSubmissionReview(formData: FormData) {
  return addMissedWordToSubmissionReviewImpl(formData);
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

export async function captureSubmissionSpellingCandidateMapping(formData: FormData) {
  return captureSubmissionSpellingCandidateMappingImpl(formData);
}

export async function promoteParentLocalCandidateMapping(formData: FormData) {
  return promoteParentLocalCandidateMappingImpl(formData);
}

export async function revertParentLocalCandidateMapping(formData: FormData) {
  return revertParentLocalCandidateMappingImpl(formData);
}

export async function deleteSubmissionFromReview(formData: FormData) {
  return deleteSubmissionFromReviewImpl(formData);
}

export async function confirmSubmissionPositiveEvidence(formData: FormData) {
  return confirmSubmissionPositiveEvidenceImpl(formData);
}

export async function bulkConfirmSubmissionPositiveEvidence(formData: FormData) {
  return bulkConfirmSubmissionPositiveEvidenceImpl(formData);
}

export async function dismissSubmissionPositiveEvidence(formData: FormData) {
  return dismissSubmissionPositiveEvidenceImpl(formData);
}

export async function bulkDismissSubmissionPositiveEvidence(formData: FormData) {
  return bulkDismissSubmissionPositiveEvidenceImpl(formData);
}

export async function finaliseWritingIssueClassification(formData: FormData) {
  return finaliseWritingIssueClassificationImpl(formData);
}

export async function returnSubmissionToChild(formData: FormData) {
  return returnSubmissionToChildImpl(formData);
}

export async function approveSubmissionReview(formData: FormData) {
  return approveSubmissionReviewImpl(formData);
}
