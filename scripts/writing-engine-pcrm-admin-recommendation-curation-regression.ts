import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const actionPath = "app/admin/canonical-recommendations/actions.ts";
const rowPath = "app/admin/canonical-recommendations/admin-recommendation-row.tsx";
const pagePath = "app/admin/canonical-recommendations/page.tsx";
const recommendationRepositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-recommendations.ts";
const completionHelperPath =
  "lib/writing-engine/persistence/unified-spelling-review-items.ts";
const reviewCompletionActionPath =
  "app/courses/review/actions/review-completion-actions.ts";
const catalogReviewActionPath = "app/admin/catalog-review/actions.ts";
const catalogReviewPagePath = "app/admin/catalog-review/page.tsx";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const mappingSourcePath =
  "lib/writing-engine/spelling/stage2c-mapping-source-boundary.ts";
const canonicalMappingRepositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const parentCandidateMappingRepositoryPath =
  "lib/writing-engine/persistence/spelling-candidate-mapping-repository.ts";

assert.ok(existsSync(actionPath), "PCRM-D admin action must exist.");
assert.ok(existsSync(rowPath), "PCRM-D admin row UI must exist.");
assert.ok(existsSync(pagePath), "PCRM-D admin page must exist.");

const action = readFileSync(actionPath, "utf8");
const row = readFileSync(rowPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const recommendationRepository = readFileSync(
  recommendationRepositoryPath,
  "utf8",
);
const completionHelper = readFileSync(completionHelperPath, "utf8");
const reviewCompletionAction = readFileSync(reviewCompletionActionPath, "utf8");
const catalogReviewAction = readFileSync(catalogReviewActionPath, "utf8");
const catalogReviewPage = readFileSync(catalogReviewPagePath, "utf8");
const resolver = readFileSync(resolverPath, "utf8");
const mappingSource = readFileSync(mappingSourcePath, "utf8");
const canonicalMappingRepository = readFileSync(
  canonicalMappingRepositoryPath,
  "utf8",
);
const candidateMappingRepository = readFileSync(
  parentCandidateMappingRepositoryPath,
  "utf8",
);
const completionSummarySection = completionHelper.slice(
  completionHelper.indexOf("export function summarizeUnifiedSpellingReviewCompletion"),
  completionHelper.indexOf("function parseMetadata"),
);

const requireAdminIndex = action.indexOf("await requireAdminUser()");
const serviceRoleIndex = action.indexOf("createServiceRoleClient()");
assert.ok(
  requireAdminIndex >= 0 && serviceRoleIndex > requireAdminIndex,
  "PCRM-D admin action must authorize before creating or using service-role Supabase.",
);

for (const decision of [
  "accepted",
  "rejected",
  "duplicate",
  "merged",
  "superseded",
]) {
  assert.match(
    action,
    new RegExp(`"${decision}"`),
    `PCRM-D action must support ${decision} decisions.`,
  );
  assert.match(
    row,
    new RegExp(`value="${decision}"`),
    `PCRM-D UI must expose ${decision} decisions.`,
  );
}

assert.match(
  page,
  /await requireAdminUser\(\)/,
  "PCRM-D page must require admin access before reading recommendation evidence.",
);
assert.match(
  page,
  /spelling_canonical_mapping_recommendations/,
  "PCRM-D page must read PCRM recommendation evidence.",
);
assert.match(
  action,
  /\.from\("spelling_canonical_mapping_recommendations"\)[\s\S]*\.update\(\{/,
  "PCRM-D action must update recommendation evidence.",
);
assert.match(
  action,
  /recommendation_status: decision[\s\S]*review_note[\s\S]*reviewed_at[\s\S]*reviewed_by_admin_user_id[\s\S]*reviewed_by_admin_email/,
  "PCRM-D action must write audited admin status fields.",
);
assert.match(
  action,
  /duplicate_of_recommendation_id:[\s\S]*merge_target_recommendation_id:[\s\S]*superseded_by_recommendation_id:/,
  "PCRM-D action must preserve duplicate/merge/supersession target links.",
);
assert.match(
  action,
  /recommendation\.recommendation_status !== "recommended"[\s\S]*recommendation\.recommendation_status !== "pending_admin_review"/,
  "PCRM-D action must only curate open recommendations.",
);
assert.match(
  action,
  /canonical_mapping_id: null/,
  "PCRM-D must not link or create canonical mapping storage in this slice.",
);
assert.match(
  action,
  /resolver_visible: false/,
  "PCRM-D audit metadata must preserve resolver non-effect.",
);
assert.match(
  row,
  /Accept records evidence only[\s\S]*resolver visibility remains separate\./,
  "PCRM-D UI copy must keep acceptance evidence-only and resolver visibility separate.",
);
assert.doesNotMatch(
  action,
  /createSpellingCanonicalMappingAdmin|create_spelling_canonical_mapping_admin|\.from\("spelling_canonical_mappings"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "PCRM-D action must not write canonical mapping truth.",
);
assert.doesNotMatch(
  action,
  /\.from\("micro_skill_catalog"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "PCRM-D action must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  action,
  /\.from\("parent_verified_spelling_candidate_mappings"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "PCRM-D action must not mutate parent-local candidate mappings.",
);
assert.doesNotMatch(
  `${catalogReviewAction}\n${catalogReviewPage}`,
  /canonical-recommendations|curateSpellingCanonicalRecommendation/,
  "No matching skill catalog-review route must remain separate from PCRM-D recommendations.",
);
assert.doesNotMatch(
  `${completionSummarySection}\n${reviewCompletionAction}`,
  /spelling_canonical_mapping_recommendations|recommendation_status/,
  "Completion gating must not consult PCRM-D recommendation curation status.",
);
assert.doesNotMatch(
  `${resolver}\n${mappingSource}`,
  /spelling_canonical_mapping_recommendations|recommendation_status|pending_admin_review|accepted|duplicate|merged|superseded/,
  "Resolver code must not consume PCRM recommendation evidence or PCRM-D statuses.",
);
assert.doesNotMatch(
  recommendationRepository,
  /\.update\(\{[\s\S]*recommendation_status/,
  "Parent-facing PCRM repository must remain free of admin curation mutations.",
);
assert.doesNotMatch(
  canonicalMappingRepository,
  /spelling_canonical_mapping_recommendations|recommendation_status/,
  "Canonical mapping writes must remain independent from PCRM-D recommendation status.",
);
assert.doesNotMatch(
  candidateMappingRepository,
  /spelling_canonical_mapping_recommendations|recommendation_status/,
  "Parent-local candidate mapping repository must remain independent from PCRM-D recommendation status.",
);

console.log("writing-engine-pcrm-admin-recommendation-curation-regression: ok");
