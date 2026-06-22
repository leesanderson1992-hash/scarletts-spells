import fs from "fs";
import path from "path";

import {
  buildSeedUploadImportPlan,
  buildSeedUploadPreview,
} from "../lib/writing-engine/seed-import-upload";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const activeSkill = {
  micro_skill_key: "D4_IRRE_TRICKY_WORDS_COMMON_HIGH_FREQUENCY",
  mastery_domain_key: "D4",
  is_active: true,
  is_assignable: true,
};

const inactiveSkill = {
  micro_skill_key: "D4_INACTIVE_SKILL",
  mastery_domain_key: "D4",
  is_active: false,
  is_assignable: true,
};

const csv = [
  "misspelling,correction,suggested_micro_skill_key,confidence,source,note,dialect,source_dataset,source_row_id,import_batch_name,pattern_hint,route_hint",
  "freind,friend,D4_IRRE_TRICKY_WORDS_COMMON_HIGH_FREQUENCY,high,upload_regression,Valid active skill,en-GB,upload-regression,row-1,upload-regression,tricky word,candidate_review",
  "unknwon,unknown,D4_SKILL_DOES_NOT_EXIST,medium,upload_regression,Unknown skill imports blank,en-GB,upload-regression,row-2,upload-regression,tricky word,candidate_review",
  "inactiv,inactive,D4_INACTIVE_SKILL,medium,upload_regression,Inactive skill needs review,en-GB,upload-regression,row-3,upload-regression,tricky word,candidate_review",
].join("\n");

const preview = buildSeedUploadPreview({
  csvText: csv,
  fileName: "upload-regression.csv",
  microSkills: [activeSkill, inactiveSkill],
  now: new Date("2026-06-22T12:00:00.000Z"),
});

assert(preview.summary.total_rows === 3, "Expected three preview rows.");
assert(preview.summary.importable_rows === 1, "Expected one importable row.");
assert(preview.summary.manual_review_rows === 2, "Expected two manual-review rows.");
assert(preview.summary.rejected_rows === 0, "Expected no rejected rows.");

const activeRow = preview.rows[0];
assert(
  activeRow.stored_micro_skill_key === activeSkill.micro_skill_key,
  "Active D4 skill should be stored.",
);
assert(
  activeRow.bucket === "pending_candidate_review",
  "Active D4 skill should be pending candidate review.",
);

const unknownRow = preview.rows[1];
assert(unknownRow.stored_micro_skill_key === null, "Unknown skill should store null.");
assert(
  unknownRow.bucket === "manual_review_required",
  "Unknown skill should import for manual review.",
);
assert(
  unknownRow.reasons.includes("unknown_micro_skill"),
  "Unknown skill reason should be preserved.",
);

const inactiveRow = preview.rows[2];
assert(
  inactiveRow.stored_micro_skill_key === inactiveSkill.micro_skill_key,
  "Existing inactive skill should remain stored for audit.",
);
assert(
  inactiveRow.bucket === "manual_review_required",
  "Inactive skill should require manual review.",
);

const plan = buildSeedUploadImportPlan({
  adminEmail: "admin@example.com",
  adminUserId: "00000000-0000-0000-0000-000000000001",
  csvText: csv,
  preview,
  sourceLicenseNote: "Regression source/license note.",
  now: new Date("2026-06-22T12:05:00.000Z"),
});

assert(plan.rows.length === 3, "Expected import plan to include candidate and manual rows.");
assert(
  plan.rows[0].suggested_micro_skill_key === activeSkill.micro_skill_key,
  "Importable row should keep active skill.",
);
assert(
  plan.rows[1].suggested_micro_skill_key === null,
  "Unknown skill import row should store null.",
);
assert(
  plan.rows[1].row_status === "manual_review_required",
  "Unknown skill import row should be manual-review status.",
);
assert(
  (plan.rows[1].metadata as { uploaded_micro_skill_key?: string }).uploaded_micro_skill_key ===
    "D4_SKILL_DOES_NOT_EXIST",
  "Unknown uploaded skill should be preserved in metadata.",
);

const tooManyRows = [
  "misspelling,correction,suggested_micro_skill_key,confidence,source,note",
  ...Array.from({ length: 1001 }, (_, index) =>
    `miss${index},word${index},${activeSkill.micro_skill_key},high,upload_regression,Row cap`,
  ),
].join("\n");

let rowCapRejected = false;
try {
  buildSeedUploadPreview({
    csvText: tooManyRows,
    fileName: "too-many.csv",
    microSkills: [activeSkill],
  });
} catch (error) {
  rowCapRejected =
    error instanceof Error && error.message.includes("limited to 1000 data rows");
}
assert(rowCapRejected, "Uploads above 1000 rows should be rejected.");

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260622120000_allow_nullable_seed_import_micro_skill.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8").toLowerCase();
assert(
  migrationSql.includes("alter column suggested_micro_skill_key drop not null"),
  "Migration should drop the non-null requirement.",
);
assert(!migrationSql.includes("grant "), "Migration must not add grants.");
assert(!migrationSql.includes("anon"), "Migration must not mention anon grants.");
assert(
  !migrationSql.includes("authenticated"),
  "Migration must not mention authenticated grants.",
);

const actionPath = path.join(process.cwd(), "app/admin/seed-import-review/upload-actions.ts");
const actionSource = fs.readFileSync(actionPath, "utf8");
assert(
  actionSource.includes("await requireAdminUser();\n    const supabase = createServiceRoleClient();"),
  "Upload actions should require admin before service-role client use.",
);
assert(
  !actionSource.includes("resolver_visibility_enabled"),
  "Upload actions must not create resolver visibility events.",
);

console.log("Seed import upload regression passed.");
