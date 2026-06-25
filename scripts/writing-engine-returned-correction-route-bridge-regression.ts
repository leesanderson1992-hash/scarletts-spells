import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveReturnedCorrectionParentLocalRouteBridge,
  type ReturnedCorrectionRouteBridgeAttempt,
  type ReturnedCorrectionRouteBridgeCandidateMapping,
  type ReturnedCorrectionRouteBridgeCatalogEntry,
  type ReturnedCorrectionRouteBridgeIssue,
} from "../lib/writing-engine/persistence/returned-correction-route-bridge";

const parentUserId = "parent-1";
const childId = "child-1";
const issue: ReturnedCorrectionRouteBridgeIssue = {
  id: "issue-1",
  child_id: childId,
  source_misspelling_instance_id: "misspelling-1",
};
const attempts: ReturnedCorrectionRouteBridgeAttempt[] = [
  {
    id: "attempt-1",
    task_submission_id: "returned-submission-1",
  },
];
const activeAssignableCatalog: ReturnedCorrectionRouteBridgeCatalogEntry = {
  micro_skill_key: "D4_LOCAL_READY",
  is_active: true,
  is_assignable: true,
};

function promotedMapping(
  overrides: Partial<ReturnedCorrectionRouteBridgeCandidateMapping> = {},
): ReturnedCorrectionRouteBridgeCandidateMapping {
  return {
    id: "candidate-1",
    parent_user_id: parentUserId,
    child_id: childId,
    task_submission_id: "returned-submission-1",
    source_misspelling_instance_id: "misspelling-1",
    micro_skill_key: "D4_LOCAL_READY",
    candidate_status: "parent_local_promoted",
    promotion_scope: "parent_local",
    metadata: {
      source_route: "returned_correction",
      original_writing_issue_id: "issue-1",
      correction_attempt_id: "attempt-1",
    },
    updated_at: "2026-06-25T09:00:00.000Z",
    ...overrides,
  };
}

function resolve(input: {
  candidateMappings?: ReturnedCorrectionRouteBridgeCandidateMapping[];
  catalogEntries?: ReturnedCorrectionRouteBridgeCatalogEntry[];
  issueOverride?: Partial<ReturnedCorrectionRouteBridgeIssue>;
  attemptRows?: ReturnedCorrectionRouteBridgeAttempt[];
}) {
  return resolveReturnedCorrectionParentLocalRouteBridge({
    parentUserId,
    issue: { ...issue, ...input.issueOverride },
    attempts: input.attemptRows ?? attempts,
    candidateMappings: input.candidateMappings ?? [promotedMapping()],
    catalogEntries: input.catalogEntries ?? [activeAssignableCatalog],
    nowIso: "2026-06-25T10:00:00.000Z",
  });
}

const bridged = resolve({});
assert.equal(bridged.status, "bridged");
if (bridged.status === "bridged") {
  assert.equal(bridged.microSkillKey, "D4_LOCAL_READY");
  assert.equal(bridged.candidateMappingId, "candidate-1");
  assert.equal(bridged.bridgeMetadata.route_source, "parent_local_promoted");
  assert.deepEqual(bridged.bridgeMetadata.correction_attempt_ids, ["attempt-1"]);
}

assert.equal(
  resolve({ candidateMappings: [promotedMapping({ parent_user_id: "other-parent" })] })
    .status,
  "not_found",
);
assert.equal(
  resolve({ candidateMappings: [promotedMapping({ child_id: "other-child" })] }).status,
  "not_found",
);
assert.equal(
  resolve({
    candidateMappings: [
      promotedMapping({
        metadata: {
          source_route: "returned_correction",
          original_writing_issue_id: "other-issue",
          correction_attempt_id: "attempt-1",
        },
      }),
    ],
  }).status,
  "not_found",
);
assert.equal(
  resolve({
    candidateMappings: [
      promotedMapping({
        metadata: {
          source_route: "returned_correction",
          original_writing_issue_id: "issue-1",
          correction_attempt_id: "other-attempt",
        },
      }),
    ],
  }).status,
  "not_found",
);
assert.equal(
  resolve({
    candidateMappings: [
      promotedMapping({
        metadata: {
          source_route: "returned_correction",
          original_writing_issue_id: "issue-1",
        },
        task_submission_id: "returned-submission-1",
      }),
    ],
  }).status,
  "bridged",
);
assert.equal(
  resolve({
    candidateMappings: [
      promotedMapping({ candidate_status: "pending_parent_promotion" }),
    ],
  }).status,
  "not_found",
);
assert.equal(
  resolve({
    candidateMappings: [promotedMapping()],
    catalogEntries: [
      {
        micro_skill_key: "D4_LOCAL_READY",
        is_active: false,
        is_assignable: true,
      },
    ],
  }).status,
  "not_found",
);
assert.equal(
  resolve({
    candidateMappings: [promotedMapping()],
    catalogEntries: [
      {
        micro_skill_key: "D4_LOCAL_READY",
        is_active: true,
        is_assignable: false,
      },
    ],
  }).status,
  "not_found",
);
assert.equal(
  resolve({ issueOverride: { source_misspelling_instance_id: null } }).status,
  "not_found",
);

const reviewCompletionActions = readFileSync(
  "app/courses/review/actions/review-completion-actions.ts",
  "utf8",
);
const diagnostics = readFileSync(
  "lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts",
  "utf8",
);
const unifiedSpellingReviewTable = readFileSync(
  "app/courses/review/unified-spelling-review-table.tsx",
  "utf8",
);

assert.match(
  reviewCompletionActions,
  /resolveReturnedCorrectionParentLocalRouteBridge[\s\S]*returned_correction_route_bridge[\s\S]*\.from\("writing_issues"\)[\s\S]*\.update\(\{[\s\S]*micro_skill_key: bridgeResolution\.microSkillKey[\s\S]*finalise_writing_issue_classification_and_learning_item/,
  "Finalisation must attach the verified parent-local route to the durable issue before the learning-item RPC.",
);
assert.match(
  reviewCompletionActions,
  /\.eq\("issue_status", "child_responded"\)[\s\S]*\.is\("final_classification", null\)/,
  "Bridge update must fail closed once the issue is no longer an unfinalised child response.",
);
assert.doesNotMatch(
  reviewCompletionActions,
  /createServiceRoleClient|SERVICE_ROLE|service-role/,
  "Stage C bridge must not introduce service-role access.",
);
assert.match(
  diagnostics,
  /bridgeAvailable[\s\S]*pendingParentRecommendation[\s\S]*adminDeferred/,
  "Diagnostics must distinguish bridgeable, recommendation-only, and admin-deferred routes.",
);
assert.match(
  diagnostics,
  /Parent-local promoted route is active and assignable; finalisation can bridge it onto the durable issue/,
  "Diagnostics must explain bridgeable parent-local routes.",
);
assert.match(
  unifiedSpellingReviewTable,
  /Learning route ready\. This correction can go to practice after you choose the outcome\./,
  "UX copy must say promoted local routes are ready for Stage C finalisation.",
);

console.log("writing-engine-returned-correction-route-bridge-regression: ok");
