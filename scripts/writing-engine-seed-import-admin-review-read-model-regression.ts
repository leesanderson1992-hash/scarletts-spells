import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pagePath = "app/admin/seed-import-review/page.tsx";
const hubPagePath = "app/admin/spelling-review/page.tsx";
const appShellPath = "components/app-shell.tsx";

assert.ok(existsSync(pagePath), "Seed import admin review page must exist.");

const page = readFileSync(pagePath, "utf8");
const hubPage = readFileSync(hubPagePath, "utf8");
const appShell = readFileSync(appShellPath, "utf8");

const pageFunction = page.slice(
  page.indexOf("export default async function AdminSeedImportReviewPage"),
);
const requireAdminIndex = pageFunction.indexOf("await requireAdminUser()");
const batchReadIndex = pageFunction.indexOf("getSeedImportBatches()");
const rowReadIndex = pageFunction.indexOf("getSeedImportRows()");

assert.ok(
  requireAdminIndex >= 0 &&
    batchReadIndex > requireAdminIndex &&
    rowReadIndex > requireAdminIndex,
  "Seed import review page must authorize admin access before reading seed rows.",
);
assert.match(
  page,
  /createServiceRoleClient/,
  "Seed import review page must use the server-only service-role boundary.",
);
assert.match(
  page,
  /\.from\("spelling_seed_import_batches"\)[\s\S]*\.select\(/,
  "Seed import review page must read seed import batches.",
);
assert.match(
  page,
  /\.from\("spelling_seed_import_rows"\)[\s\S]*\.select\(/,
  "Seed import review page must read seed import rows.",
);
assert.match(
  page,
  /This surface is[\s\S]*read-only/,
  "Seed import review page must label itself as read-only.",
);
assert.match(
  page,
  /Decision history is not append-only yet/,
  "Seed import review page must disclose the no-ledger audit limitation.",
);
assert.match(
  hubPage,
  /href="\/admin\/seed-import-review"/,
  "Spelling review hub must link to seed import review.",
);
assert.match(
  appShell,
  /label: "Seed Import Review", href: "\/admin\/seed-import-review"/,
  "Admin navigation must include seed import review.",
);
assert.doesNotMatch(
  page,
  /export async function|function .*Action|<form|formAction|action=/,
  "Slice 4E.1 page must not expose mutation forms or server actions.",
);
assert.doesNotMatch(
  page,
  /\.(insert|update|upsert|delete)\(/,
  "Slice 4E.1 page must not write to Supabase.",
);
assert.doesNotMatch(
  page,
  /adopted_hidden_canonical|canonical_mapping_id"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Slice 4E.1 page must not adopt hidden canonical rows.",
);
assert.doesNotMatch(
  page,
  /\.from\("spelling_canonical_mappings"\)|create_spelling_canonical_mapping_admin|canonical mapping events/i,
  "Slice 4E.1 page must not touch canonical mapping truth.",
);
assert.doesNotMatch(
  page,
  /resolver_visibility|resolver_visible:\s*true|enableCanonicalMappingResolverVisibility/,
  "Slice 4E.1 page must not change resolver visibility.",
);
assert.doesNotMatch(
  page,
  /\.from\("micro_skill_catalog"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Slice 4E.1 page must not mutate micro_skill_catalog.",
);

console.log("writing-engine-seed-import-admin-review-read-model-regression: ok");
