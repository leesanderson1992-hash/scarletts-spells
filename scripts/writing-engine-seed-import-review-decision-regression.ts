import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  getAllowedSeedImportReviewStartingStatuses,
  type SeedImportReviewDecision,
  type SeedImportReviewDecisionInput,
  type SeedImportReviewDecisionRow,
  validateSeedImportReviewDecision,
} from "../app/admin/seed-import-review/decision-rules";

const actionPath = "app/admin/seed-import-review/actions.ts";
const rulesPath = "app/admin/seed-import-review/decision-rules.ts";
const pagePath = "app/admin/seed-import-review/page.tsx";
const migrationPath =
  "supabase/migrations/20260614120000_add_spelling_seed_import_storage.sql";

assert.ok(existsSync(actionPath), "Slice 4E.2 seed import action file must exist.");
assert.ok(existsSync(rulesPath), "Slice 4E.2 decision rules file must exist.");

const action = readFileSync(actionPath, "utf8");
const rules = readFileSync(rulesPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

function makeRow(
  overrides: Partial<SeedImportReviewDecisionRow> = {},
): SeedImportReviewDecisionRow {
  return {
    correct_spelling_normalized: "because",
    dialect_code: "en-GB",
    id: "row-1",
    misspelling_normalized: "becuase",
    row_status: "pending_candidate_review",
    ...overrides,
  };
}

function makeDecisionInput(
  overrides: Partial<SeedImportReviewDecisionInput> = {},
): SeedImportReviewDecisionInput {
  return {
    decision: "keep_pending",
    duplicateOfSeedImportRowId: null,
    reviewNote: null,
    rowId: "row-1",
    statusReason: null,
    ...overrides,
  };
}

function assertValidDecision(decision: SeedImportReviewDecision) {
  const input = makeDecisionInput({
    decision,
    duplicateOfSeedImportRowId: decision === "mark_duplicate" ? "row-2" : null,
    reviewNote:
      decision === "nominate_for_canonical_adoption" ? "Strong source fit." : null,
    statusReason:
      decision !== "keep_pending" &&
      decision !== "nominate_for_canonical_adoption"
        ? "Operator reviewed."
        : null,
  });

  const duplicateTarget =
    decision === "mark_duplicate" ? makeRow({ id: "row-2" }) : null;
  const result = validateSeedImportReviewDecision({
    decisionInput: input,
    duplicateTarget,
    row: makeRow(),
  });

  assert.equal(result.ok, true, `${decision} should validate from pending.`);
}

for (const decision of [
  "keep_pending",
  "reject",
  "mark_duplicate",
  "mark_conflict_blocked",
  "nominate_for_canonical_adoption",
  "supersede",
] as const) {
  assertValidDecision(decision);
}

assert.deepEqual(
  getAllowedSeedImportReviewStartingStatuses("mark_conflict_blocked"),
  [
    "pending_candidate_review",
    "kept_pending",
    "nominated_for_canonical_adoption",
  ],
  "Conflict blocked must use the Slice 4E.0 starting-status contract.",
);
assert.deepEqual(
  getAllowedSeedImportReviewStartingStatuses("nominate_for_canonical_adoption"),
  ["pending_candidate_review", "kept_pending", "conflict_blocked"],
  "Nomination must use the Slice 4E.0 starting-status contract.",
);

assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({
      decision: "mark_conflict_blocked",
      statusReason: "Conflict.",
    }),
    duplicateTarget: null,
    row: makeRow({ row_status: "rejected" }),
  }).ok,
  false,
  "Invalid conflict-blocked transitions must be rejected.",
);
assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({
      decision: "nominate_for_canonical_adoption",
      reviewNote: "Adoption candidate.",
    }),
    duplicateTarget: null,
    row: makeRow({ row_status: "duplicate" }),
  }).ok,
  false,
  "Invalid nomination transitions must be rejected.",
);
assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({
      decision: "reject",
      statusReason: "Reject.",
    }),
    duplicateTarget: null,
    row: makeRow({ row_status: "adopted_hidden_canonical" }),
  }).ok,
  false,
  "Slice 4E.2 must not mutate adopted hidden-canonical rows.",
);
assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({ decision: "reject" }),
    duplicateTarget: null,
    row: makeRow(),
  }).ok,
  false,
  "Reject requires a status reason or review note.",
);
assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({
      decision: "nominate_for_canonical_adoption",
      statusReason: "Good candidate.",
    }),
    duplicateTarget: null,
    row: makeRow(),
  }).ok,
  false,
  "Nomination requires an explicit non-adoptive review note.",
);
assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({
      decision: "mark_duplicate",
      duplicateOfSeedImportRowId: "row-1",
      statusReason: "Same row.",
    }),
    duplicateTarget: makeRow({ id: "row-1" }),
    row: makeRow(),
  }).ok,
  false,
  "Duplicate decisions must reject self-targeting.",
);
assert.equal(
  validateSeedImportReviewDecision({
    decisionInput: makeDecisionInput({
      decision: "mark_duplicate",
      duplicateOfSeedImportRowId: "row-2",
      statusReason: "Different dialect.",
    }),
    duplicateTarget: makeRow({ dialect_code: "en-US", id: "row-2" }),
    row: makeRow(),
  }).ok,
  false,
  "Duplicate targets must match normalized misspelling, correction, and dialect.",
);

const actionFunction = action.slice(
  action.indexOf("export async function decideSeedImportReviewRow"),
);
const requireAdminIndex = actionFunction.indexOf("await requireAdminUser()");
const serviceRoleIndex = actionFunction.indexOf("createServiceRoleClient()");
const updateIndex = actionFunction.indexOf(".update({");

assert.ok(
  requireAdminIndex >= 0 &&
    serviceRoleIndex > requireAdminIndex &&
    updateIndex > serviceRoleIndex,
  "Seed import decisions must authorize admins before service-role writes.",
);
assert.match(
  action,
  /\.from\("spelling_seed_import_rows"\)[\s\S]*\.update\(\{/,
  "Slice 4E.2 may update spelling_seed_import_rows.",
);
assert.doesNotMatch(
  action,
  /\.from\("(?!spelling_seed_import_rows")[^"]+"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Slice 4E.2 must not write outside spelling_seed_import_rows.",
);
assert.doesNotMatch(
  action,
  /canonical_mapping_id|adopted_hidden_canonical|spelling_canonical_mappings|canonical_mapping_events|resolver_visibility|resolver_visible/,
  "Slice 4E.2 actions must not create canonical truth or resolver visibility.",
);
for (const requiredUpdateField of [
  "reviewed_by_admin_user_id",
  "reviewed_by_admin_email",
  "reviewed_at",
  "updated_at",
]) {
  assert.match(
    action,
    new RegExp(requiredUpdateField),
    `Slice 4E.2 decisions must write ${requiredUpdateField}.`,
  );
}
assert.match(
  action,
  /duplicate_of_seed_import_row_id/,
  "Slice 4E.2 duplicate decisions must write duplicate lineage.",
);
assert.match(
  page,
  /status-only[\s\S]*does not create canonical mappings[\s\S]*resolver visibility/,
  "Admin page must distinguish status-only review from canonical adoption.",
);
assert.match(
  page,
  /action=\{decideSeedImportReviewRow\}/,
  "Admin page must expose the server-only decision action.",
);
assert.match(
  migration,
  /revoke all on table public\.spelling_seed_import_rows from anon, authenticated/,
  "Seed rows must keep anon/authenticated grants revoked.",
);
assert.doesNotMatch(
  migration,
  /create policy[\s\S]*spelling_seed_import_rows[\s\S]*authenticated/i,
  "Seed rows must not gain broad authenticated RLS policies.",
);
assert.doesNotMatch(
  rules + action + page,
  /micro_skill_catalog[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Slice 4E.2 must not mutate micro_skill_catalog.",
);

console.log("writing-engine-seed-import-review-decision-regression: ok");
