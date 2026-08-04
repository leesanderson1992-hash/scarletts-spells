import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const hubPagePath = "app/admin/spelling-review/page.tsx";
const appShellPath = "components/app-shell.tsx";
const dashboardPagePath = "app/dashboard/page.tsx";
const catalogActionPath = "app/admin/catalog-review/actions.ts";
const recommendationActionPath = "app/admin/canonical-recommendations/actions.ts";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";

assert.ok(existsSync(hubPagePath), "Admin Spelling Review hub page must exist.");

const hubPage = readFileSync(hubPagePath, "utf8");
const appShell = readFileSync(appShellPath, "utf8");
const dashboardPage = readFileSync(dashboardPagePath, "utf8");
const catalogAction = readFileSync(catalogActionPath, "utf8");
const recommendationAction = readFileSync(recommendationActionPath, "utf8");
const resolver = readFileSync(resolverPath, "utf8");

const pageFunction = hubPage.slice(
  hubPage.indexOf("export default async function AdminSpellingReviewPage"),
);
const requireAdminIndex = pageFunction.indexOf("await requireAdminUser()");
const summaryReadIndex = pageFunction.indexOf("getCatalogGapSummary()");

assert.ok(
  requireAdminIndex >= 0 && summaryReadIndex > requireAdminIndex,
  "Hub page must authorize admin access before reading service-role summaries.",
);
assert.match(
  hubPage,
  /spelling_catalog_review_cases/,
  "Hub page must show the catalog gaps queue source.",
);
assert.match(
  hubPage,
  /spelling_canonical_mapping_recommendations/,
  "Hub page must show the parent recommendation queue source.",
);
assert.match(
  hubPage,
  /href="\/admin\/catalog-review"/,
  "Hub page must preserve the catalog-review route link.",
);
assert.match(
  hubPage,
  /href="\/admin\/canonical-recommendations"/,
  "Hub page must preserve the canonical-recommendations route link.",
);
assert.match(
  hubPage,
  /spelling_seed_import_rows/,
  "Hub page must show the seed import row queue source.",
);
assert.match(
  hubPage,
  /href="\/admin\/seed-import-review"/,
  "Hub page must include the seed-import review route link.",
);
assert.match(
  hubPage,
  /Catalog gaps: parent could not find a suitable existing skill\./,
  "Hub page must explain catalog gaps plainly.",
);
assert.match(
  hubPage,
  /Recommended mappings: parent selected an existing skill and recommends the word\/correction pairing for admin review\./,
  "Hub page must explain recommended mappings plainly.",
);
assert.match(
  appShell,
  /if \(showAdminNav\)[\s\S]*parentItems\.push\(\{[\s\S]*label: "Admin"[\s\S]*children: \[[\s\S]*label: "Spelling Review", href: "\/admin\/spelling-review"/,
  "Admin navigation must be one nested parent-menu item when explicitly enabled.",
);
assert.match(
  appShell,
  /label: "Catalog Review", href: "\/admin\/catalog-review"/,
  "Admin navigation must preserve the catalog-review link.",
);
assert.match(
  appShell,
  /label: "Canonical Recommendations"[\s\S]*href: "\/admin\/canonical-recommendations"/,
  "Admin navigation must preserve the canonical-recommendations link.",
);
assert.match(
  appShell,
  /label: "Seed Import Review", href: "\/admin\/seed-import-review"/,
  "Admin navigation must include the seed-import review link.",
);
assert.match(
  appShell,
  /label: "Canonical Mappings", href: "\/admin\/canonical-mappings"/,
  "Admin navigation must include the canonical-mappings link.",
);
assert.match(
  appShell,
  /label: "Resolver Readiness"[\s\S]*href: "\/admin\/spelling-canonical-resolver-readiness"/,
  "Admin navigation must include the resolver-readiness link.",
);
assert.match(
  appShell,
  /label: "ADLE Canonical Intake Readiness"[\s\S]*href: "\/admin\/adle-canonical-intake-readiness"/,
  "Admin navigation must include the ADLE canonical-intake readiness link.",
);
assert.doesNotMatch(
  appShell,
  /\/admin\/adle-dynamic-prefix-qa/,
  "Production parent navigation must exclude the staging-only Dynamic Prefix QA launcher.",
);
assert.match(
  dashboardPage,
  /import \{ isAdminUser \} from "@\/lib\/admin\/access";/,
  "The dashboard must use the existing server-side admin allowlist check.",
);
assert.match(
  dashboardPage,
  /const showAdminNav = mode === "parent" && isAdminUser\(user\);/,
  "The dashboard must enable admin navigation only for allowlisted users in parent mode.",
);
assert.equal(
  dashboardPage.match(/showAdminNav=\{showAdminNav\}/g)?.length,
  2,
  "Both dashboard AppShell render paths must receive the authorized admin-navigation flag.",
);
assert.doesNotMatch(
  hubPage,
  /resolveSpellingCatalogReviewCase|curateSpellingCanonicalRecommendation/,
  "Hub page must not import or call existing admin mutation actions.",
);
assert.doesNotMatch(
  hubPage,
  /create_spelling_canonical_mapping_admin|createSpellingCanonicalMappingAdmin|\.from\("spelling_canonical_mappings"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Hub page must not create or mutate canonical mapping truth.",
);
assert.doesNotMatch(
  hubPage,
  /\.from\("micro_skill_catalog"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Hub page must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  hubPage,
  /resolver_visible:\s*true|accept_and_adopt_canonical_mapping/,
  "Hub page must not introduce resolver adoption or resolver visibility.",
);
assert.doesNotMatch(
  `${catalogAction}\n${recommendationAction}\n${resolver}`,
  /\/admin\/spelling-review[\s\S]*resolver_visible:\s*true/,
  "Hub slice must not add resolver-visible behavior to existing workflows.",
);

console.log("admin-spelling-review-hub-regression: ok");
