import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readArchivedMigrationOrActiveBaseline } from "./migration-sql-contract-source";

const canonicalRepositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const adminActionPath = "app/admin/catalog-review/actions.ts";
const reviewActionsPath = "app/courses/review/actions/catalog-review-case-actions.ts";
const reviewPagePath = "app/courses/review/[submissionId]/page.tsx";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const mappingSourcePath =
  "lib/writing-engine/spelling/stage2c-mapping-source-boundary.ts";

const migration = readArchivedMigrationOrActiveBaseline(
  "20260522_z_add_spelling_canonical_mapping_storage.sql",
);
const canonicalRepository = readFileSync(canonicalRepositoryPath, "utf8");
const adminAction = readFileSync(adminActionPath, "utf8");
const reviewActions = readFileSync(reviewActionsPath, "utf8");
const reviewPage = readFileSync(reviewPagePath, "utf8");
const resolver = readFileSync(resolverPath, "utf8");
const mappingSource = readFileSync(mappingSourcePath, "utf8");
const caseDecisionMigration = readArchivedMigrationOrActiveBaseline(
  "20260522_add_spelling_catalog_review_case_decisions.sql",
);

for (const table of [
  "spelling_canonical_mappings",
  "spelling_canonical_mapping_events",
]) {
  assert.match(
    migration,
    new RegExp(`create table if not exists public\\.${table}`),
    `Expected ${table} to be created.`,
  );
  assert.match(
    migration,
    new RegExp(`revoke all on public\\.${table} from authenticated`),
    `Expected ${table} to be unavailable to authenticated clients.`,
  );
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `Expected ${table} to have RLS enabled.`,
  );
}

for (const column of [
  "misspelling_normalized",
  "correct_spelling_normalized",
  "micro_skill_key",
  "mapping_status",
  "dialect_code",
  "normalization_version",
  "source_case_id",
  "source_decision_id",
  "created_by_admin_user_id",
  "created_by_admin_email",
  "decision_note",
  "metadata",
  "replacement_mapping_id",
  "deactivated_at",
  "deactivated_by_admin_user_id",
  "deactivated_by_admin_email",
  "deactivation_note",
  "created_at",
  "updated_at",
]) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`),
    `Expected canonical mapping column ${column}.`,
  );
}

assert.match(
  migration,
  /where mapping_status = 'active'/,
  "Active mapping uniqueness must be scoped to active rows only.",
);
assert.match(
  migration,
  /misspelling_normalized,[\s\S]*correct_spelling_normalized,[\s\S]*dialect_code/,
  "Active uniqueness must cover the normalized exact pair and dialect.",
);
assert.match(
  migration,
  /btrim\(misspelling_normalized\) <> ''[\s\S]*btrim\(correct_spelling_normalized\) <> ''/,
  "Canonical mappings must reject empty normalized words.",
);
assert.match(
  migration,
  /btrim\(misspelling_normalized\) <> btrim\(correct_spelling_normalized\)/,
  "Canonical mappings must reject identical misspelling/correction pairs.",
);
assert.match(
  migration,
  /mapping_status in \(\s*'active',\s*'disabled',\s*'deprecated',\s*'superseded'/,
  "Canonical mappings must model active/disabled/deprecated/superseded statuses.",
);
assert.match(
  migration,
  /where micro_skill_key = new\.micro_skill_key[\s\S]*mastery_domain_key = 'D4'[\s\S]*is_active = true[\s\S]*is_assignable = true/,
  "Active canonical mappings must validate an active assignable D4 micro-skill.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.micro_skill_catalog\b/i,
  "Slice 4E.1 must not mutate micro_skill_catalog.",
);

for (const eventColumn of [
  "event_type",
  "previous_status",
  "new_status",
  "previous_misspelling_normalized",
  "new_misspelling_normalized",
  "previous_correct_spelling_normalized",
  "new_correct_spelling_normalized",
  "previous_micro_skill_key",
  "new_micro_skill_key",
  "admin_user_id",
  "admin_email",
  "source_case_id",
  "source_decision_id",
  "note",
  "metadata",
  "created_at",
]) {
  assert.match(
    migration,
    new RegExp(`\\b${eventColumn}\\b`),
    `Expected canonical mapping event column ${eventColumn}.`,
  );
}
assert.match(
  migration,
  /insert into public\.spelling_canonical_mapping_events[\s\S]*'created'[\s\S]*'active'/,
  "Canonical mapping RPC must write a created audit event.",
);
assert.doesNotMatch(
  migration,
  /insert into public\.spelling_catalog_review_case_decisions/i,
  "Canonical mapping events must stay separate from 4D.1 case-decision audit rows.",
);

assert.match(
  migration,
  /create_spelling_canonical_mapping_admin/,
  "Expected service-role RPC foundation for canonical mapping writes.",
);
assert.match(
  migration,
  /grant execute on function public\.create_spelling_canonical_mapping_admin[\s\S]*to service_role/,
  "Canonical mapping RPC must only be executable by service_role.",
);
assert.match(
  canonicalRepository,
  /import "server-only"/,
  "Canonical mapping repository must be server-only.",
);
assert.match(
  canonicalRepository,
  /createServiceRoleClient/,
  "Canonical mapping repository must use service-role Supabase access.",
);
assert.match(
  canonicalRepository,
  /resolver_visible: false/,
  "Canonical mapping write metadata must preserve resolver non-effect for 4E.1.",
);

assert.doesNotMatch(
  `${reviewActions}\n${reviewPage}`,
  /spelling_canonical_mappings|create_spelling_canonical_mapping_admin|createSpellingCanonicalMappingAdmin/,
  "Parent Review Work paths must not create canonical mappings.",
);
assert.match(
  adminAction,
  /resolver_visible: false/,
  "Admin actions that touch canonical mapping storage must preserve resolver non-effect.",
);
assert.match(
  caseDecisionMigration,
  /check \(canonical_mapping_id is null\)/,
  "4D.1 decision rows must remain non-canonical.",
);
assert.doesNotMatch(
  migration,
  /alter table public\.spelling_catalog_review_case_decisions[\s\S]*add_canonical_mapping/i,
  "Slice 4E.1 must not reinterpret existing 4D.1 decisions as canonical writes.",
);
assert.doesNotMatch(
  `${resolver}\n${mappingSource}`,
  /spelling_canonical_mappings|create_spelling_canonical_mapping_admin|spelling_canonical_mapping_events/,
  "Slice 4E.1 must not introduce resolver reads or resolver effect.",
);

console.log("writing-engine-canonical-mapping-storage-regression: ok");
