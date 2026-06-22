import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  validateSeedImportHiddenCanonicalAdoptionInput,
} from "../app/admin/seed-import-review/adoption-rules";

const migrationPath =
  "supabase/migrations/20260618120000_add_seed_import_hidden_canonical_adoption_rpc.sql";
const repositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const adoptionActionPath = "app/admin/seed-import-review/adoption-actions.ts";
const decisionActionPath = "app/admin/seed-import-review/actions.ts";
const pagePath = "app/admin/seed-import-review/page.tsx";
const smokePath =
  "scripts/writing-engine-seed-import-hidden-canonical-adoption-local-smoke.ts";
const packagePath = "package.json";
const seedStorageMigrationPath =
  "supabase/migrations/20260614120000_add_spelling_seed_import_storage.sql";
const resolverPriorityPath = "app/courses/review/resolver-visible-priority.ts";
const reviewWorkPagePath = "app/courses/review/[submissionId]/page.tsx";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";

for (const path of [
  migrationPath,
  repositoryPath,
  adoptionActionPath,
  decisionActionPath,
  pagePath,
  smokePath,
  packagePath,
  seedStorageMigrationPath,
]) {
  assert.ok(existsSync(path), `Expected ${path} to exist.`);
}

const migration = readFileSync(migrationPath, "utf8");
const repository = readFileSync(repositoryPath, "utf8");
const adoptionAction = readFileSync(adoptionActionPath, "utf8");
const decisionAction = readFileSync(decisionActionPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const smoke = readFileSync(smokePath, "utf8");
const packageJson = readFileSync(packagePath, "utf8");
const seedStorageMigration = readFileSync(seedStorageMigrationPath, "utf8");
const resolverPriority = readFileSync(resolverPriorityPath, "utf8");
const reviewWorkPage = readFileSync(reviewWorkPagePath, "utf8");
const resolver = readFileSync(resolverPath, "utf8");

assert.equal(
  validateSeedImportHiddenCanonicalAdoptionInput({
    rowId: "seed-row-1",
  }).ok,
  true,
  "Simplified adoption input should require a seed row id.",
);
assert.equal(
  validateSeedImportHiddenCanonicalAdoptionInput({
    rowId: "",
  }).ok,
  false,
  "Missing row id must be blocked.",
);

assert.match(
  migration,
  /20260618120000|adopt_seed_import_row_hidden_canonical_admin/,
  "Slice 4F must use a unique forward migration with a seed adoption RPC.",
);
assert.match(
  migration,
  /source_seed_import_row_id uuid references public\.spelling_seed_import_rows\(id\)/,
  "Slice 4F must add first-class seed-row lineage to mappings and events.",
);
assert.match(
  migration,
  /'seed_import_adopted'/,
  "Slice 4F must add a seed adoption/link canonical mapping event.",
);
assert.match(
  migration,
  /row_status <> 'nominated_for_canonical_adoption'/,
  "Only nominated seed import rows may be adopted.",
);
assert.match(
  migration,
  /canonical_mapping_id is not null[\s\S]*already linked/,
  "Already linked seed rows must not be re-adopted.",
);
assert.match(
  migration,
  /Duplicate, rejected, superseded, conflict-blocked, adopted, or manual-review seed rows cannot be adopted/,
  "Invalid source statuses must be explicitly blocked.",
);
assert.match(
  migration,
  /duplicate_of_seed_import_row_id is not null[\s\S]*follow its target row/,
  "Duplicate target lineage must not be adopted directly.",
);
assert.match(
  migration,
  /dry_run_bucket <> 'safe_for_candidate_review'/,
  "Adoption must be limited to implemented candidate-review import rows.",
);
assert.match(
  migration,
  /source_name[\s\S]*source_license_note[\s\S]*source_file_name[\s\S]*dry_run_report_sha256[\s\S]*source_dataset/,
  "Adoption must validate auditable source, dataset, license, file, report, batch, and row lineage.",
);
assert.match(
  migration,
  /misspelling_normalized[\s\S]*correct_spelling_normalized[\s\S]*normalized spelling pair/,
  "Adoption must validate a non-empty, different normalized spelling pair.",
);
assert.match(
  migration,
  /dialect_code[\s\S]*normalization_version[\s\S]*requires dialect and normalization version/,
  "Adoption must require dialect and normalization version.",
);
assert.match(
  migration,
  /jsonb_array_length\(coalesce\(v_row\.blocking_errors[\s\S]*canonical_conflict_ids/,
  "Adoption must block validation errors and unresolved canonical conflicts.",
);
assert.match(
  migration,
  /mastery_domain_key = 'D4'[\s\S]*is_active = true[\s\S]*is_assignable = true/,
  "Adoption must validate an active assignable D4 micro-skill.",
);
assert.match(
  migration,
  /mapping_status <> 'active'[\s\S]*disabled, deprecated, or superseded canonical mapping/,
  "Adoption must block disabled, deprecated, or superseded exact-pair mappings.",
);
assert.match(
  migration,
  /same misspelling has a different active correction/,
  "Adoption must block same-misspelling/different-correction conflicts.",
);
assert.match(
  migration,
  /resolver_visibility_status = 'visible'[\s\S]*existing resolver-visible canonical mapping/,
  "Adoption must block existing visible exact-pair mappings.",
);
assert.match(
  migration,
  /resolver_visibility_status <> 'hidden'[\s\S]*only link to an existing hidden canonical mapping/,
  "Adoption must only link to existing hidden mappings.",
);
assert.match(
  migration,
  /exact pair has a different active micro-skill/,
  "Adoption must block exact-pair/different-micro-skill conflicts.",
);
assert.match(
  migration,
  /insert into public\.spelling_canonical_mappings[\s\S]*resolver_visibility_status[\s\S]*'hidden'/,
  "New canonical mappings must be inserted as hidden.",
);
assert.match(
  migration,
  /insert into public\.spelling_canonical_mapping_events[\s\S]*'created'[\s\S]*insert into public\.spelling_canonical_mapping_events[\s\S]*'seed_import_adopted'/,
  "Adoption must audit created mappings and seed adoption/link events.",
);
assert.match(
  migration,
  /previous_resolver_visibility_status[\s\S]*new_resolver_visibility_status[\s\S]*null,[\s\S]*'hidden'/,
  "Created events must record null-to-hidden resolver visibility.",
);
assert.match(
  migration,
  /update public\.spelling_seed_import_rows[\s\S]*row_status = 'adopted_hidden_canonical'[\s\S]*canonical_mapping_id = v_mapping_id/,
  "Seed row status and canonical_mapping_id must update only after create/link succeeds.",
);
assert.match(
  migration,
  /status_reason = 'Adopted into hidden canonical mapping truth[\s\S]*Resolver visibility remains disabled/,
  "Seed row adoption metadata must keep resolver visibility disabled in operator copy.",
);
assert.match(
  migration,
  /grant execute on function public\.adopt_seed_import_row_hidden_canonical_admin[\s\S]*to service_role/,
  "Slice 4F adoption RPC must be service-role executable.",
);
assert.doesNotMatch(
  migration,
  /grant execute on function public\.adopt_seed_import_row_hidden_canonical_admin[\s\S]*to authenticated/,
  "Slice 4F adoption RPC must not be executable by authenticated users.",
);
assert.match(
  migration,
  /revoke all on table public\.spelling_seed_import_rows from anon, authenticated/,
  "Seed rows must keep anon/authenticated grants revoked.",
);
assert.match(
  seedStorageMigration,
  /revoke all on table public\.spelling_seed_import_rows from anon, authenticated/,
  "Original seed storage must remain service-role only.",
);
assert.doesNotMatch(
  migration,
  /\b(update|insert into|delete from)\s+public\.micro_skill_catalog\b/i,
  "Slice 4F must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  migration,
  /new_resolver_visibility_status,\s*'visible'|p_new_resolver_visibility_status|event_type,\s*'resolver_visibility_enabled'/,
  "Slice 4F must not enable resolver visibility or create resolver_visibility_enabled events.",
);

assert.match(
  repository,
  /adoptSeedImportRowHiddenCanonicalAdmin/,
  "Repository must expose a server-only seed adoption wrapper.",
);
assert.match(
  repository,
  /adopt_seed_import_row_hidden_canonical_admin/,
  "Repository wrapper must call the Slice 4F adoption RPC.",
);
assert.match(
  repository,
  /resolver_visible:\s*false[\s\S]*resolver_visibility_status:\s*"hidden"/,
  "Repository wrapper must preserve hidden resolver metadata.",
);
assert.doesNotMatch(
  repository,
  /enableResolverVisibilityForCanonicalMappingAdmin\(\{[\s\S]*adoptSeedImportRowHiddenCanonicalAdmin/,
  "Seed adoption must not call resolver visibility enablement.",
);

const requireAdminIndex = adoptionAction.indexOf("await requireAdminUser()");
const serviceRoleIndex = adoptionAction.indexOf("createServiceRoleClient()");
const adoptIndex = adoptionAction.indexOf(
  "await adoptSeedImportRowHiddenCanonicalAdmin",
);
assert.ok(
  requireAdminIndex >= 0 &&
    serviceRoleIndex > requireAdminIndex &&
    adoptIndex > serviceRoleIndex,
  "Slice 4F adoption action must authorize admin before service-role RPC use.",
);
assert.match(
  adoptionAction,
  /validateSeedImportReviewDecision[\s\S]*nominate_for_canonical_adoption[\s\S]*adoptSeedImportRowHiddenCanonicalAdmin/,
  "Simplified adoption must nominate when needed before calling the hidden-canonical RPC.",
);
assert.match(
  adoptionAction,
  /reviewNote: SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE[\s\S]*note: SEED_IMPORT_HIDDEN_CANONICAL_AUTO_NOTE/,
  "Simplified adoption must use the stable audit note for nomination and adoption.",
);
assert.match(
  adoptionAction,
  /Resolver visibility remains disabled/,
  "Slice 4F success copy must state resolver visibility remains disabled.",
);
assert.doesNotMatch(
  adoptionAction,
  /enableResolverVisibilityForCanonicalMappingAdmin|disableResolverVisibilityForCanonicalMappingAdmin/,
  "Slice 4F adoption action must not enable or disable resolver visibility.",
);
assert.doesNotMatch(
  decisionAction,
  /adoptSeedImportRowHiddenCanonicalAdmin|adopt_seed_import_row_hidden_canonical_admin|spelling_canonical_mappings/,
  "Status-only 4E.2 action must remain non-canonical.",
);

assert.match(
  page,
  /Adopt for canonical review[\s\S]*Reject/,
  "Admin UI must expose the simplified adopt/reject queue actions.",
);
assert.match(
  page,
  /\.not\("row_status", "in", "\(rejected,adopted_hidden_canonical\)"\)/,
  "Admin UI must hide rejected and adopted rows from the active queue.",
);
assert.match(
  page,
  /resolver visibility remains disabled/i,
  "Admin UI must say resolver visibility remains disabled.",
);
assert.doesNotMatch(
  page,
  /\.(insert|update|upsert|delete)\(/,
  "Admin page must not write to Supabase directly.",
);

assert.doesNotMatch(
  `${resolverPriority}\n${reviewWorkPage}\n${resolver}`,
  /adopt_seed_import_row_hidden_canonical_admin|seed_import_adopted|seed_import_4f_hidden_canonical_adoption|adoption_note/,
  "Slice 4F must not change resolver, Review Work, assignment, scoring, or parent/child flows.",
);

assert.match(
  smoke,
  /PRODUCTION_SUPABASE_HOST = "wwohrqtunajrbwxyssjf\.supabase\.co"[\s\S]*refuses the production Supabase project/,
  "Slice 4F.1 smoke must explicitly refuse production Supabase.",
);
assert.match(
  smoke,
  /LOCAL_SLICE_4F_HIDDEN_CANONICAL_ADOPTION_SMOKE[\s\S]*Refusing local smoke without --confirm/,
  "Slice 4F.1 smoke must require explicit local confirmation.",
);
assert.match(
  smoke,
  /STAGING_SLICE_4F_HIDDEN_CANONICAL_ADOPTION_SMOKE[\s\S]*jlhotktspjvffslvuyfz\.supabase\.co[\s\S]*--allow-staging/,
  "Slice 4F.1 smoke must allow only explicitly confirmed staging.",
);
assert.match(
  smoke,
  /smoke_test:\s*true[\s\S]*synthetic_only:\s*true[\s\S]*Synthetic local\/staging-only smoke seed row/,
  "Slice 4F.1 smoke must mark all created seed data as synthetic smoke data.",
);
assert.match(
  smoke,
  /\.eq\("mastery_domain_key", "D4"\)[\s\S]*\.eq\("is_active", true\)[\s\S]*\.eq\("is_assignable", true\)/,
  "Slice 4F.1 smoke must choose an active assignable D4 micro-skill.",
);
assert.match(
  smoke,
  /canonical_mapping_id:\s*null[\s\S]*dry_run_bucket:\s*"safe_for_candidate_review"[\s\S]*row_status:\s*"nominated_for_canonical_adoption"/,
  "Slice 4F.1 smoke must insert an eligible nominated seed row.",
);
assert.match(
  smoke,
  /adopt_seed_import_row_hidden_canonical_admin/,
  "Slice 4F.1 smoke must call the 4F adoption RPC.",
);
assert.match(
  smoke,
  /row_status,\s*"adopted_hidden_canonical"[\s\S]*resolver_visibility_status,\s*"hidden"[\s\S]*source_seed_import_row_id/,
  "Slice 4F.1 smoke must assert adopted row, hidden mapping, and seed lineage.",
);
assert.match(
  smoke,
  /event_type === "created"[\s\S]*event_type === "seed_import_adopted"[\s\S]*resolver_visibility_enabled/,
  "Slice 4F.1 smoke must assert created/adopted events and no resolver visibility event.",
);
assert.match(
  smoke,
  /protectedCounts[\s\S]*assert\.deepStrictEqual\(protectedAfter, protectedBefore\)[\s\S]*fetchMicroSkillSnapshot[\s\S]*assert\.deepStrictEqual\(microSkillAfter, microSkillBefore\)/,
  "Slice 4F.1 smoke must assert protected tables and micro_skill_catalog are unchanged.",
);
assert.match(
  packageJson,
  /"writing-engine:seed-import-hidden-canonical-adoption-local-smoke"/,
  "Package scripts must expose the Slice 4F.1 local/staging smoke.",
);

console.log("writing-engine-seed-import-hidden-canonical-adoption-regression: ok");
