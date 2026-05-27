import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildUnifiedSpellingReviewItems,
  type BuildUnifiedSpellingReviewItemsInput,
} from "../lib/writing-engine/persistence/unified-spelling-review-items";

const helperPath = "lib/writing-engine/persistence/unified-spelling-review-items.ts";
const helperSource = readFileSync(helperPath, "utf8");

function buildStage7dSourceEntityId(input: {
  taskSubmissionId: string;
  writingSampleId: string | null;
  positionStart: number;
  positionEnd: number;
  observedText: string;
  targetText: string | null;
}) {
  return [
    "authentic_writing",
    input.taskSubmissionId,
    input.writingSampleId ?? "no_sample",
    `${input.positionStart}-${input.positionEnd}`,
    input.observedText.toLowerCase(),
    (input.targetText ?? "no_target").toLowerCase(),
  ].join("::");
}

const input: BuildUnifiedSpellingReviewItemsInput = {
  submissionId: "submission-current",
  writingSampleId: "sample-current",
  misspellings: [
    {
      id: "miss-engine",
      writing_sample_id: "sample-current",
      misspelled_word: "buisness",
      corrected_word: "business",
      suggested_word: "business",
      notes: null,
      position_start: 0,
      position_end: 8,
    },
    {
      id: "miss-overridden",
      writing_sample_id: "sample-current",
      misspelled_word: "recieve",
      corrected_word: "receive",
      suggested_word: "receive",
      notes: null,
      position_start: 10,
      position_end: 17,
    },
    {
      id: "miss-false-positive",
      writing_sample_id: "sample-current",
      misspelled_word: "Lumé",
      corrected_word: "Lume",
      suggested_word: "Lume",
      notes: null,
      position_start: 20,
      position_end: 24,
    },
    {
      id: "miss-not-learning",
      writing_sample_id: "sample-current",
      misspelled_word: "gonna",
      corrected_word: "going to",
      suggested_word: "going to",
      notes: null,
      position_start: 30,
      position_end: 35,
    },
    {
      id: "miss-parent",
      writing_sample_id: "sample-current",
      misspelled_word: "natrual",
      corrected_word: "natural",
      suggested_word: "natural",
      notes: JSON.stringify({ parentAuthoredMissedWord: true }),
      position_start: 40,
      position_end: 47,
    },
  ],
  writingIssueSuggestions: [
    {
      id: "suggestion-engine",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-engine",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "buisness",
      suggested_replacement: "business",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine found spelling candidate.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-overridden",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-overridden",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "recieve",
      suggested_replacement: "receive",
      suggested_micro_skill_key: "unknown",
      notes: "Engine found spelling candidate without enough skill truth.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-false-positive",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-false-positive",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "Lumé",
      suggested_replacement: "Lume",
      suggested_micro_skill_key: "unknown",
      notes: "Brand spelling candidate.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-not-learning",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-not-learning",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "gonna",
      suggested_replacement: "going to",
      suggested_micro_skill_key: "unknown",
      notes: "Style issue candidate.",
      metadata: { source: "engine" },
    },
  ],
  parentVerifications: [
    {
      id: "verification-engine",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-current",
        writingSampleId: "sample-current",
        positionStart: 0,
        positionEnd: 8,
        observedText: "buisness",
        targetText: "business",
      }),
      decision: "accepted",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      verified_micro_skill_key: "phoneme_grapheme_blends",
      verification_notes: "Parent confirmed the engine spelling issue.",
      metadata: {},
    },
    {
      id: "verification-overridden",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-current",
        writingSampleId: "sample-current",
        positionStart: 10,
        positionEnd: 17,
        observedText: "recieve",
        targetText: "receive",
      }),
      decision: "overridden",
      suggested_micro_skill_key: "unknown",
      verified_micro_skill_key: "vowel_team_ie_ei",
      verification_notes: "Parent chose a better micro-skill.",
      metadata: {},
    },
    {
      id: "verification-false-positive",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-current",
        writingSampleId: "sample-current",
        positionStart: 20,
        positionEnd: 24,
        observedText: "Lumé",
        targetText: "Lume",
      }),
      decision: "false_positive",
      suggested_micro_skill_key: "unknown",
      verified_micro_skill_key: null,
      verification_notes: "Brand spelling is intentional.",
      metadata: {},
    },
    {
      id: "verification-not-learning",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-current",
        writingSampleId: "sample-current",
        positionStart: 30,
        positionEnd: 35,
        observedText: "gonna",
        targetText: "going to",
      }),
      decision: "not_a_learning_issue",
      suggested_micro_skill_key: "unknown",
      verified_micro_skill_key: null,
      verification_notes: "This is style, not a spelling learning issue.",
      metadata: {},
    },
  ],
  writingIssues: [],
  correctionAttempts: [
    {
      id: "attempt-returned-admin",
      writing_issue_id: "issue-original-admin",
      task_submission_id: "submission-current",
      attempted_correction: "natural",
      attempt_notes: null,
      reflection: "medium",
      metadata: { source: "child_retry" },
      created_at: "2026-05-26T09:00:00.000Z",
    },
    {
      id: "attempt-returned-mapping",
      writing_issue_id: "issue-original-mapping",
      task_submission_id: "submission-current",
      attempted_correction: "receive",
      attempt_notes: null,
      reflection: "hard",
      metadata: { source: "child_retry" },
      created_at: "2026-05-26T09:05:00.000Z",
    },
    {
      id: "attempt-returned-deferred",
      writing_issue_id: "issue-original-deferred",
      task_submission_id: "submission-current",
      attempted_correction: "becuase",
      attempt_notes: null,
      reflection: "hard",
      metadata: { source: "child_retry" },
      created_at: "2026-05-26T09:10:00.000Z",
    },
  ],
  returnedWritingIssues: [
    {
      id: "issue-original-admin",
      task_submission_id: "submission-previous",
      source_misspelling_instance_id: "miss-parent-original",
      source_suggestion_id: null,
      issue_status: "child_responded",
      final_classification: null,
      observed_text: "natrual",
      suggested_replacement: "natural",
      approved_replacement: "natural",
      micro_skill_key: "unknown",
      parent_review_note: "Try this spelling again.",
      notes: null,
      metadata: {
        source_kind: "parent_authored_missed_word",
        parent_authored_missed_word: true,
      },
    },
    {
      id: "issue-original-mapping",
      task_submission_id: "submission-previous",
      source_misspelling_instance_id: "miss-mapping-original",
      source_suggestion_id: "suggestion-original-mapping",
      issue_status: "child_responded",
      final_classification: null,
      observed_text: "recieve",
      suggested_replacement: "receive",
      approved_replacement: "receive",
      micro_skill_key: "unknown",
      parent_review_note: "Try this spelling again.",
      notes: null,
      metadata: {
        source_kind: "misspelling_instance",
      },
    },
    {
      id: "issue-original-deferred",
      task_submission_id: "submission-previous",
      source_misspelling_instance_id: "miss-deferred-original",
      source_suggestion_id: "suggestion-original-deferred",
      issue_status: "child_responded",
      final_classification: null,
      observed_text: "becuase",
      suggested_replacement: "because",
      approved_replacement: "because",
      micro_skill_key: "unknown",
      parent_review_note: "Try this spelling again.",
      notes: null,
      metadata: {
        source_kind: "misspelling_instance",
      },
    },
  ],
  candidateMappings: [
    {
      id: "mapping-parent-pending",
      source_misspelling_instance_id: "miss-parent",
      micro_skill_key: "unknown",
      candidate_status: "pending_parent_promotion",
      promotion_scope: "parent_local",
    },
    {
      id: "mapping-returned-pending",
      source_misspelling_instance_id: "miss-mapping-original",
      micro_skill_key: "vowel_team_ie_ei",
      candidate_status: "pending_parent_promotion",
      promotion_scope: "parent_local",
    },
  ],
  catalogReviewCases: [
    {
      id: "case-returned-admin",
      source_misspelling_instance_id: "miss-parent-original",
      case_status: "open",
    },
  ],
};

const rows = buildUnifiedSpellingReviewItems(input);

assert.equal(rows.length, 8, "The unified read model should assemble eight rows.");

const engineRow = rows.find((row) => row.sourceIds.misspellingInstanceId === "miss-engine");
assert.ok(engineRow, "Engine suggested issue row should be present.");
assert.equal(engineRow.source, "engine_suggested");
assert.equal(engineRow.observedText, "buisness");
assert.equal(engineRow.expectedCorrection, "business");
assert.equal(engineRow.state, "resolved");
assert.equal(engineRow.categorisationStatus, "categorised");
assert.equal(engineRow.sourceIds.writingIssueSuggestionId, "suggestion-engine");
assert.equal(engineRow.sourceIds.parentVerificationId, "verification-engine");

const overriddenRow = rows.find(
  (row) => row.sourceIds.misspellingInstanceId === "miss-overridden",
);
assert.ok(overriddenRow, "Overridden parent verification row should be present.");
assert.equal(overriddenRow.state, "resolved");
assert.equal(overriddenRow.categorisationStatus, "categorised");
assert.equal(overriddenRow.verifiedMicroSkillKey, "vowel_team_ie_ei");
assert.equal(overriddenRow.sourceIds.parentVerificationId, "verification-overridden");

const falsePositiveRow = rows.find(
  (row) => row.sourceIds.misspellingInstanceId === "miss-false-positive",
);
assert.ok(falsePositiveRow, "False-positive parent verification row should be present.");
assert.equal(falsePositiveRow.state, "not_an_issue");
assert.equal(falsePositiveRow.categorisationStatus, "not_applicable");
assert.equal(falsePositiveRow.sourceIds.parentVerificationId, "verification-false-positive");

const notLearningRow = rows.find(
  (row) => row.sourceIds.misspellingInstanceId === "miss-not-learning",
);
assert.ok(notLearningRow, "Not-a-learning-issue parent verification row should be present.");
assert.equal(notLearningRow.state, "not_an_issue");
assert.equal(notLearningRow.categorisationStatus, "not_applicable");
assert.equal(notLearningRow.sourceIds.parentVerificationId, "verification-not-learning");

const parentAddedRow = rows.find(
  (row) => row.sourceIds.misspellingInstanceId === "miss-parent",
);
assert.ok(parentAddedRow, "Parent-added missed word row should be present.");
assert.equal(parentAddedRow.source, "parent_added_missed_word");
assert.equal(parentAddedRow.provenance.parentAuthored, true);
assert.equal(parentAddedRow.categorisationStatus, "parent_local_pending");
assert.equal(parentAddedRow.sourceIds.candidateMappingId, "mapping-parent-pending");

const returnedAdminRow = rows.find(
  (row) => row.sourceIds.originalWritingIssueId === "issue-original-admin",
);
assert.ok(returnedAdminRow, "Returned correction admin-route row should be present.");
assert.equal(returnedAdminRow.source, "returned_correction");
assert.equal(returnedAdminRow.latestChildAttempt, "natural");
assert.equal(returnedAdminRow.childReflection, "medium");
assert.equal(returnedAdminRow.sourceIds.correctionAttemptId, "attempt-returned-admin");
assert.equal(returnedAdminRow.sourceIds.writingIssueId, null);
assert.equal(
  returnedAdminRow.sourceIds.originalWritingIssueId,
  "issue-original-admin",
);
assert.equal(returnedAdminRow.provenance.parentAuthored, true);
assert.equal(returnedAdminRow.provenance.previousTaskSubmissionId, "submission-previous");
assert.equal(returnedAdminRow.sourceIds.catalogReviewCaseId, "case-returned-admin");
assert.equal(returnedAdminRow.categorisationStatus, "sent_to_admin");

const returnedMappingRow = rows.find(
  (row) => row.sourceIds.originalWritingIssueId === "issue-original-mapping",
);
assert.ok(returnedMappingRow, "Returned correction parent-local route row should be present.");
assert.equal(returnedMappingRow.sourceIds.candidateMappingId, "mapping-returned-pending");
assert.equal(returnedMappingRow.categorisationStatus, "parent_local_pending");

const returnedDeferredRow = rows.find(
  (row) => row.sourceIds.originalWritingIssueId === "issue-original-deferred",
);
assert.ok(returnedDeferredRow, "Returned correction deferred row should be present.");
assert.equal(returnedDeferredRow.sourceIds.catalogReviewCaseId, null);
assert.equal(returnedDeferredRow.sourceIds.candidateMappingId, null);
assert.equal(
  returnedDeferredRow.categorisationStatus,
  "unsupported_returned_correction_route",
  "Returned issues with no bridge record should be marked deferred rather than silently routed.",
);

assert.doesNotMatch(
  helperSource,
  /\.from\("writing_issues"\)\s*\n\s*\.(insert|upsert)\(/,
  "Unified read-model helper must not duplicate writing_issues for display.",
);
assert.doesNotMatch(
  helperSource,
  /\.from\("task_submission_payloads"\)/,
  "Unified read-model helper must not read or mutate submitted payload evidence.",
);
assert.doesNotMatch(
  helperSource,
  /\.from\("task_submission_payloads"\)[\s\S]*\.(update|upsert|insert)\(/,
  "Unified read-model helper must not mutate task_submission_payloads.",
);
assert.match(
  helperSource,
  /const returnedSourceMisspellingIds = \[/,
  "Unified read-model helper must derive original source misspelling ids for returned corrections.",
);
assert.match(
  helperSource,
  /\.from\("parent_verified_spelling_candidate_mappings"\)[\s\S]*\.in\("source_misspelling_instance_id", returnedSourceMisspellingIds\)/,
  "Unified read-model helper must bridge returned corrections to candidate mappings by original source misspelling id.",
);
assert.match(
  helperSource,
  /\.from\("spelling_catalog_review_cases"\)[\s\S]*\.in\("source_misspelling_instance_id", returnedSourceMisspellingIds\)/,
  "Unified read-model helper must bridge returned corrections to open catalog review cases by original source misspelling id.",
);

console.log("writing-engine-unified-spelling-review-items-regression: ok");
