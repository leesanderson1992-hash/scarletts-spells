import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildUnifiedSpellingReviewItems,
  summarizeUnifiedSpellingReviewCompletion,
  type BuildUnifiedSpellingReviewItemsInput,
  type UnifiedSpellingReviewItem,
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
    {
      id: "miss-regenerated-returned",
      writing_sample_id: "sample-current",
      misspelled_word: "writting",
      corrected_word: "writing",
      suggested_word: "writing",
      notes: null,
      position_start: 50,
      position_end: 58,
    },
    {
      id: "miss-regenerated-returned-extra",
      writing_sample_id: "sample-current",
      misspelled_word: "writting",
      corrected_word: "writing",
      suggested_word: "writing",
      notes: null,
      position_start: 59,
      position_end: 67,
    },
    {
      id: "miss-deferred-original",
      writing_sample_id: "sample-current",
      misspelled_word: "becuase",
      corrected_word: "because",
      suggested_word: "because",
      notes: null,
      position_start: 60,
      position_end: 67,
    },
    {
      id: "miss-terminal-no-attempt-regenerated",
      writing_sample_id: "sample-current",
      misspelled_word: "world",
      corrected_word: "would",
      suggested_word: "would",
      notes: null,
      position_start: 70,
      position_end: 75,
    },
    {
      id: "miss-terminal-no-attempt-extra",
      writing_sample_id: "sample-current",
      misspelled_word: "world",
      corrected_word: "would",
      suggested_word: "would",
      notes: null,
      position_start: 80,
      position_end: 85,
    },
    {
      id: "miss-historical-false-positive-regenerated",
      writing_sample_id: "sample-current",
      misspelled_word: "wurld",
      corrected_word: "world",
      suggested_word: "world",
      notes: null,
      position_start: 90,
      position_end: 95,
    },
    {
      id: "miss-historical-false-positive-extra",
      writing_sample_id: "sample-current",
      misspelled_word: "wurld",
      corrected_word: "world",
      suggested_word: "world",
      notes: null,
      position_start: 100,
      position_end: 105,
    },
    {
      id: "miss-historical-not-learning-regenerated",
      writing_sample_id: "sample-current",
      misspelled_word: "innit",
      corrected_word: "isn't it",
      suggested_word: "isn't it",
      notes: null,
      position_start: 110,
      position_end: 115,
    },
    {
      id: "miss-historical-accepted-regenerated",
      writing_sample_id: "sample-current",
      misspelled_word: "adress",
      corrected_word: "address",
      suggested_word: "address",
      notes: null,
      position_start: 120,
      position_end: 126,
    },
    {
      id: "miss-historical-overridden-regenerated",
      writing_sample_id: "sample-current",
      misspelled_word: "definately",
      corrected_word: "definitely",
      suggested_word: "definitely",
      notes: null,
      position_start: 130,
      position_end: 140,
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
    {
      id: "suggestion-regenerated-returned",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-regenerated-returned",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "writting",
      suggested_replacement: "writing",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine regenerated a candidate already represented by a returned correction.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-regenerated-returned-extra",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-regenerated-returned-extra",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "writting",
      suggested_replacement: "writing",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "A separate repeated spelling instance should remain visible.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-original-deferred",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-deferred-original",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "becuase",
      suggested_replacement: "because",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine regenerated the exact source candidate already represented by a returned correction.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-terminal-no-attempt-regenerated",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-terminal-no-attempt-regenerated",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "world",
      suggested_replacement: "would",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine reopened a terminal returned target on a later resubmission.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-terminal-no-attempt-extra",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-terminal-no-attempt-extra",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "world",
      suggested_replacement: "would",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "A second same-pair instance should remain visible after owned target is consumed.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-historical-false-positive-regenerated",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-historical-false-positive-regenerated",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "wurld",
      suggested_replacement: "world",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine reopened a historical false-positive parent verification.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-historical-false-positive-extra",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-historical-false-positive-extra",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "wurld",
      suggested_replacement: "world",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "A second same-pair instance should remain visible after historical verification is consumed.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-historical-not-learning-regenerated",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-historical-not-learning-regenerated",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "innit",
      suggested_replacement: "isn't it",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine reopened a historical not-a-learning-issue verification.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-historical-accepted-regenerated",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-historical-accepted-regenerated",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "adress",
      suggested_replacement: "address",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine reopened a historical accepted parent verification.",
      metadata: { source: "engine" },
    },
    {
      id: "suggestion-historical-overridden-regenerated",
      task_submission_id: "submission-current",
      writing_sample_id: "sample-current",
      misspelling_instance_id: "miss-historical-overridden-regenerated",
      suggestion_status: "pending",
      source_type: "misspelling_instance",
      observed_text: "definately",
      suggested_replacement: "definitely",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      notes: "Engine reopened a historical overridden parent verification.",
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
  historicalParentVerifications: [
    {
      id: "historical-verification-false-positive",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-previous",
        writingSampleId: "sample-previous",
        positionStart: 5,
        positionEnd: 10,
        observedText: "wurld",
        targetText: "world",
      }),
      decision: "false_positive",
      suggested_micro_skill_key: "unknown",
      verified_micro_skill_key: null,
      verification_notes: "Already marked as not an issue in a previous cycle.",
      metadata: {},
    },
    {
      id: "historical-verification-not-learning",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-previous",
        writingSampleId: "sample-previous",
        positionStart: 15,
        positionEnd: 20,
        observedText: "innit",
        targetText: "isn't it",
      }),
      decision: "not_a_learning_issue",
      suggested_micro_skill_key: "unknown",
      verified_micro_skill_key: null,
      verification_notes: "Already marked as not useful for learning.",
      metadata: {},
    },
    {
      id: "historical-verification-accepted",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-previous",
        writingSampleId: "sample-previous",
        positionStart: 25,
        positionEnd: 31,
        observedText: "adress",
        targetText: "address",
      }),
      decision: "accepted",
      suggested_micro_skill_key: "phoneme_grapheme_blends",
      verified_micro_skill_key: "phoneme_grapheme_blends",
      verification_notes: "Already accepted in a previous cycle.",
      metadata: {},
    },
    {
      id: "historical-verification-overridden",
      source_entity_id: buildStage7dSourceEntityId({
        taskSubmissionId: "submission-previous",
        writingSampleId: "sample-previous",
        positionStart: 35,
        positionEnd: 45,
        observedText: "definately",
        targetText: "definitely",
      }),
      decision: "overridden",
      suggested_micro_skill_key: "unknown",
      verified_micro_skill_key: "phoneme_grapheme_blends",
      verification_notes: "Already overridden in a previous cycle.",
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
    {
      id: "attempt-returned-historical-full-answer",
      writing_issue_id: "issue-original-historical-full-answer",
      task_submission_id: "submission-current",
      attempted_correction: "I practised writting again in my whole answer body.",
      attempt_notes: null,
      reflection: "easy",
      metadata: { source: "historical_child_retry" },
      created_at: "2026-05-26T09:15:00.000Z",
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
      observed_text: "adress",
      suggested_replacement: "address",
      approved_replacement: "address",
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
    {
      id: "issue-original-historical-full-answer",
      task_submission_id: "submission-previous",
      source_misspelling_instance_id: "miss-historical-full-answer-original",
      source_suggestion_id: "suggestion-original-historical-full-answer",
      issue_status: "child_responded",
      final_classification: "checking_only",
      observed_text: "writting",
      suggested_replacement: "writing",
      approved_replacement: "writing",
      micro_skill_key: "unknown",
      parent_review_note: "Try this spelling again.",
      notes: null,
      metadata: {
        source_kind: "parent_authored_missed_word",
        parent_authored_missed_word: true,
      },
    },
    {
      id: "issue-original-terminal-no-attempt",
      task_submission_id: "submission-older",
      source_misspelling_instance_id: "miss-terminal-no-attempt-original",
      source_suggestion_id: "suggestion-terminal-no-attempt-original",
      issue_status: "finalised",
      final_classification: "concept_gap",
      observed_text: "world",
      suggested_replacement: "would",
      approved_replacement: "would",
      micro_skill_key: "phoneme_grapheme_blends",
      parent_review_note: "Already handled in an earlier returned review cycle.",
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

assert.equal(
  rows.length,
  13,
  "The unified read model should preserve terminal returned history while keeping separate active instances visible.",
);

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
assert.equal(parentAddedRow.observedText, "natrual");
assert.equal(parentAddedRow.expectedCorrection, "natural");

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
assert.equal(returnedAdminRow.source, "returned_correction");

const returnedMappingRow = rows.find(
  (row) => row.sourceIds.originalWritingIssueId === "issue-original-mapping",
);
assert.ok(returnedMappingRow, "Returned correction parent-local route row should be present.");
assert.equal(returnedMappingRow.sourceIds.candidateMappingId, "mapping-returned-pending");
assert.equal(returnedMappingRow.categorisationStatus, "parent_local_pending");
assert.equal(returnedMappingRow.microSkillKey, "vowel_team_ie_ei");

const repeatedInstanceRow = rows.find(
  (row) => row.sourceIds.misspellingInstanceId === "miss-regenerated-returned-extra",
);
assert.ok(
  repeatedInstanceRow,
  "Additional current rows with the same word/correction pair should remain visible after owned returned targets are consumed.",
);
assert.equal(repeatedInstanceRow.source, "engine_suggested");
assert.equal(repeatedInstanceRow.state, "pending_parent_review");
assert.equal(repeatedInstanceRow.provenance.parentAuthored, false);
assert.equal(
  repeatedInstanceRow.provenance.metadata.source_misspelling_instance_id,
  "miss-regenerated-returned-extra",
);

const returnedOwnedSamePairRow = rows.find(
  (row) =>
    row.source === "engine_suggested" &&
    row.sourceIds.misspellingInstanceId === "miss-regenerated-returned",
);
assert.equal(
  returnedOwnedSamePairRow,
  undefined,
  "A same-thread regenerated row already owned by returned history should not reopen as active E/New.",
);

const returnedOwnedRegeneratedRow = rows.find(
  (row) =>
    row.source === "engine_suggested" &&
    row.sourceIds.misspellingInstanceId === "miss-deferred-original",
);
assert.equal(
  returnedOwnedRegeneratedRow,
  undefined,
  "Current engine rows with direct returned source lineage must not appear as duplicate active E rows.",
);

const historicalFullAnswerReturnedRow = rows.find(
  (row) =>
    row.sourceIds.originalWritingIssueId === "issue-original-historical-full-answer",
);
assert.ok(
  historicalFullAnswerReturnedRow,
  "Returned correction row should remain visible when a historical attempt contains full answer text.",
);
assert.equal(
  historicalFullAnswerReturnedRow.latestChildAttempt,
  null,
  "Historical full-answer attempt text must not render in the compact Retry column.",
);
assert.equal(
  historicalFullAnswerReturnedRow.provenance.parentAuthored,
  true,
  "Parent-added returned checking-only rows should retain P/R provenance.",
);
assert.equal(
  historicalFullAnswerReturnedRow.categorisationStatus,
  "not_applicable",
  "Checking-only returned corrections should not require skill routing.",
);
assert.equal(
  historicalFullAnswerReturnedRow.provenance.metadata.historical_full_answer_attempt,
  "I practised writting again in my whole answer body.",
  "Historical full-answer attempt text should stay available to Details/provenance.",
);
assert.equal(
  historicalFullAnswerReturnedRow.provenance.metadata.original_writing_issue_id,
  "issue-original-historical-full-answer",
  "Returned row provenance should include original writing issue id for disambiguation.",
);
assert.equal(
  historicalFullAnswerReturnedRow.provenance.metadata.correction_attempt_id,
  "attempt-returned-historical-full-answer",
  "Returned row provenance should include correction attempt id for disambiguation.",
);
assert.deepEqual(
  historicalFullAnswerReturnedRow.provenance.metadata.suppressed_regenerated_candidate_ids,
  ["miss-regenerated-returned"],
  "Terminal returned rows should record same-thread regenerated candidates they own.",
);

const terminalNoAttemptReturnedRow = rows.find(
  (row) => row.sourceIds.originalWritingIssueId === "issue-original-terminal-no-attempt",
);
assert.ok(
  terminalNoAttemptReturnedRow,
  "Terminal returned issue without a current correction attempt should remain known.",
);
assert.equal(terminalNoAttemptReturnedRow.source, "returned_correction");
assert.equal(terminalNoAttemptReturnedRow.state, "resolved");
assert.equal(terminalNoAttemptReturnedRow.categorisationStatus, "categorised");
assert.equal(terminalNoAttemptReturnedRow.latestChildAttempt, null);
assert.equal(terminalNoAttemptReturnedRow.sourceIds.correctionAttemptId, null);
assert.equal(
  terminalNoAttemptReturnedRow.provenance.metadata.has_current_correction_attempt,
  false,
);
assert.deepEqual(
  terminalNoAttemptReturnedRow.provenance.metadata.suppressed_regenerated_candidate_ids,
  ["miss-terminal-no-attempt-regenerated"],
  "Terminal returned rows without attempts should still own regenerated same-thread engine rows.",
);

const terminalNoAttemptRegeneratedRow = rows.find(
  (row) =>
    row.source === "engine_suggested" &&
    row.sourceIds.misspellingInstanceId === "miss-terminal-no-attempt-regenerated",
);
assert.equal(
  terminalNoAttemptRegeneratedRow,
  undefined,
  "Terminal returned targets without current attempts must not reopen as active E/New.",
);

const terminalNoAttemptExtraRow = rows.find(
  (row) =>
    row.source === "engine_suggested" &&
    row.sourceIds.misspellingInstanceId === "miss-terminal-no-attempt-extra",
);
assert.ok(
  terminalNoAttemptExtraRow,
  "A second same-pair current row should remain visible once returned ownership is consumed.",
);
assert.equal(terminalNoAttemptExtraRow.state, "pending_parent_review");

[
  ["miss-historical-false-positive-regenerated", "false-positive"],
  ["miss-historical-not-learning-regenerated", "not-a-learning-issue"],
  ["miss-historical-accepted-regenerated", "accepted"],
  ["miss-historical-overridden-regenerated", "overridden"],
].forEach(([misspellingInstanceId, decisionLabel]) => {
  const reopenedHistoricalVerificationRow = rows.find(
    (row) =>
      row.source === "engine_suggested" &&
      row.sourceIds.misspellingInstanceId === misspellingInstanceId,
  );

  assert.equal(
    reopenedHistoricalVerificationRow,
    undefined,
    `Historical terminal ${decisionLabel} parent verification must not reopen as active E/New.`,
  );
});

const historicalVerificationExtraRow = rows.find(
  (row) =>
    row.source === "engine_suggested" &&
    row.sourceIds.misspellingInstanceId === "miss-historical-false-positive-extra",
);
assert.ok(
  historicalVerificationExtraRow,
  "A true new same-pair row should remain visible after a historical verification is consumed.",
);
assert.equal(historicalVerificationExtraRow.state, "pending_parent_review");

const returnedDeferredRow = rows.find(
  (row) => row.sourceIds.originalWritingIssueId === "issue-original-deferred",
);
assert.ok(returnedDeferredRow, "Returned correction awaiting-outcome row should be present.");
assert.equal(returnedDeferredRow.sourceIds.catalogReviewCaseId, null);
assert.equal(returnedDeferredRow.sourceIds.candidateMappingId, null);
assert.deepEqual(
  returnedDeferredRow.provenance.metadata.suppressed_regenerated_candidate_ids,
  ["miss-deferred-original"],
  "Returned rows should record directly linked regenerated engine candidates in Details metadata.",
);
assert.equal(
  returnedDeferredRow.categorisationStatus,
  "not_applicable",
  "Returned corrections without final classification should await outcome before skill routing.",
);

const completionSummary = summarizeUnifiedSpellingReviewCompletion(rows);
assert.equal(completionSummary.canComplete, false);
assert.equal(completionSummary.totalItemCount, 13);
assert.equal(completionSummary.unresolvedItemCount, 7);
assert.equal(completionSummary.unresolvedReturnedCorrectionCount, 3);
assert.equal(completionSummary.unresolvedCategorisationCount, 2);
assert.equal(completionSummary.deferredUnsupportedRouteCount, 0);
assert.ok(
  completionSummary.blockingReasons.some((reason) =>
    reason.includes("returned correction") && reason.includes("final classification"),
  ),
  "Returned corrections without final classification must block completion.",
);
assert.ok(
  completionSummary.blockingReasons.some((reason) =>
    reason.includes("categorisation or admin handoff"),
  ),
  "Rows needing categorisation or parent-local promotion must block completion.",
);
const terminalRows: UnifiedSpellingReviewItem[] = [
  engineRow,
  overriddenRow,
  falsePositiveRow,
  notLearningRow,
  {
    ...parentAddedRow,
    state: "locally_promoted",
    categorisationStatus: "parent_local_promoted",
  },
  {
    ...returnedAdminRow,
    state: "resolved",
    correctionOutcome: "concept_gap",
  },
  {
    ...returnedMappingRow,
    state: "resolved",
    categorisationStatus: "parent_local_promoted",
    correctionOutcome: "concept_gap",
  },
  terminalNoAttemptReturnedRow,
];
const terminalSummary = summarizeUnifiedSpellingReviewCompletion(terminalRows);
assert.equal(terminalSummary.canComplete, true);
assert.equal(terminalSummary.unresolvedItemCount, 0);
assert.equal(terminalSummary.unresolvedReturnedCorrectionCount, 0);
assert.deepEqual(terminalSummary.blockingReasons, []);

const pendingEngineSummary = summarizeUnifiedSpellingReviewCompletion([
  {
    ...engineRow,
    state: "pending_parent_review",
    categorisationStatus: "categorised",
  },
]);
assert.equal(pendingEngineSummary.canComplete, false);
assert.equal(pendingEngineSummary.unresolvedItemCount, 1);
assert.match(
  pendingEngineSummary.blockingReasons.join(" "),
  /parent decision/,
  "Pending engine suggestions must block completion.",
);

const pendingParentAddedSummary = summarizeUnifiedSpellingReviewCompletion([
  parentAddedRow,
]);
assert.equal(pendingParentAddedSummary.canComplete, false);
assert.match(
  pendingParentAddedSummary.blockingReasons.join(" "),
  /categorisation or admin handoff/,
  "Parent-added missed words with pending parent-local route must block completion.",
);

const unsupportedReturnedSummary = summarizeUnifiedSpellingReviewCompletion([
  {
    ...returnedDeferredRow,
    state: "resolved",
    correctionOutcome: "concept_gap",
    categorisationStatus: "unsupported_returned_correction_route",
  },
]);
assert.equal(unsupportedReturnedSummary.canComplete, false);
assert.equal(unsupportedReturnedSummary.deferredUnsupportedRouteCount, 1);

const routableReturnedSummary = summarizeUnifiedSpellingReviewCompletion([
  {
    ...returnedDeferredRow,
    state: "resolved",
    correctionOutcome: "concept_gap",
    categorisationStatus: "categorisation_needed",
  },
]);
assert.equal(routableReturnedSummary.canComplete, false);
assert.equal(routableReturnedSummary.deferredUnsupportedRouteCount, 0);
assert.match(
  routableReturnedSummary.blockingReasons.join(" "),
  /categorisation or admin handoff/,
  "Final-classified returned corrections with source lineage must block as actionable categorisation work.",
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
assert.doesNotMatch(
  helperSource,
  /returnedPairKeys|suppressedRegeneratedCandidatesByPairKey/,
  "Unified read-model helper must not use the old global pair-only suppression indexes.",
);
assert.match(
  helperSource,
  /const currentSubmissionRow = currentSubmission as TaskSubmissionThreadRow \| null;/,
  "Unified read-model helper must load same-task thread context before same-pair ownership can apply.",
);
assert.match(
  helperSource,
  /\.from\("task_submissions"\)[\s\S]*\.eq\("task_id", currentSubmissionRow\.task_id\)[\s\S]*\.eq\("parent_user_id", input\.parentUserId\)[\s\S]*\.eq\("child_id", input\.childId\)/,
  "Historical returned ownership lookup must stay scoped to the same task, parent, and child.",
);
assert.match(
  helperSource,
  /historicalReturnedWritingIssues[\s\S]*isTerminalReturnedOwnershipIssue/,
  "Terminal returned ownership should survive later resubmission cycles without current attempts.",
);
assert.match(
  helperSource,
  /historicalParentVerifications[\s\S]*isTerminalParentVerification/,
  "Historical terminal parent verifications should be loaded as ownership signals.",
);
assert.match(
  helperSource,
  /function parseVerificationSourceEntityId[\s\S]*sourceType !== "authentic_writing"/,
  "Historical verification ownership must parse canonical Stage 7D source entity ids.",
);
assert.match(
  helperSource,
  /const ownedByHistoricalTerminalVerification =[\s\S]*!parentAuthored[\s\S]*historicalTerminalVerification !== null/,
  "Historical terminal verification suppression must stay scoped to non-parent rows.",
);
assert.match(
  helperSource,
  /consumedHistoricalVerificationIds\.add\(historicalTerminalVerification\.id\)/,
  "Historical terminal verification ownership should consume one record so repeated instances remain visible.",
);
assert.match(
  helperSource,
  /const returnedOwnedBySameThreadPair =[\s\S]*!parentAuthored[\s\S]*sameThreadReturnedOwnedWritingIssue !== null/,
  "Same-pair ownership suppression must be scoped to non-parent rows already loaded from returned thread ownership.",
);
assert.match(
  helperSource,
  /consumedReturnedOwnershipIssueIds\.add\(returnedOwnedWritingIssue\.id\)/,
  "Same-pair ownership should consume one returned target so repeated current instances remain visible.",
);
assert.match(
  helperSource,
  /id: `returned:\$\{issue\.id\}:\$\{attempt\?\.id \?\? "no-current-attempt"\}`/,
  "Returned history rows without a current correction attempt need stable row ids.",
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
