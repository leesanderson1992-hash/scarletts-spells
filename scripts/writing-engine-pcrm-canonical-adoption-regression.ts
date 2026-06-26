import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260612103000_add_pcrm_canonical_adoption_rpc.sql";
const normalizationHardeningMigrationPath =
  "supabase/migrations/20260626120000_harden_pcrm_adoption_normalization_version.sql";
const repositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const adoptionActionPath =
  "app/admin/canonical-recommendations/adoption-actions.ts";
const curationActionPath = "app/admin/canonical-recommendations/actions.ts";
const rowPath =
  "app/admin/canonical-recommendations/admin-recommendation-row.tsx";
const pagePath = "app/admin/canonical-recommendations/page.tsx";
const resolverPriorityPath = "app/courses/review/resolver-visible-priority.ts";
const reviewWorkPagePath = "app/courses/review/[submissionId]/page.tsx";

for (const path of [
  migrationPath,
  normalizationHardeningMigrationPath,
  repositoryPath,
  adoptionActionPath,
  curationActionPath,
  rowPath,
  pagePath,
]) {
  assert.ok(existsSync(path), `Expected ${path} to exist.`);
}

const migration = readFileSync(migrationPath, "utf8");
const normalizationHardeningMigration = readFileSync(
  normalizationHardeningMigrationPath,
  "utf8",
);
const combinedMigration = `${migration}\n${normalizationHardeningMigration}`;
const repository = readFileSync(repositoryPath, "utf8");
const adoptionAction = readFileSync(adoptionActionPath, "utf8");
const curationAction = readFileSync(curationActionPath, "utf8");
const row = readFileSync(rowPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const resolverPriority = readFileSync(resolverPriorityPath, "utf8");
const reviewWorkPage = readFileSync(reviewWorkPagePath, "utf8");

assert.match(
  combinedMigration,
  /20260626120000_harden_pcrm_adoption_normalization_version|adopt_spelling_canonical_mapping_recommendation_admin/,
  "PCRM-G normalization-version hardening must use a unique forward migration that replaces only the adoption RPC.",
);
assert.doesNotMatch(
  normalizationHardeningMigration,
  /\balter\s+table\b|\bcreate\s+index\b|\bdrop\s+constraint\b/i,
  "PCRM-G normalization-version hardening migration must replace only the adoption RPC and grants.",
);
assert.match(
  combinedMigration,
  /20260612103000|adopt_spelling_canonical_mapping_recommendation_admin/,
  "PCRM-G must use a unique forward migration with an adoption RPC.",
);
assert.match(
  combinedMigration,
  /source_recommendation_id uuid references public\.spelling_canonical_mapping_recommendations\(id\)/,
  "PCRM-G must preserve source recommendation lineage as first-class schema.",
);
assert.match(
  combinedMigration,
  /source_candidate_mapping_id uuid references public\.parent_verified_spelling_candidate_mappings\(id\)[\s\S]*source_parent_verification_id uuid references public\.parent_verifications\(id\)/,
  "PCRM-G must preserve candidate mapping and parent verification lineage where available.",
);
assert.match(
  combinedMigration,
  /'pcrm_adopted'/,
  "PCRM-G must add a canonical mapping event for PCRM adoption/linking.",
);
assert.match(
  combinedMigration,
  /for update[\s\S]*recommendation_status <> 'accepted'/,
  "PCRM-G RPC must lock the recommendation and only adopt accepted evidence.",
);
assert.match(
  combinedMigration,
  /canonical_mapping_id is not null[\s\S]*already linked/,
  "PCRM-G RPC must not independently re-adopt already linked evidence.",
);
assert.match(
  combinedMigration,
  /duplicate_of_recommendation_id[\s\S]*merge_target_recommendation_id[\s\S]*superseded_by_recommendation_id[\s\S]*follow its target row/,
  "Duplicate, merged, or superseded PCRM evidence must not be independently adoptable.",
);
assert.match(
  combinedMigration,
  /mastery_domain_key = 'D4'[\s\S]*is_active = true[\s\S]*is_assignable = true/,
  "PCRM-G adoption must validate an active assignable D4 micro-skill.",
);
assert.match(
  combinedMigration,
  /same misspelling has a different active correction/,
  "PCRM-G must block same-misspelling/different-correction conflicts.",
);
assert.match(
  combinedMigration,
  /exact pair has a different active micro-skill/,
  "PCRM-G must block same-pair/different-micro-skill conflicts.",
);
assert.match(
  combinedMigration,
  /mapping_status <> 'active'[\s\S]*disabled, deprecated, or superseded/,
  "PCRM-G must block adoption over disabled/deprecated/superseded mappings.",
);
assert.match(
  combinedMigration,
  /correct_spelling_normalized = v_recommendation\.correct_spelling_normalized[\s\S]*dialect_code = v_dialect_code[\s\S]*normalization_version = v_normalization_version[\s\S]*mapping_status <> 'active'/,
  "PCRM-G inactive exact-pair blocking must be scoped by normalization version.",
);
assert.match(
  combinedMigration,
  /correct_spelling_normalized <> v_recommendation\.correct_spelling_normalized[\s\S]*dialect_code = v_dialect_code[\s\S]*normalization_version = v_normalization_version[\s\S]*mapping_status = 'active'/,
  "PCRM-G same-misspelling/different-correction blocking must be scoped by normalization version.",
);
assert.match(
  combinedMigration,
  /correct_spelling_normalized = v_recommendation\.correct_spelling_normalized[\s\S]*dialect_code = v_dialect_code[\s\S]*normalization_version = v_normalization_version[\s\S]*mapping_status = 'active'[\s\S]*order by created_at[\s\S]*limit 1[\s\S]*for update/,
  "PCRM-G existing exact-pair link lookup must be scoped by normalization version.",
);
assert.match(
  combinedMigration,
  /insert into public\.spelling_canonical_mappings[\s\S]*resolver_visible[\s\S]*false/,
  "PCRM-G may create canonical mapping truth but must keep resolver visibility disabled.",
);
assert.match(
  combinedMigration,
  /insert into public\.spelling_canonical_mapping_events[\s\S]*'created'[\s\S]*insert into public\.spelling_canonical_mapping_events[\s\S]*'pcrm_adopted'/,
  "PCRM-G must audit both created mappings and PCRM adoption/link events.",
);
assert.match(
  combinedMigration,
  /update public\.spelling_canonical_mapping_recommendations[\s\S]*canonical_mapping_id = v_mapping_id/,
  "PCRM-G must set canonical_mapping_id only after canonical mapping create/link succeeds.",
);
assert.match(
  combinedMigration,
  /grant execute on function public\.adopt_spelling_canonical_mapping_recommendation_admin[\s\S]*to service_role/,
  "PCRM-G adoption RPC must be service-role executable.",
);
assert.doesNotMatch(
  combinedMigration,
  /grant execute on function public\.adopt_spelling_canonical_mapping_recommendation_admin[\s\S]*to authenticated/,
  "PCRM-G adoption RPC must not be directly executable by authenticated users.",
);
assert.doesNotMatch(
  combinedMigration,
  /\b(update|insert into|delete from)\s+public\.micro_skill_catalog\b/i,
  "PCRM-G must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  combinedMigration,
  /resolver_visibility_status\s*=\s*'visible'|new_resolver_visibility_status\s*=\s*'visible'|p_new_resolver_visibility_status/,
  "PCRM-G must not enable resolver visibility.",
);

assert.match(
  repository,
  /adoptSpellingCanonicalMappingRecommendationAdmin/,
  "Repository must expose a server-only PCRM adoption wrapper.",
);
assert.match(
  repository,
  /adopt_spelling_canonical_mapping_recommendation_admin/,
  "Repository wrapper must call the PCRM adoption RPC.",
);
assert.match(
  repository,
  /resolver_visible:\s*false[\s\S]*resolver_visibility_status:\s*"hidden"/,
  "Repository wrapper must preserve resolver non-effect metadata.",
);
assert.doesNotMatch(
  repository,
  /enableResolverVisibilityForCanonicalMappingAdmin\(\{[\s\S]*adoptSpellingCanonicalMappingRecommendationAdmin/,
  "PCRM adoption must not call resolver visibility enablement.",
);

const requireAdminIndex = adoptionAction.indexOf("await requireAdminUser()");
const adoptIndex = adoptionAction.indexOf(
  "await adoptSpellingCanonicalMappingRecommendationAdmin",
);
const importIndex = adoptionAction.indexOf(
  "adoptSpellingCanonicalMappingRecommendationAdmin",
);
assert.ok(
  importIndex >= 0 && requireAdminIndex >= 0 && adoptIndex > requireAdminIndex,
  "PCRM-G adoption action must authorize admin before calling service-role adoption.",
);
assert.match(
  adoptionAction,
  /adoption_note[\s\S]*if \(!recommendationId \|\| !note\)/,
  "PCRM-G adoption action must server-enforce an adoption note.",
);
assert.match(
  row,
  /name="adoption_note"[\s\S]*required/,
  "PCRM-G adoption UI must require an adoption note.",
);
assert.match(
  adoptionAction,
  /Resolver visibility remains disabled/,
  "PCRM-G success copy must state resolver visibility remains disabled.",
);
assert.doesNotMatch(
  adoptionAction,
  /enableResolverVisibilityForCanonicalMappingAdmin|disableResolverVisibilityForCanonicalMappingAdmin/,
  "PCRM-G adoption action must not enable or disable resolver visibility.",
);

assert.match(
  curationAction,
  /canonical_mapping_id:\s*null/,
  "PCRM-D accept evidence only action must remain evidence-only.",
);
assert.match(
  row,
  /currentStatus === "accepted" && !canonicalMappingId/,
  "Admin UI must expose adoption only for accepted unlinked recommendations.",
);
assert.match(
  row,
  /Adopt as canonical mapping[\s\S]*Resolver visibility remains\s+disabled until separately enabled/,
  "Admin UI copy must separate adoption from resolver visibility.",
);
assert.match(
  page,
  /canonical_mapping_id/,
  "Admin page must read canonical_mapping_id to suppress duplicate adoption.",
);

assert.doesNotMatch(
  `${resolverPriority}\n${reviewWorkPage}`,
  /adopt_spelling_canonical_mapping_recommendation_admin|pcrm_adopted|adoption_note/,
  "PCRM-G must not change resolver runtime or parent Review Work behavior.",
);

console.log("writing-engine-pcrm-canonical-adoption-regression: ok");
