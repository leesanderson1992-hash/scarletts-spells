import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actionPath = "app/admin/catalog-review/actions.ts";
const decisionRowPath = "app/admin/catalog-review/admin-decision-row.tsx";
const pagePath = "app/admin/catalog-review/page.tsx";
const curationMigrationPath =
  "supabase/migrations/20260522_zz_add_spelling_admin_canonical_curation_decisions.sql";
const storageMigrationPath =
  "supabase/migrations/20260522_z_add_spelling_canonical_mapping_storage.sql";
const caseDecisionMigrationPath =
  "supabase/migrations/20260522_add_spelling_catalog_review_case_decisions.sql";
const reviewActionsPath = "app/courses/review/actions/catalog-review-case-actions.ts";
const reviewPagePath = "app/courses/review/[submissionId]/page.tsx";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const mappingSourcePath =
  "lib/writing-engine/spelling/stage2c-mapping-source-boundary.ts";

const action = readFileSync(actionPath, "utf8");
const decisionRow = readFileSync(decisionRowPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const curationMigration = readFileSync(curationMigrationPath, "utf8");
const storageMigration = readFileSync(storageMigrationPath, "utf8");
const caseDecisionMigration = readFileSync(caseDecisionMigrationPath, "utf8");
const reviewActions = readFileSync(reviewActionsPath, "utf8");
const reviewPage = readFileSync(reviewPagePath, "utf8");
const resolver = readFileSync(resolverPath, "utf8");
const mappingSource = readFileSync(mappingSourcePath, "utf8");

for (const decision of [
  "add_canonical_mapping",
  "needs_new_micro_skill",
  "word_level_only",
  "not_a_learning_issue",
  "reject_no_canonical_update",
]) {
  assert.match(
    action,
    new RegExp(`"${decision}"`),
    `Expected admin action to accept 4E.2 decision ${decision}.`,
  );
  assert.match(
    decisionRow,
    new RegExp(`value="${decision}"`),
    `Expected admin UI to expose 4E.2 decision ${decision}.`,
  );
  assert.match(
    curationMigration,
    new RegExp(`'${decision}'`),
    `Expected 4E.2 migration to allow decision/status ${decision}.`,
  );
}

assert.doesNotMatch(
  decisionRow,
  /value="linked_existing_skill"|value="new_skill_needed"/,
  "New admin submissions must use separated 4E.2 decisions, not 4D.1 names.",
);
assert.match(
  page,
  /Historical Slice 4D\.1/,
  "Admin UI must keep historical 4D.1 decisions readable as history.",
);
assert.match(
  decisionRow,
  /Historical Slice 4D\.1 decisions remain case-only history/,
  "Decision history must label 4D.1 rows as historical case-only history.",
);

const requireAdminIndex = action.indexOf("await requireAdminUser()");
const serviceRoleIndex = action.indexOf("createServiceRoleClient()");
assert.ok(
  requireAdminIndex >= 0 && serviceRoleIndex > requireAdminIndex,
  "Admin action must authorize before creating or using service-role Supabase.",
);
assert.match(
  curationMigration,
  /grant execute on function public\.resolve_spelling_catalog_review_case_admin[\s\S]*to service_role/,
  "4E.2 admin decision RPC must only be executable by service_role.",
);
assert.doesNotMatch(
  curationMigration,
  /grant execute on function public\.resolve_spelling_catalog_review_case_admin[\s\S]*to authenticated/,
  "4E.2 admin decision RPC must not be executable by normal authenticated users.",
);

assert.match(
  action,
  /decisionType === "add_canonical_mapping"[\s\S]*getValidLinkedMicroSkill/,
  "Add canonical mapping must validate the submitted micro-skill server-side.",
);
assert.match(
  action,
  /mastery_domain_key", "D4"[\s\S]*is_active", true[\s\S]*is_assignable", true/,
  "Server-side micro-skill validation must require active assignable D4 skills.",
);
assert.match(
  curationMigration,
  /where micro_skill_key = btrim\(p_linked_micro_skill_key\)[\s\S]*mastery_domain_key = 'D4'[\s\S]*is_active = true[\s\S]*is_assignable = true/,
  "RPC must revalidate active assignable D4 micro-skills before canonical curation.",
);

assert.match(
  storageMigration,
  /create unique index if not exists spelling_canonical_mappings_active_exact_pair_idx[\s\S]*where mapping_status = 'active'/,
  "Duplicate active canonical mappings must be rejected by the 4E.1 active exact-pair index.",
);
assert.match(
  curationMigration,
  /insert into public\.spelling_catalog_review_case_decisions[\s\S]*returning id into v_decision_id;[\s\S]*if v_decision_type = 'add_canonical_mapping' then[\s\S]*public\.create_spelling_canonical_mapping_admin/,
  "Add canonical mapping must create storage only after the source decision row exists.",
);
assert.match(
  storageMigration,
  /insert into public\.spelling_canonical_mapping_events[\s\S]*'created'[\s\S]*'active'/,
  "Canonical mapping creation must write the 4E.1 canonical mapping event.",
);
assert.match(
  curationMigration,
  /p_case_id,\s*\n\s*v_decision_id,\s*\n\s*v_note/,
  "Add canonical mapping must pass the source case-decision id into the canonical mapping RPC.",
);
assert.match(
  storageMigration,
  /p_source_decision_id[\s\S]*source_decision_id[\s\S]*p_source_decision_id/,
  "Canonical mapping and event provenance must include source_decision_id.",
);
assert.match(
  curationMigration,
  /update public\.spelling_catalog_review_case_decisions[\s\S]*canonical_mapping_id = v_canonical_mapping_id/,
  "Add canonical mapping decisions must be updated with the created canonical mapping id.",
);
assert.match(
  curationMigration,
  /decision_type not in \('linked_existing_skill', 'add_canonical_mapping'\)[\s\S]*canonical_mapping_id is null/,
  "Non-canonical 4E.2 decisions must not create or reference canonical mappings.",
);

assert.doesNotMatch(
  `${action}\n${curationMigration}\n${storageMigration}`,
  /\b(insert into|update|delete from)\s+(public\.)?micro_skill_catalog\b/i,
  "4E.2 canonical curation must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  `${reviewActions}\n${reviewPage}`,
  /add_canonical_mapping|spelling_canonical_mappings|create_spelling_canonical_mapping_admin/,
  "Parent Review Work must not gain canonical-curation behavior in 4E.2.",
);
assert.doesNotMatch(
  `${resolver}\n${mappingSource}`,
  /spelling_canonical_mappings|create_spelling_canonical_mapping_admin|spelling_canonical_mapping_events/,
  "4E.2 must not add resolver reads or resolver effect.",
);
assert.doesNotMatch(
  curationMigration,
  /update public\.spelling_catalog_review_case_decisions[\s\S]*where[\s\S]*decision_type\s+in\s+\('linked_existing_skill',\s*'new_skill_needed'\)/,
  "4E.2 must not reinterpret or backfill historical 4D.1 decision rows.",
);
assert.match(
  caseDecisionMigration,
  /'linked_existing_skill'[\s\S]*'new_skill_needed'/,
  "Historical 4D.1 decision names must remain represented in the original migration.",
);
assert.match(
  `${action}\n${decisionRow}\n${page}\n${curationMigration}`,
  /resolver_visible:\s*false|resolver_visible',\s*false|resolver use remains deferred until\s+Slice 4E\.3/i,
  "4E.2 must make clear that canonical storage is not resolver-visible yet.",
);

console.log("writing-engine-admin-canonical-curation-regression: ok");
