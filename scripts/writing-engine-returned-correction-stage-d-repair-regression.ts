import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildReturnedCorrectionRepairPlan,
  summarizeReturnedCorrectionRepairPlans,
  type ReturnedCorrectionRepairCandidateMapping,
  type ReturnedCorrectionRepairCatalogEntry,
  type ReturnedCorrectionRepairCatalogReviewCase,
  type ReturnedCorrectionRepairCanonicalRecommendation,
  type ReturnedCorrectionRepairEvidence,
  type ReturnedCorrectionRepairIssue,
  type ReturnedCorrectionRepairLearningLink,
} from "../lib/writing-engine/persistence/returned-correction-repair";
import type { ReturnedCorrectionRouteBridgeAttempt } from "../lib/writing-engine/persistence/returned-correction-route-bridge";

const parentUserId = "parent-1";
const childId = "child-1";
const nowIso = "2026-06-25T12:00:00.000Z";

function issue(
  overrides: Partial<ReturnedCorrectionRepairIssue> = {},
): ReturnedCorrectionRepairIssue {
  return {
    id: "issue-1",
    child_id: childId,
    parent_user_id: parentUserId,
    task_submission_id: "submission-1",
    issue_status: "finalised",
    final_classification: "fragile_knowledge",
    observed_text: "definately",
    approved_replacement: "definitely",
    suggested_replacement: "definitely",
    micro_skill_key: "D4_DURABLE",
    theme_key: null,
    source_misspelling_instance_id: "misspelling-1",
    metadata: {},
    ...overrides,
  };
}

function attempt(
  overrides: Partial<ReturnedCorrectionRouteBridgeAttempt> = {},
): ReturnedCorrectionRouteBridgeAttempt {
  return {
    id: "attempt-1",
    task_submission_id: "returned-submission-1",
    ...overrides,
  };
}

function catalog(
  overrides: Partial<ReturnedCorrectionRepairCatalogEntry> = {},
): ReturnedCorrectionRepairCatalogEntry {
  return {
    micro_skill_key: "D4_DURABLE",
    mastery_domain_key: "spelling",
    skill_family_key: "common_words",
    skill_cluster_key: null,
    practice_route: "word_practice",
    display_name: "Durable route",
    is_active: true,
    is_assignable: true,
    ...overrides,
  };
}

function parentLocalMapping(
  overrides: Partial<ReturnedCorrectionRepairCandidateMapping> = {},
): ReturnedCorrectionRepairCandidateMapping {
  return {
    id: "mapping-1",
    parent_user_id: parentUserId,
    child_id: childId,
    task_submission_id: "returned-submission-1",
    source_misspelling_instance_id: "misspelling-1",
    micro_skill_key: "D4_PARENT_LOCAL",
    candidate_status: "parent_local_promoted",
    promotion_scope: "parent_local",
    metadata: {
      source_route: "returned_correction",
      original_writing_issue_id: "issue-1",
      correction_attempt_id: "attempt-1",
    },
    updated_at: "2026-06-25T11:00:00.000Z",
    ...overrides,
  };
}

function recommendation(
  overrides: Partial<ReturnedCorrectionRepairCanonicalRecommendation> = {},
): ReturnedCorrectionRepairCanonicalRecommendation {
  return {
    id: "recommendation-1",
    source_misspelling_instance_id: "misspelling-1",
    micro_skill_key: "D4_RECOMMENDED",
    recommendation_status: "pending_admin_review",
    ...overrides,
  };
}

function plan(input: {
  row?: Partial<ReturnedCorrectionRepairIssue>;
  attempts?: ReturnedCorrectionRouteBridgeAttempt[];
  candidateMappings?: ReturnedCorrectionRepairCandidateMapping[];
  catalogEntries?: ReturnedCorrectionRepairCatalogEntry[];
  catalogReviewCases?: ReturnedCorrectionRepairCatalogReviewCase[];
  canonicalRecommendations?: ReturnedCorrectionRepairCanonicalRecommendation[];
  learningItemLinks?: ReturnedCorrectionRepairLearningLink[];
  learningItemEvidence?: ReturnedCorrectionRepairEvidence[];
}) {
  const row = issue(input.row);

  return buildReturnedCorrectionRepairPlan({
    parentUserId: row.parent_user_id,
    issue: row,
    attempts: input.attempts ?? [attempt()],
    candidateMappings: input.candidateMappings ?? [],
    catalogEntries: input.catalogEntries ?? [catalog()],
    catalogReviewCases: input.catalogReviewCases ?? [],
    canonicalRecommendations: input.canonicalRecommendations ?? [],
    learningItemLinks: input.learningItemLinks ?? [],
    learningItemEvidence: input.learningItemEvidence ?? [],
    nowIso,
  });
}

const durable = plan({});
assert.equal(durable.bucket, "repairable_durable_route");
assert.equal(durable.safeToApply, true);
assert.deepEqual(durable.proposedMutations, [
  {
    type: "create_or_strengthen_learning_item",
    writingIssueId: "issue-1",
    microSkillKey: "D4_DURABLE",
    routeSource: "durable_issue",
  },
]);

const parentLocal = plan({
  row: { micro_skill_key: "unknown" },
  candidateMappings: [parentLocalMapping()],
  catalogEntries: [
    catalog({ micro_skill_key: "D4_PARENT_LOCAL", display_name: "Parent local" }),
  ],
});
assert.equal(parentLocal.bucket, "repairable_parent_local_bridge");
assert.equal(parentLocal.safeToApply, true);
assert.equal(parentLocal.proposedMutations[0]?.type, "attach_parent_local_route");

const parentRecommendationOnly = plan({
  row: { micro_skill_key: "unknown" },
  catalogEntries: [],
  canonicalRecommendations: [recommendation()],
});
assert.equal(parentRecommendationOnly.bucket, "no_action");
assert.match(parentRecommendationOnly.reasons.join(" "), /route evidence only/);

const adminDeferred = plan({
  row: { micro_skill_key: "unknown" },
  catalogEntries: [],
  catalogReviewCases: [
    {
      id: "review-case-1",
      source_misspelling_instance_id: "misspelling-1",
      case_status: "open",
    },
  ],
});
assert.equal(adminDeferred.bucket, "deferred_admin_route");
assert.equal(adminDeferred.safeToApply, false);

const inactiveRoute = plan({
  catalogEntries: [catalog({ is_active: false })],
});
assert.equal(inactiveRoute.bucket, "unsafe_manual_review");
assert.match(inactiveRoute.reasons.join(" "), /inactive or non-assignable/);

const nonAssignableRoute = plan({
  catalogEntries: [catalog({ is_assignable: false })],
});
assert.equal(nonAssignableRoute.bucket, "unsafe_manual_review");
assert.match(nonAssignableRoute.reasons.join(" "), /inactive or non-assignable/);

assert.equal(
  plan({ row: { final_classification: "checking_only" } }).bucket,
  "no_action",
);
assert.equal(
  plan({ row: { final_classification: "not_an_issue" } }).bucket,
  "no_action",
);

const alreadyLinked = plan({
  learningItemLinks: [
    {
      id: "link-1",
      learning_item_id: "learning-item-1",
      writing_issue_id: "issue-1",
      link_role: "origin",
    },
  ],
});
assert.equal(alreadyLinked.bucket, "already_repaired");
assert.equal(alreadyLinked.proposedMutations.length, 0);

const partialEvidence = plan({
  learningItemEvidence: [
    {
      id: "evidence-1",
      learning_item_id: "learning-item-1",
      writing_issue_id: "issue-1",
      evidence_type: "incorrect_use",
      source_context: "finalised_issue_outcome",
    },
  ],
});
assert.equal(partialEvidence.bucket, "unsafe_manual_review");
assert.match(partialEvidence.reasons.join(" "), /without an issue link/);

const noRetry = plan({ attempts: [] });
assert.equal(noRetry.bucket, "no_action");
assert.match(noRetry.reasons.join(" "), /No child retry/);

const missingLineage = plan({
  row: { source_misspelling_instance_id: null },
});
assert.equal(missingLineage.bucket, "unsafe_manual_review");

const wrongState = plan({
  row: { issue_status: "child_responded" },
});
assert.equal(wrongState.bucket, "unsafe_manual_review");
assert.match(wrongState.reasons.join(" "), /not finalised/);

const conflictingParentLocal = plan({
  row: { micro_skill_key: "unknown" },
  candidateMappings: [
    parentLocalMapping(),
    parentLocalMapping({
      id: "mapping-2",
      micro_skill_key: "D4_OTHER_PARENT_LOCAL",
      updated_at: "2026-06-25T11:01:00.000Z",
    }),
  ],
  catalogEntries: [
    catalog({ micro_skill_key: "D4_PARENT_LOCAL", display_name: "Parent local" }),
    catalog({
      micro_skill_key: "D4_OTHER_PARENT_LOCAL",
      display_name: "Other parent local",
    }),
  ],
});
assert.equal(conflictingParentLocal.bucket, "unsafe_manual_review");
assert.match(conflictingParentLocal.reasons.join(" "), /Multiple conflicting/);

const summary = summarizeReturnedCorrectionRepairPlans([
  durable,
  parentLocal,
  adminDeferred,
  inactiveRoute,
  alreadyLinked,
  parentRecommendationOnly,
]);
assert.deepEqual(summary, {
  scanned: 6,
  noAction: 1,
  repairableDurableRoute: 1,
  repairableParentLocalBridge: 1,
  adminDeferred: 1,
  unsafeManualReview: 1,
  alreadyRepaired: 1,
});

const repairScript = readFileSync(
  "scripts/returned-correction-stage-d-repair.ts",
  "utf8",
);
assert.match(
  repairScript,
  /Apply mode requires --child-id plus either --submission-id or --writing-issue-id/,
  "Apply must require explicit scope.",
);
assert.match(repairScript, /dryRun: !args\.apply/, "Output must state dry-run mode.");
assert.match(
  repairScript,
  /mutationsApplied[\s\S]*summary[\s\S]*proposedMutations[\s\S]*rows/,
  "Output must include mutation counts, summary, proposed mutations, and per-row records.",
);
assert.doesNotMatch(
  repairScript,
  /maybeAward|gold_coin|word_treasure|daily_assignments|assignment_items|createServiceRoleClient|service-role/i,
  "Stage D repair script must not create rewards, daily assignments, or browser service-role paths.",
);

const appSources = [
  "app/courses/review/actions/review-completion-actions.ts",
  "app/courses/review/actions/returned-correction-route-helpers.ts",
  "app/courses/review/unified-spelling-review-table.tsx",
].map((path) => readFileSync(path, "utf8"));
for (const source of appSources) {
  assert.doesNotMatch(
    source,
    /SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient|service-role/i,
    "Browser/client review paths must not expose service-role access.",
  );
}

console.log("writing-engine-returned-correction-stage-d-repair-regression: ok");
