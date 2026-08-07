import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  summarizeUnifiedSpellingReviewCompletion,
  type UnifiedSpellingReviewItem,
} from "../lib/writing-engine/persistence/unified-spelling-review-items";

function returnedRow(
  overrides: Partial<UnifiedSpellingReviewItem> = {},
): UnifiedSpellingReviewItem {
  return {
    id: "returned:issue-1:attempt-1",
    source: "returned_correction",
    state: "child_responded",
    categorisationStatus: "not_applicable",
    observedText: "wosh",
    expectedCorrection: "wash",
    latestChildAttempt: "wash",
    childReflection: "easy",
    correctionOutcome: null,
    draftFinalClassification: null,
    draftFinalClassificationUpdatedAt: null,
    suggestedMicroSkillKey: null,
    verifiedMicroSkillKey: null,
    microSkillKey: "D4_WASH",
    microSkillRecommendation: null,
    knownMatchAutoResolution: {
      authority: "known_match",
      canonicalMappingId: "mapping-wosh-wash",
      microSkillKey: "D4_WASH",
      resolvedAt: "2026-08-07T16:00:00.000Z",
    },
    terminalStatus: null,
    readyForApproval: false,
    parentNote: null,
    sourceIds: {
      currentTaskSubmissionId: "submission-current",
      writingSampleId: "sample-original",
      misspellingInstanceId: "misspelling-1",
      writingIssueSuggestionId: "suggestion-1",
      parentVerificationId: null,
      writingIssueId: null,
      originalWritingIssueId: "issue-1",
      correctionAttemptId: "attempt-1",
      catalogReviewCaseId: null,
      candidateMappingId: null,
      canonicalRecommendationId: null,
      canonicalRecommendationStatus: null,
    },
    provenance: {
      parentAuthored: false,
      sourceKind: "misspelling_instance",
      previousTaskSubmissionId: "submission-original",
      metadata: {},
    },
    ...overrides,
  };
}

function main() {
  const pending = returnedRow();
  assert.equal(summarizeUnifiedSpellingReviewCompletion([pending]).canComplete, false);

  const knownDraft = returnedRow({
    draftFinalClassification: "concept_gap",
    draftFinalClassificationUpdatedAt: "2026-08-07T16:05:00.000Z",
    readyForApproval: true,
  });
  const knownSummary = summarizeUnifiedSpellingReviewCompletion([knownDraft]);
  assert.equal(knownSummary.canComplete, true);
  assert.equal(knownDraft.correctionOutcome, null);
  assert.equal(knownDraft.terminalStatus, null);

  const nonLearningDraft = returnedRow({
    draftFinalClassification: "not_an_issue",
    draftFinalClassificationUpdatedAt: "2026-08-07T16:06:00.000Z",
    knownMatchAutoResolution: null,
    microSkillKey: "unknown",
    readyForApproval: true,
  });
  assert.equal(
    summarizeUnifiedSpellingReviewCompletion([nonLearningDraft]).canComplete,
    true,
  );

  const tableSource = readFileSync(
    "app/courses/review/unified-spelling-review-table.tsx",
    "utf8",
  );
  assert.match(tableSource, /action=\{saveWritingIssueReasonDraft\}/);
  assert.match(
    tableSource,
    /row\.draftFinalClassification \?\? row\.correctionOutcome/,
  );
  assert.doesNotMatch(
    tableSource,
    /action=\{finaliseWritingIssueClassification\}/,
  );
  assert.match(
    tableSource,
    /const returnedRouteIsOpen =[\s\S]*!row\.knownMatchAutoResolution[\s\S]*selectedOutcomeNeedsRoute/,
    "A learning-reason draft must not unlock a durably resolved known-match route.",
  );
  assert.match(
    tableSource,
    /const editableRouteIsOpen = routeIsOpen \|\| knownMatchEditOpen/,
    "The pencil-controlled known-match edit state remains the explicit route unlock.",
  );

  const migrationSource = readFileSync(
    "supabase/migrations/20260807173000_add_editable_writing_issue_reason_drafts.sql",
    "utf8",
  );
  assert.match(migrationSource, /draft_final_classification text/);
  assert.match(migrationSource, /save_writing_issue_reason_draft/);
  assert.match(migrationSource, /approve_task_submission_with_reason_drafts/);
  assert.match(
    migrationSource,
    /finalise_writing_issue_classification_and_learning_item[\s\S]*parent_review_status = 'approved'/,
  );
  assert.match(
    migrationSource,
    /recommendation_status = 'superseded'/,
  );
  assert.match(
    migrationSource,
    /Admin has already acted on this learning route/,
  );

  const candidateActionSource = readFileSync(
    "app/courses/review/actions/candidate-mapping-actions.ts",
    "utf8",
  );
  const catalogActionSource = readFileSync(
    "app/courses/review/actions/catalog-review-case-actions.ts",
    "utf8",
  );
  assert.doesNotMatch(
    candidateActionSource,
    /finalise_writing_issue_classification_and_learning_item/,
  );
  assert.doesNotMatch(
    catalogActionSource,
    /finalise_writing_issue_classification_and_learning_item/,
  );

  console.log("writing-engine-editable-reason-drafts-regression: ok");
}

main();
