import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildReturnedCorrectionDeferredRouteReplayPlan,
  summarizeReturnedCorrectionDeferredRouteReplayPlans,
  type ReturnedCorrectionDeferredRouteReplayAdminDecision,
  type ReturnedCorrectionDeferredRouteReplayCanonicalMapping,
  type ReturnedCorrectionDeferredRouteReplayCatalogReviewCase,
} from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay";
import type {
  ReturnedCorrectionRepairCatalogEntry,
  ReturnedCorrectionRepairEvidence,
  ReturnedCorrectionRepairIssue,
  ReturnedCorrectionRepairLearningLink,
} from "../lib/writing-engine/persistence/returned-correction-repair";
import type { ReturnedCorrectionRouteBridgeAttempt } from "../lib/writing-engine/persistence/returned-correction-route-bridge";

const parentUserId = "parent-1";
const childId = "child-1";

function issue(
  overrides: Partial<ReturnedCorrectionRepairIssue> = {},
): ReturnedCorrectionRepairIssue {
  return {
    id: "issue-1",
    child_id: childId,
    parent_user_id: parentUserId,
    task_submission_id: "submission-1",
    issue_status: "finalised",
    final_classification: "concept_gap",
    observed_text: "goviment",
    approved_replacement: "government",
    suggested_replacement: "government",
    micro_skill_key: "unknown",
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
    micro_skill_key: "D4_GOVERNMENT",
    mastery_domain_key: "spelling",
    skill_family_key: "common_words",
    skill_cluster_key: null,
    practice_route: "word_practice",
    display_name: "Government",
    is_active: true,
    is_assignable: true,
    ...overrides,
  };
}

function canonicalMapping(
  overrides: Partial<ReturnedCorrectionDeferredRouteReplayCanonicalMapping> = {},
): ReturnedCorrectionDeferredRouteReplayCanonicalMapping {
  return {
    id: "canonical-1",
    misspelling_normalized: "goviment",
    correct_spelling_normalized: "government",
    micro_skill_key: "D4_GOVERNMENT",
    mapping_status: "active",
    source_case_id: "case-1",
    ...overrides,
  };
}

function reviewCase(
  overrides: Partial<ReturnedCorrectionDeferredRouteReplayCatalogReviewCase> = {},
): ReturnedCorrectionDeferredRouteReplayCatalogReviewCase {
  return {
    id: "case-1",
    source_misspelling_instance_id: "misspelling-1",
    case_status: "open",
    misspelling_normalized: "goviment",
    correct_spelling_normalized: "government",
    ...overrides,
  };
}

function adminDecision(
  overrides: Partial<ReturnedCorrectionDeferredRouteReplayAdminDecision> = {},
): ReturnedCorrectionDeferredRouteReplayAdminDecision {
  return {
    id: "decision-1",
    case_id: "case-1",
    decision_type: "linked_existing_skill",
    new_status: "linked_existing_skill",
    linked_micro_skill_key: "D4_GOVERNMENT",
    canonical_mapping_id: null,
    ...overrides,
  };
}

function plan(input: {
  row?: Partial<ReturnedCorrectionRepairIssue>;
  attempts?: ReturnedCorrectionRouteBridgeAttempt[];
  catalogEntries?: ReturnedCorrectionRepairCatalogEntry[];
  catalogReviewCases?: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  canonicalMappings?: ReturnedCorrectionDeferredRouteReplayCanonicalMapping[];
  adminDecisions?: ReturnedCorrectionDeferredRouteReplayAdminDecision[];
  learningItemLinks?: ReturnedCorrectionRepairLearningLink[];
  learningItemEvidence?: ReturnedCorrectionRepairEvidence[];
}) {
  return buildReturnedCorrectionDeferredRouteReplayPlan({
    issue: issue(input.row),
    attempts: input.attempts ?? [attempt()],
    catalogEntries: input.catalogEntries ?? [catalog()],
    catalogReviewCases: input.catalogReviewCases ?? [reviewCase()],
    canonicalMappings: input.canonicalMappings ?? [],
    adminDecisions: input.adminDecisions ?? [],
    learningItemLinks: input.learningItemLinks ?? [],
    learningItemEvidence: input.learningItemEvidence ?? [],
  });
}

const canonicalReplay = plan({ canonicalMappings: [canonicalMapping()] });
assert.equal(canonicalReplay.bucket, "replayable_canonical_mapping");
assert.equal(canonicalReplay.safeToApply, true);
assert.deepEqual(canonicalReplay.proposedMutations, [
  {
    type: "attach_verified_route",
    writingIssueId: "issue-1",
    microSkillKey: "D4_GOVERNMENT",
    routeSource: "canonical_mapping",
    canonicalMappingId: "canonical-1",
    adminCaseId: "case-1",
  },
  {
    type: "create_or_strengthen_learning_item",
    writingIssueId: "issue-1",
    microSkillKey: "D4_GOVERNMENT",
    routeSource: "canonical_mapping",
    canonicalMappingId: "canonical-1",
    adminCaseId: "case-1",
  },
]);

const adminReplay = plan({ adminDecisions: [adminDecision()] });
assert.equal(adminReplay.bucket, "replayable_admin_decision");
assert.equal(adminReplay.safeToApply, true);
assert.equal(adminReplay.routeSupport.adminDecisionId, "decision-1");

const durableReplay = plan({
  row: { micro_skill_key: "D4_GOVERNMENT" },
  canonicalMappings: [],
  adminDecisions: [],
});
assert.equal(durableReplay.bucket, "replayable_durable_route");
assert.equal(durableReplay.safeToApply, true);

const fragileKnowledgeReplay = plan({
  row: { final_classification: "fragile_knowledge" },
  canonicalMappings: [canonicalMapping()],
});
assert.equal(fragileKnowledgeReplay.bucket, "replayable_canonical_mapping");

const transferFailureReplay = plan({
  row: { final_classification: "transfer_failure" },
  canonicalMappings: [canonicalMapping()],
});
assert.equal(transferFailureReplay.bucket, "replayable_canonical_mapping");

assert.equal(
  plan({
    row: { final_classification: "checking_only" },
    canonicalMappings: [canonicalMapping()],
  }).bucket,
  "skipped_non_learning_outcome",
);
assert.equal(
  plan({
    row: { final_classification: "not_an_issue" },
    canonicalMappings: [canonicalMapping()],
  }).bucket,
  "skipped_non_learning_outcome",
);

const waitingForRoute = plan({});
assert.equal(waitingForRoute.bucket, "waiting_for_route");
assert.match(waitingForRoute.reasons.join(" "), /waiting for active assignable/);

const inactiveCatalog = plan({
  canonicalMappings: [canonicalMapping()],
  catalogEntries: [catalog({ is_active: false })],
});
assert.equal(inactiveCatalog.bucket, "unsafe_manual_review");
assert.match(inactiveCatalog.reasons.join(" "), /inactive or non-assignable/);

const nonAssignableCatalog = plan({
  canonicalMappings: [canonicalMapping()],
  catalogEntries: [catalog({ is_assignable: false })],
});
assert.equal(nonAssignableCatalog.bucket, "unsafe_manual_review");
assert.match(nonAssignableCatalog.reasons.join(" "), /inactive or non-assignable/);

const conflictingCanonical = plan({
  canonicalMappings: [
    canonicalMapping(),
    canonicalMapping({ id: "canonical-2", micro_skill_key: "D4_OTHER" }),
  ],
  catalogEntries: [
    catalog(),
    catalog({ micro_skill_key: "D4_OTHER", display_name: "Other" }),
  ],
});
assert.equal(conflictingCanonical.bucket, "unsafe_manual_review");
assert.match(conflictingCanonical.reasons.join(" "), /Multiple active canonical/);

const conflictingAdmin = plan({
  adminDecisions: [
    adminDecision(),
    adminDecision({
      id: "decision-2",
      linked_micro_skill_key: "D4_OTHER",
    }),
  ],
  catalogEntries: [
    catalog(),
    catalog({ micro_skill_key: "D4_OTHER", display_name: "Other" }),
  ],
});
assert.equal(conflictingAdmin.bucket, "unsafe_manual_review");
assert.match(conflictingAdmin.reasons.join(" "), /Multiple conflicting admin/);

const alreadyLinked = plan({
  canonicalMappings: [canonicalMapping()],
  learningItemLinks: [
    {
      id: "link-1",
      learning_item_id: "learning-item-1",
      writing_issue_id: "issue-1",
      link_role: "origin",
    },
  ],
});
assert.equal(alreadyLinked.bucket, "already_linked");
assert.equal(alreadyLinked.proposedMutations.length, 0);

const partialEvidence = plan({
  canonicalMappings: [canonicalMapping()],
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

const noRetry = plan({ attempts: [], canonicalMappings: [canonicalMapping()] });
assert.equal(noRetry.bucket, "waiting_for_route");
assert.match(noRetry.reasons.join(" "), /No child retry/);

const missingLineage = plan({
  row: { source_misspelling_instance_id: null },
  canonicalMappings: [canonicalMapping()],
});
assert.equal(missingLineage.bucket, "unsafe_manual_review");

const wrongState = plan({
  row: { issue_status: "child_responded" },
  canonicalMappings: [canonicalMapping()],
});
assert.equal(wrongState.bucket, "unsafe_manual_review");
assert.match(wrongState.reasons.join(" "), /not finalised/);

const summary = summarizeReturnedCorrectionDeferredRouteReplayPlans([
  canonicalReplay,
  adminReplay,
  durableReplay,
  waitingForRoute,
  inactiveCatalog,
  alreadyLinked,
  plan({ row: { final_classification: "checking_only" } }),
]);
assert.deepEqual(summary, {
  scanned: 7,
  alreadyLinked: 1,
  waitingForRoute: 1,
  replayableViaCanonicalMapping: 1,
  replayableViaAdminDecision: 1,
  replayableViaDurableRoute: 1,
  unsafeManualReview: 1,
  skippedNonLearningOutcome: 1,
});

const replayScript = readFileSync(
  "scripts/returned-correction-stage-f-deferred-route-replay.ts",
  "utf8",
);
assert.match(replayScript, /dryRun: !args\.apply/, "Output must state dry-run mode.");
assert.match(
  replayScript,
  /Apply mode requires --writing-issue-id, --admin-case-id, --canonical-mapping-id, --submission-id, or --child-id plus --limit/,
  "Apply must require explicit focused scope.",
);
assert.match(
  replayScript,
  /mutationsApplied[\s\S]*summary[\s\S]*proposedMutations[\s\S]*rows/,
  "Output must include mutation counts, summary, proposed mutations, and per-row records.",
);
assert.doesNotMatch(
  replayScript,
  /maybeAward|spelling_reward_|daily_assignments|assignment_items|createServiceRoleClient|service-role/i,
  "Stage F replay script must not create rewards, daily assignments, or browser service-role paths.",
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

console.log("writing-engine-returned-correction-stage-f-replay-regression: ok");
