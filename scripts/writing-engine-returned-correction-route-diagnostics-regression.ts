import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildReturnedCorrectionLearningRouteDiagnostics,
  type ReturnedCorrectionDiagnosticCandidateMappingRow,
  type ReturnedCorrectionDiagnosticCatalogReviewCaseRow,
  type ReturnedCorrectionDiagnosticCatalogRow,
  type ReturnedCorrectionDiagnosticLearningItemEvidenceRow,
  type ReturnedCorrectionDiagnosticLearningItemLinkRow,
  type ReturnedCorrectionDiagnosticWritingIssueRow,
} from "../lib/writing-engine/persistence/returned-correction-learning-route-diagnostics";
import type { UnifiedSpellingReviewItem } from "../lib/writing-engine/persistence/unified-spelling-review-items";

const parentUserId = "parent-1";
const childId = "child-1";
const submissionId = "submission-returned-1";

function buildReturnedRow(
  overrides: Partial<UnifiedSpellingReviewItem> & {
    issueId: string;
    misspellingId: string;
  },
): UnifiedSpellingReviewItem {
  return {
    id: `returned:${overrides.issueId}:attempt-1`,
    source: "returned_correction",
    state: "child_responded",
    categorisationStatus: "not_applicable",
    observedText: "becos",
    expectedCorrection: "because",
    latestChildAttempt: "because",
    childReflection: "medium",
    correctionOutcome: null,
    suggestedMicroSkillKey: null,
    verifiedMicroSkillKey: null,
    microSkillKey: "unknown",
    microSkillRecommendation: null,
    parentNote: "Try this spelling again.",
    sourceIds: {
      currentTaskSubmissionId: submissionId,
      writingSampleId: "sample-1",
      misspellingInstanceId: overrides.misspellingId,
      writingIssueSuggestionId: null,
      parentVerificationId: null,
      writingIssueId: null,
      originalWritingIssueId: overrides.issueId,
      correctionAttemptId: "attempt-1",
      catalogReviewCaseId: null,
      candidateMappingId: null,
      canonicalRecommendationId: null,
      canonicalRecommendationStatus: null,
    },
    provenance: {
      parentAuthored: false,
      sourceKind: "misspelling_instance",
      previousTaskSubmissionId: "submission-original-1",
      metadata: {},
    },
    ...overrides,
  };
}

function buildIssue(
  overrides: Partial<ReturnedCorrectionDiagnosticWritingIssueRow> & { id: string },
): ReturnedCorrectionDiagnosticWritingIssueRow {
  return {
    issue_status: "child_responded",
    final_classification: null,
    micro_skill_key: "unknown",
    source_misspelling_instance_id: "misspelling-1",
    source_suggestion_id: null,
    ...overrides,
    id: overrides.id,
  };
}

function buildCatalog(
  microSkillKey: string,
  overrides: Partial<ReturnedCorrectionDiagnosticCatalogRow> = {},
): ReturnedCorrectionDiagnosticCatalogRow {
  return {
    micro_skill_key: microSkillKey,
    display_name: "Because spelling pattern",
    practice_route: "word_practice",
    is_active: true,
    is_assignable: true,
    ...overrides,
  };
}

function runDiagnostic(input: {
  unifiedRows: UnifiedSpellingReviewItem[];
  writingIssues: ReturnedCorrectionDiagnosticWritingIssueRow[];
  candidateMappings?: ReturnedCorrectionDiagnosticCandidateMappingRow[];
  catalogReviewCases?: ReturnedCorrectionDiagnosticCatalogReviewCaseRow[];
  catalogRows?: ReturnedCorrectionDiagnosticCatalogRow[];
  learningItemIssueLinks?: ReturnedCorrectionDiagnosticLearningItemLinkRow[];
  learningItemEvidence?: ReturnedCorrectionDiagnosticLearningItemEvidenceRow[];
}) {
  return buildReturnedCorrectionLearningRouteDiagnostics({
    submissionId,
    parentUserId,
    childId,
    unifiedRows: input.unifiedRows,
    writingIssues: input.writingIssues,
    candidateMappings: input.candidateMappings ?? [],
    catalogReviewCases: input.catalogReviewCases ?? [],
    catalogRows: input.catalogRows ?? [],
    learningItemIssueLinks: input.learningItemIssueLinks ?? [],
    learningItemEvidence: input.learningItemEvidence ?? [],
  });
}

function testNeedsFinalClassification() {
  const diagnostics = runDiagnostic({
    unifiedRows: [buildReturnedRow({ issueId: "issue-1", misspellingId: "misspelling-1" })],
    writingIssues: [buildIssue({ id: "issue-1" })],
  });

  assert.equal(diagnostics.summary.needsFinalClassificationCount, 1);
  assert.equal(diagnostics.rows[0].disposition, "needs_final_classification");
  assert.equal(diagnostics.rows[0].retryReady, true);
  assert.match(
    diagnostics.rows[0].whyNot.join("\n"),
    /Final educational outcome has not been chosen yet/,
  );
}

function testNonLearningOutcomeDoesNotNeedRoute() {
  const diagnostics = runDiagnostic({
    unifiedRows: [
      buildReturnedRow({
        issueId: "issue-2",
        misspellingId: "misspelling-2",
        correctionOutcome: "checking_only",
        state: "resolved",
      }),
    ],
    writingIssues: [
      buildIssue({
        id: "issue-2",
        issue_status: "finalised",
        final_classification: "checking_only",
        source_misspelling_instance_id: "misspelling-2",
      }),
    ],
  });

  assert.equal(diagnostics.summary.nonLearningFinalisedCount, 1);
  assert.equal(diagnostics.rows[0].disposition, "non_learning_finalised");
  assert.equal(diagnostics.rows[0].learningQueueReady, false);
  assert.match(diagnostics.rows[0].whyNot.join("\n"), /non-learning/);
}

function testLearningGapWithDurableRouteAndLearningItemIsReady() {
  const diagnostics = runDiagnostic({
    unifiedRows: [
      buildReturnedRow({
        issueId: "issue-3",
        misspellingId: "misspelling-3",
        correctionOutcome: "concept_gap",
        state: "resolved",
        microSkillKey: "D4_ACTIVE",
      }),
    ],
    writingIssues: [
      buildIssue({
        id: "issue-3",
        issue_status: "finalised",
        final_classification: "concept_gap",
        micro_skill_key: "D4_ACTIVE",
        source_misspelling_instance_id: "misspelling-3",
      }),
    ],
    catalogRows: [buildCatalog("D4_ACTIVE")],
    learningItemIssueLinks: [
      {
        id: "link-1",
        learning_item_id: "learning-item-1",
        writing_issue_id: "issue-3",
        link_role: "origin",
      },
    ],
    learningItemEvidence: [
      {
        id: "evidence-1",
        learning_item_id: "learning-item-1",
        writing_issue_id: "issue-3",
        evidence_type: "incorrect_use",
        source_context: "finalised_issue_outcome",
      },
    ],
  });

  assert.equal(diagnostics.summary.learningQueueReadyCount, 1);
  assert.equal(diagnostics.rows[0].disposition, "learning_queue_ready");
  assert.equal(diagnostics.rows[0].route.source, "durable_issue");
  assert.equal(diagnostics.rows[0].learningItem.evidenceCount, 1);
}

function testParentLocalPromotedRouteIsReadyForBridgeButNotQueued() {
  const diagnostics = runDiagnostic({
    unifiedRows: [
      buildReturnedRow({
        issueId: "issue-4",
        misspellingId: "misspelling-4",
        correctionOutcome: "transfer_failure",
        state: "resolved",
      }),
    ],
    writingIssues: [
      buildIssue({
        id: "issue-4",
        issue_status: "finalised",
        final_classification: "transfer_failure",
        micro_skill_key: "unknown",
        source_misspelling_instance_id: "misspelling-4",
      }),
    ],
    candidateMappings: [
      {
        id: "candidate-1",
        source_misspelling_instance_id: "misspelling-4",
        micro_skill_key: "D4_LOCAL",
        candidate_status: "parent_local_promoted",
        promotion_scope: "parent_local",
      },
    ],
    catalogRows: [buildCatalog("D4_LOCAL")],
  });

  assert.equal(diagnostics.rows[0].disposition, "parent_local_route_ready");
  assert.equal(diagnostics.rows[0].route.source, "parent_local_promoted");
  assert.equal(diagnostics.rows[0].route.bridgeAvailable, true);
  assert.equal(diagnostics.rows[0].route.parentLocalPromoted, true);
  assert.equal(diagnostics.rows[0].learningQueueReady, false);
  assert.match(
    diagnostics.rows[0].whyNot.join("\n"),
    /finalisation can bridge it onto the durable issue/,
  );
}

function testAdminDeferredDoesNotQueueLearningItem() {
  const diagnostics = runDiagnostic({
    unifiedRows: [
      buildReturnedRow({
        issueId: "issue-5",
        misspellingId: "misspelling-5",
        correctionOutcome: "fragile_knowledge",
        state: "resolved",
      }),
    ],
    writingIssues: [
      buildIssue({
        id: "issue-5",
        issue_status: "finalised",
        final_classification: "fragile_knowledge",
        source_misspelling_instance_id: "misspelling-5",
      }),
    ],
    catalogReviewCases: [
      {
        id: "case-1",
        source_misspelling_instance_id: "misspelling-5",
        case_status: "open",
      },
    ],
  });

  assert.equal(diagnostics.summary.adminDeferredCount, 1);
  assert.equal(diagnostics.rows[0].disposition, "admin_deferred");
  assert.equal(diagnostics.rows[0].route.adminDeferred, true);
  assert.equal(diagnostics.rows[0].learningQueueReady, false);
  assert.match(diagnostics.rows[0].whyNot.join("\n"), /deferred to admin/);
}

function testDiagnosticsRemainReadOnly() {
  const source = readFileSync(
    "lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts",
    "utf8",
  );

  assert.doesNotMatch(source, /\.insert\(/, "diagnostic read model must not insert");
  assert.doesNotMatch(source, /\.update\(/, "diagnostic read model must not update");
  assert.doesNotMatch(source, /\.upsert\(/, "diagnostic read model must not upsert");
  assert.doesNotMatch(source, /\.delete\(/, "diagnostic read model must not delete");
  assert.doesNotMatch(
    source,
    /createServiceRoleClient|service-role|SERVICE_ROLE/,
    "diagnostic read model must not introduce service-role access",
  );
}

function testDocsRegisterStageAContract() {
  const currentPriorities = readFileSync("docs/current-priorities.md", "utf8");
  const contract = readFileSync(
    "docs/contracts/targeted-writing-practice-contract.md",
    "utf8",
  );

  assert.match(
    currentPriorities,
    /Stage A: Review Work Returned-Correction Learning Route Diagnostics/,
  );
  assert.match(contract, /Child retry is not categorisation/);
  assert.match(contract, /Parent recommendation ladder/);
  assert.match(contract, /Admin handoff:[\s\S]*must not put the row into the child learning queue/);
}

testNeedsFinalClassification();
testNonLearningOutcomeDoesNotNeedRoute();
testLearningGapWithDurableRouteAndLearningItemIsReady();
testParentLocalPromotedRouteIsReadyForBridgeButNotQueued();
testAdminDeferredDoesNotQueueLearningItem();
testDiagnosticsRemainReadOnly();
testDocsRegisterStageAContract();

console.log("Returned-correction route diagnostics regression passed.");
