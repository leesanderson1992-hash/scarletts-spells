import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260522_add_spelling_catalog_review_case_decisions.sql";
const actionPath = "app/admin/catalog-review/actions.ts";
const pagePath = "app/admin/catalog-review/page.tsx";
const decisionRowPath = "app/admin/catalog-review/admin-decision-row.tsx";

const migration = readFileSync(migrationPath, "utf8");
const action = readFileSync(actionPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const decisionRow = readFileSync(decisionRowPath, "utf8");

for (const status of [
  "open",
  "linked_existing_skill",
  "new_skill_needed",
  "word_level_only",
  "not_a_learning_issue",
  "closed_duplicate",
  "superseded",
]) {
  assert.match(
    migration,
    new RegExp(`'${status}'`),
    `Expected migration to preserve case_status ${status}.`,
  );
}

for (const column of [
  "case_id",
  "admin_user_id",
  "admin_email",
  "decision_type",
  "previous_status",
  "new_status",
  "decision_note",
  "linked_micro_skill_key",
  "canonical_mapping_id",
  "merge_target_case_id",
  "superseded_by_case_id",
  "metadata",
  "created_at",
]) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`),
    `Expected audit migration to include ${column}.`,
  );
}

assert.match(
  migration,
  /check \(canonical_mapping_id is null\)/,
  "Slice 4D.1 must keep canonical_mapping_id unused.",
);
assert.doesNotMatch(
  migration,
  /create table(?: if not exists)? public\.[a-z_]*canonical[a-z_]*/i,
  "Slice 4D.1 must not create a canonical mapping table.",
);
assert.match(
  migration,
  /resolve_spelling_catalog_review_case_admin/,
  "Expected atomic admin resolution RPC.",
);
assert.match(
  migration,
  /for update/,
  "Expected RPC to lock the case row before update/audit insert.",
);

const requireAdminIndex = action.indexOf("await requireAdminUser()");
const serviceRoleIndex = action.indexOf("createServiceRoleClient()");
assert.ok(
  requireAdminIndex >= 0 && serviceRoleIndex > requireAdminIndex,
  "Admin action must authorize before creating service-role client.",
);
assert.match(
  action,
  /mastery_domain_key", "D4"/,
  "Admin action must validate linked micro-skills are D4.",
);
assert.match(
  action,
  /is_active", true/,
  "Admin action must validate linked micro-skills are active.",
);
assert.match(
  action,
  /is_assignable", true/,
  "Admin action must validate linked micro-skills are assignable.",
);
assert.doesNotMatch(
  action,
  /from\("micro_skill_catalog"\)\s*[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Admin action must not mutate micro_skill_catalog.",
);

assert.match(
  page,
  /Case decisions/,
  "Admin page must expose per-case decisions.",
);
assert.match(
  page,
  /Wrong Word[\s\S]*Correct Word[\s\S]*Reason[\s\S]*Skill Family[\s\S]*Skill Cluster[\s\S]*Micro-skill[\s\S]*Decision[\s\S]*Actions/,
  "Admin page must keep one compact decision table with the 4D.1 columns.",
);
assert.doesNotMatch(
  page,
  /CatalogReviewGroupSummary|Open catalog-review groups/,
  "Admin page must not render a second grouped triage table.",
);
assert.match(
  decisionRow,
  /decisionType === "linked_existing_skill"/,
  "Decision row must only show skill controls for Link existing skill.",
);
assert.match(
  decisionRow,
  /Submit selected decision[\s\S]*Edit decision details/,
  "Decision row must expose accessible Tick and Pencil actions.",
);
assert.doesNotMatch(
  decisionRow,
  /<textarea/,
  "Decision note must not render as a large textarea in the main row.",
);
assert.match(
  `${page}\n${decisionRow}`,
  /sourceLabel=\{formatSourceLabel\(row\.source_provenance\)\}|function formatSourceLabel/,
  "Admin table must use concise source labels.",
);
assert.doesNotMatch(
  `${page}\n${decisionRow}`,
  /false_positive_(report|confirmed|needs_rule_fix)/,
  "Slice 4D.1 UI must not implement false-positive admin handling.",
);

console.log("writing-engine-admin-catalog-review-case-resolution-regression: ok");
