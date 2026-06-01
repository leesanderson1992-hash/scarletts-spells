import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  summarizeUnifiedSpellingReviewCompletion,
  type UnifiedSpellingReviewItem,
} from "../lib/writing-engine/persistence/unified-spelling-review-items";

const migrationPath =
  "supabase/migrations/20260601103000_add_spelling_canonical_mapping_recommendations.sql";
const repositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-recommendations.ts";
const completionHelperPath =
  "lib/writing-engine/persistence/unified-spelling-review-items.ts";
const reviewCompletionActionPath =
  "app/courses/review/actions/review-completion-actions.ts";
const candidateMappingRepositoryPath =
  "lib/writing-engine/persistence/spelling-candidate-mapping-repository.ts";
const canonicalMappingRepositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const mappingSourcePath =
  "lib/writing-engine/spelling/stage2c-mapping-source-boundary.ts";

assert.ok(existsSync(migrationPath), "Expected PCRM-B migration to exist.");
assert.ok(existsSync(repositoryPath), "Expected PCRM-B repository to exist.");

const migration = readFileSync(migrationPath, "utf8");
const repository = readFileSync(repositoryPath, "utf8");
const completionHelper = readFileSync(completionHelperPath, "utf8");
const reviewCompletionAction = readFileSync(reviewCompletionActionPath, "utf8");
const candidateMappingRepository = readFileSync(
  candidateMappingRepositoryPath,
  "utf8",
);
const canonicalMappingRepository = readFileSync(
  canonicalMappingRepositoryPath,
  "utf8",
);
const resolver = readFileSync(resolverPath, "utf8");
const mappingSource = readFileSync(mappingSourcePath, "utf8");

assert.match(
  migration,
  /create table if not exists public\.spelling_canonical_mapping_recommendations/,
  "PCRM-B must create a dedicated recommendation evidence table.",
);
assert.match(
  migration,
  /candidate_mapping_id uuid references public\.parent_verified_spelling_candidate_mappings/,
  "Recommendation evidence must link to parent-local candidate mapping evidence.",
);
assert.match(
  migration,
  /parent_verification_id uuid references public\.parent_verifications/,
  "Recommendation evidence must preserve parent verification lineage.",
);
assert.match(
  migration,
  /source_writing_issue_id uuid references public\.writing_issues/,
  "Recommendation evidence must preserve returned writing issue lineage.",
);
assert.match(
  migration,
  /source_correction_attempt_id uuid references public\.writing_issue_correction_attempts/,
  "Recommendation evidence must preserve returned correction attempt lineage.",
);
assert.match(
  migration,
  /source_suggestion_id uuid references public\.writing_issue_suggestions/,
  "Recommendation evidence must preserve suggestion lineage.",
);
assert.match(
  migration,
  /micro_skill_key text not null references public\.micro_skill_catalog/,
  "Recommendation evidence must reference existing micro-skill identity.",
);
assert.match(
  migration,
  /recommendation_status in \([\s\S]*'recommended'[\s\S]*'pending_admin_review'[\s\S]*'accepted'[\s\S]*'rejected'[\s\S]*'merged'[\s\S]*'duplicate'[\s\S]*'superseded'/,
  "Recommendation evidence must model review statuses independently.",
);
assert.match(
  migration,
  /spelling_canonical_mapping_recommendations_open_candidate_idx/,
  "Recommendation evidence must support idempotency by candidate mapping.",
);
assert.match(
  migration,
  /spelling_canonical_mapping_recommendations_open_source_idx/,
  "Recommendation evidence must support idempotency by source spelling pair.",
);
assert.match(
  migration,
  /spelling_canonical_mapping_recommendations_open_event_idx/,
  "Recommendation evidence must support idempotency by reviewed source event.",
);
assert.match(
  migration,
  /grant select, insert on public\.spelling_canonical_mapping_recommendations to authenticated/,
  "Parents should only get read/insert privileges on recommendation evidence.",
);
assert.doesNotMatch(
  migration,
  /grant\s+(?:select,\s*)?insert,\s*update|grant[\s\S]*delete on public\.spelling_canonical_mapping_recommendations to authenticated/i,
  "Parents must not be granted update/delete over recommendation review status.",
);
assert.match(
  migration,
  /auth\.uid\(\) = parent_user_id/,
  "Recommendation evidence RLS must be parent scoped.",
);
assert.match(
  migration,
  /auth\.uid\(\) = parent_user_id[\s\S]*recommendation_status in \('recommended', 'pending_admin_review'\)[\s\S]*canonical_mapping_id is null[\s\S]*reviewed_by_admin_user_id is null[\s\S]*reviewed_by_admin_email is null[\s\S]*reviewed_at is null[\s\S]*review_note is null[\s\S]*duplicate_of_recommendation_id is null[\s\S]*merge_target_recommendation_id is null[\s\S]*superseded_by_recommendation_id is null/,
  "Parent insert RLS must prevent forged admin-reviewed recommendation state.",
);
assert.match(
  migration,
  /tg_op = 'INSERT'[\s\S]*auth\.uid\(\) is not null[\s\S]*auth\.uid\(\) = new\.parent_user_id[\s\S]*new\.recommendation_status not in \('recommended', 'pending_admin_review'\)[\s\S]*Parent-created canonical mapping recommendations cannot start in admin-reviewed status/,
  "Parent insert trigger must reject admin-reviewed statuses.",
);
assert.match(
  migration,
  /new\.canonical_mapping_id is not null[\s\S]*new\.reviewed_by_admin_user_id is not null[\s\S]*new\.reviewed_by_admin_email is not null[\s\S]*new\.reviewed_at is not null[\s\S]*new\.review_note is not null[\s\S]*new\.duplicate_of_recommendation_id is not null[\s\S]*new\.merge_target_recommendation_id is not null[\s\S]*new\.superseded_by_recommendation_id is not null[\s\S]*Parent-created canonical mapping recommendations cannot include admin curation fields/,
  "Parent insert trigger must reject canonical/admin curation fields.",
);
assert.match(
  migration,
  /from public\.children[\s\S]*where id = new\.child_id[\s\S]*parent_user_id = new\.parent_user_id/,
  "Recommendation evidence must verify child ownership.",
);
assert.match(
  migration,
  /from public\.task_submissions[\s\S]*where id = new\.task_submission_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate task submission scope.",
);
assert.match(
  migration,
  /from public\.writing_samples[\s\S]*where id = new\.writing_sample_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate writing sample scope.",
);
assert.match(
  migration,
  /from public\.misspelling_instances[\s\S]*where id = new\.source_misspelling_instance_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate misspelling instance scope.",
);
assert.match(
  migration,
  /from public\.writing_issues[\s\S]*where id = new\.source_writing_issue_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate writing issue scope.",
);
assert.match(
  migration,
  /from public\.writing_issue_correction_attempts[\s\S]*where id = new\.source_correction_attempt_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id[\s\S]*new\.source_writing_issue_id is null[\s\S]*writing_issue_id = new\.source_writing_issue_id/,
  "Recommendation evidence must validate correction attempt scope and issue lineage.",
);
assert.match(
  migration,
  /from public\.parent_verifications[\s\S]*where id = new\.parent_verification_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate parent verification scope.",
);
assert.match(
  migration,
  /from public\.writing_issue_suggestions[\s\S]*where id = new\.source_suggestion_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate suggestion scope.",
);
assert.match(
  migration,
  /from public\.parent_verified_spelling_candidate_mappings[\s\S]*where id = new\.candidate_mapping_id[\s\S]*parent_user_id = new\.parent_user_id[\s\S]*child_id = new\.child_id/,
  "Recommendation evidence must validate parent-local candidate mapping scope.",
);
assert.match(
  migration,
  /mastery_domain_key <> 'D4'[\s\S]*is_active is not true[\s\S]*is_assignable is not true/,
  "Recommendations must require an active assignable D4 micro-skill.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.micro_skill_catalog\b/i,
  "PCRM-B must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.spelling_canonical_mappings\b/i,
  "PCRM-B parent recommendation storage must not write canonical mapping truth.",
);

assert.match(repository, /import "server-only"/, "Repository must be server-only.");
assert.match(
  repository,
  /spelling_canonical_mapping_recommendations/,
  "Repository must read/write the recommendation evidence table.",
);
assert.match(
  repository,
  /resolver_visible: false/,
  "Repository-created recommendation metadata must preserve resolver non-effect.",
);
assert.match(
  repository,
  /insertPendingAdminReview/,
  "Repository must expose a narrow pending-admin-review insert path.",
);
assert.doesNotMatch(
  repository,
  /spelling_canonical_mappings|createSpellingCanonicalMappingAdmin|micro_skill_catalog/,
  "Recommendation repository must not write canonical truth or catalog truth.",
);
assert.doesNotMatch(
  repository,
  /\.from\("parent_verified_spelling_candidate_mappings"\)[\s\S]*\.update\(/,
  "Recommendation repository must not mutate parent-local candidate mapping status.",
);

const promotedRows = [
  {
    id: "local-promoted-row",
    source: "current",
    state: "locally_promoted",
    categorisationStatus: "parent_local_promoted",
  },
] as unknown as UnifiedSpellingReviewItem[];
const promotedSummary = summarizeUnifiedSpellingReviewCompletion(promotedRows);
assert.equal(
  promotedSummary.canComplete,
  true,
  "Parent-local promoted rows must remain completion-safe.",
);

const pendingRows = [
  {
    id: "local-pending-row",
    source: "current",
    state: "pending_parent_review",
    categorisationStatus: "parent_local_pending",
  },
] as unknown as UnifiedSpellingReviewItem[];
const pendingSummary = summarizeUnifiedSpellingReviewCompletion(pendingRows);
assert.equal(
  pendingSummary.canComplete,
  false,
  "Parent-local pending rows must still block completion.",
);

assert.doesNotMatch(
  `${completionHelper}\n${reviewCompletionAction}`,
  /spelling_canonical_mapping_recommendations|recommendation_status|pending_admin_review/,
  "Completion gating must not consult recommendation/admin-review evidence.",
);
assert.match(
  completionHelper,
  /row\.categorisationStatus === "parent_local_pending"/,
  "Completion gating must continue to block pending parent-local mapping.",
);
assert.match(
  completionHelper,
  /candidateMapping\?\.candidate_status === "parent_local_promoted"/,
  "Read model must continue to recognize parent-local promoted mappings.",
);
assert.doesNotMatch(
  candidateMappingRepository,
  /spelling_canonical_mapping_recommendations|recommendation_status/,
  "Candidate mapping repository must remain independent from recommendation status.",
);
assert.doesNotMatch(
  canonicalMappingRepository,
  /spelling_canonical_mapping_recommendations|recommendation_status/,
  "Canonical mapping writes must remain independent from recommendation status.",
);
assert.doesNotMatch(
  `${resolver}\n${mappingSource}`,
  /spelling_canonical_mapping_recommendations|recommendation_status|pending_admin_review/,
  "Resolver code must not consume recommendation evidence.",
);

console.log("writing-engine-pcrm-recommendation-evidence-regression: ok");
