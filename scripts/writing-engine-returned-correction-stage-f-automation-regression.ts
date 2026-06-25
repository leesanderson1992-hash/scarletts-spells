import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildReturnedCorrectionDeferredRouteReplayPlan,
  type ReturnedCorrectionDeferredRouteReplayAdminDecision,
  type ReturnedCorrectionDeferredRouteReplayCanonicalMapping,
  type ReturnedCorrectionDeferredRouteReplayCatalogReviewCase,
} from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay";
import {
  projectReturnedCorrectionReplayRecommendation,
  type ReturnedCorrectionReplayRecommendationProjection,
} from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply";
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

function attempt(): ReturnedCorrectionRouteBridgeAttempt {
  return {
    id: "attempt-1",
    task_submission_id: "returned-submission-1",
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

function recommendation(
  inputPlan: ReturnType<typeof plan>,
  row: ReturnedCorrectionRepairIssue = issue(),
) {
  return projectReturnedCorrectionReplayRecommendation({
    issue: row,
    plan: inputPlan,
  }) as ReturnedCorrectionReplayRecommendationProjection | null;
}

const canonicalReplay = plan({ canonicalMappings: [canonicalMapping()] });
const canonicalRecommendation = recommendation(canonicalReplay);
assert.equal(canonicalReplay.bucket, "replayable_canonical_mapping");
assert.equal(canonicalRecommendation?.replay_status, "pending");
assert.equal(canonicalRecommendation?.canonical_mapping_id, "canonical-1");
assert.equal(canonicalRecommendation?.route_source, "canonical_mapping");

const linkedSkillReplay = plan({ adminDecisions: [adminDecision()] });
const linkedSkillRecommendation = recommendation(linkedSkillReplay);
assert.equal(linkedSkillReplay.bucket, "replayable_admin_decision");
assert.equal(linkedSkillRecommendation?.replay_status, "pending");
assert.equal(linkedSkillRecommendation?.admin_decision_id, "decision-1");

const openCaseOnly = plan({});
assert.equal(openCaseOnly.bucket, "waiting_for_route");
assert.equal(recommendation(openCaseOnly), null);

const inactiveCatalog = plan({
  canonicalMappings: [canonicalMapping()],
  catalogEntries: [catalog({ is_active: false })],
});
assert.equal(inactiveCatalog.bucket, "unsafe_manual_review");
assert.equal(recommendation(inactiveCatalog)?.replay_status, "blocked");

const nonAssignableCatalog = plan({
  canonicalMappings: [canonicalMapping()],
  catalogEntries: [catalog({ is_assignable: false })],
});
assert.equal(nonAssignableCatalog.bucket, "unsafe_manual_review");
assert.equal(recommendation(nonAssignableCatalog)?.replay_status, "blocked");

assert.equal(
  recommendation(
    plan({
      row: { final_classification: "checking_only" },
      canonicalMappings: [canonicalMapping()],
    }),
  ),
  null,
);
assert.equal(
  recommendation(
    plan({
      row: { final_classification: "not_an_issue" },
      canonicalMappings: [canonicalMapping()],
    }),
  ),
  null,
);

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
assert.equal(recommendation(alreadyLinked)?.replay_status, "superseded");

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
assert.equal(recommendation(conflictingCanonical), null);

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
  ] as ReturnedCorrectionRepairEvidence[],
});
assert.equal(partialEvidence.bucket, "unsafe_manual_review");
assert.equal(recommendation(partialEvidence), null);

assert.equal(
  canonicalRecommendation?.route_fingerprint,
  recommendation(canonicalReplay)?.route_fingerprint,
  "Recommendation projection must be idempotent for the same route source.",
);

const sweepScript = readFileSync(
  "scripts/returned-correction-stage-f-sweep.ts",
  "utf8",
);
assert.match(sweepScript, /dryRun: !args\.upsertRecommendations/);
assert.match(sweepScript, /learningItemApply: false/);
assert.match(sweepScript, /--upsert-recommendations/);
assert.doesNotMatch(sweepScript, /applyReturnedCorrectionDeferredRouteReplayPlan/);

const replayScript = readFileSync(
  "scripts/returned-correction-stage-f-deferred-route-replay.ts",
  "utf8",
);
assert.match(replayScript, /applyReturnedCorrectionDeferredRouteReplayPlan/);
assert.doesNotMatch(
  replayScript,
  /maybeAward|spelling_reward_|daily_assignments|assignment_items/i,
);

const applyHelper = readFileSync(
  "lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply.ts",
  "utf8",
);
assert.doesNotMatch(
  applyHelper,
  /maybeAward|spelling_reward_|daily_assignments|assignment_items|mastery_history|golden_bar/i,
  "Stage F apply helper must not create rewards, mastery, or daily assignment writes.",
);
assert.match(applyHelper, /onConflict: "writing_issue_id,route_fingerprint"/);

const migration = readFileSync(
  "supabase/migrations/20260625120000_add_returned_correction_replay_recommendations.sql",
  "utf8",
);
assert.match(migration, /enable row level security/i);
assert.match(migration, /grant all on table public\.returned_correction_replay_recommendations to service_role/i);
assert.doesNotMatch(migration, /grant .* authenticated/i);
assert.doesNotMatch(migration, /create policy/i);

const adminAction = readFileSync("app/admin/catalog-review/actions.ts", "utf8");
assert.match(adminAction, /surfaceReturnedCorrectionReplayRecommendations/);
assert.match(adminAction, /triggerSource: "admin_hook"/);

const canonicalPage = readFileSync("app/admin/canonical-mappings/page.tsx", "utf8");
assert.match(canonicalPage, /Deferred learning replay available/);
assert.match(canonicalPage, /Safe to apply manually/);
assert.doesNotMatch(canonicalPage, /SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient|service-role/i);

const canonicalReadModel = readFileSync(
  "app/admin/canonical-mappings/read-model.ts",
  "utf8",
);
assert.match(canonicalReadModel, /server-only/);
assert.match(canonicalReadModel, /returned_correction_replay_recommendations/);

console.log("writing-engine-returned-correction-stage-f-automation-regression: ok");
