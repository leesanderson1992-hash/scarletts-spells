import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260605103000_add_resolver_visibility_to_spelling_canonical_mappings.sql";
const canonicalRepositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const stage3aAnalysisPath =
  "lib/writing-engine/spelling/stage3a-authentic-submission-analysis.ts";
const resolverPriorityPath = "app/courses/review/resolver-visible-priority.ts";
const canonicalBackfillPath =
  "app/courses/review/actions/canonical-spelling-backfill-actions.ts";
const canonicalSubmissionActionsPath =
  "app/courses/review/canonical-submission-spelling-actions.ts";
const adminCatalogActionPath = "app/admin/catalog-review/actions.ts";
const adminPcrmActionPath = "app/admin/canonical-recommendations/actions.ts";
const reviewWorkPagePath = "app/courses/review/[submissionId]/page.tsx";

const migration = readFileSync(migrationPath, "utf8");
const canonicalRepository = readFileSync(canonicalRepositoryPath, "utf8");
const pureResolverSources = [
  readFileSync(resolverPath, "utf8"),
  readFileSync(stage3aAnalysisPath, "utf8"),
].join("\n");
const approvedR3RuntimeResolverSources = [
  readFileSync(resolverPriorityPath, "utf8"),
  readFileSync(canonicalBackfillPath, "utf8"),
  readFileSync(canonicalSubmissionActionsPath, "utf8"),
].join("\n");
const adminActionSources = [
  readFileSync(adminCatalogActionPath, "utf8"),
  readFileSync(adminPcrmActionPath, "utf8"),
].join("\n");
const reviewWorkPage = readFileSync(reviewWorkPagePath, "utf8");

assert.match(
  migration,
  /add column if not exists resolver_visibility_status text not null default 'hidden'/,
  "R1 migration must add a first-class hidden-by-default resolver visibility status.",
);
assert.match(
  migration,
  /resolver_visibility_status in \(\s*'hidden',\s*'visible',\s*'disabled'/,
  "Resolver visibility status must be constrained to hidden/visible/disabled.",
);
assert.match(
  migration,
  /add column if not exists previous_resolver_visibility_status text[\s\S]*add column if not exists new_resolver_visibility_status text/,
  "R1 migration must add previous/new resolver visibility audit columns.",
);
assert.match(
  migration,
  /'resolver_visibility_enabled'[\s\S]*'resolver_visibility_disabled'/,
  "Canonical mapping events must allow resolver visibility enable/disable event types.",
);
assert.match(
  migration,
  /spelling_canonical_mappings_resolver_visible_exact_pair_idx[\s\S]*misspelling_normalized,[\s\S]*correct_spelling_normalized,[\s\S]*dialect_code,[\s\S]*normalization_version[\s\S]*where mapping_status = 'active'[\s\S]*resolver_visibility_status = 'visible'/,
  "R1 migration must add an active visible exact-pair lookup index.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.micro_skill_catalog\b/i,
  "R1 migration must not mutate micro_skill_catalog.",
);

assert.match(
  canonicalRepository,
  /import "server-only"/,
  "Resolver-visible canonical mapping helper must stay server-only.",
);
assert.match(
  canonicalRepository,
  /findResolverVisibleExactPairMapping/,
  "R1 must expose the resolver-visible exact-pair read helper.",
);
assert.match(
  canonicalRepository,
  /\.from\("spelling_canonical_mappings"\)[\s\S]*\.eq\("mapping_status", "active"\)[\s\S]*\.eq\("resolver_visibility_status", "visible"\)/,
  "Helper must require active resolver-visible canonical mappings.",
);
assert.match(
  canonicalRepository,
  /\.eq\("misspelling_normalized", misspellingNormalized\)[\s\S]*\.eq\("dialect_code", dialectCode\)[\s\S]*\.eq\("normalization_version", normalizationVersion\)/,
  "Helper must query by exact misspelling, dialect, and normalization version.",
);
assert.match(
  canonicalRepository,
  /correct_spelling_normalized !== correctSpellingNormalized/,
  "Helper must block same-misspelling visible mappings with a different correction.",
);
assert.match(
  canonicalRepository,
  /conflicting_visible_micro_skills/,
  "Helper must expose a blocked result for conflicting visible micro-skills.",
);
assert.match(
  canonicalRepository,
  /\.from\("spelling_canonical_mapping_events"\)[\s\S]*resolver_visibility_enabled[\s\S]*new_resolver_visibility_status"[\s\S]*"visible"/,
  "Helper must require resolver visibility enable audit history.",
);
assert.match(
  canonicalRepository,
  /\.from\("micro_skill_catalog"\)[\s\S]*mastery_domain_key", "D4"[\s\S]*is_active", true[\s\S]*is_assignable", true/,
  "Helper must revalidate active assignable D4 micro-skill truth.",
);

assert.doesNotMatch(
  pureResolverSources,
  /findResolverVisibleExactPairMapping|resolver_visibility_status|resolver_visibility_enabled/,
  "R1/R3 must keep Stage 2C and Stage 3A pure helpers free of resolver-visible database reads.",
);
assert.match(
  approvedR3RuntimeResolverSources,
  /app\/courses\/review\/resolver-visible-priority|resolver-visible-priority|findResolverVisibleExactPairMapping/,
  "R3 may wire resolver-visible mappings only through the approved server-side priority helper.",
);
assert.doesNotMatch(
  reviewWorkPage,
  /findResolverVisibleExactPairMapping|resolver_visibility_status|resolver_visibility_enabled/,
  "R1 must not change Review Work behavior or display resolver visibility controls.",
);
assert.doesNotMatch(
  adminActionSources,
  /resolver_visibility_status|resolver_visibility_enabled|resolver_visibility_disabled/,
  "R1 must not add admin enable/disable resolver visibility actions.",
);
assert.match(
  adminActionSources,
  /resolver_visible:\s*false/,
  "Existing admin canonical/PCRM actions must preserve resolver non-effect metadata.",
);
assert.doesNotMatch(
  adminActionSources,
  /resolver_visible:\s*true/,
  "R1 admin actions must not make recommendations or canonical mappings resolver-visible.",
);

console.log("writing-engine-resolver-visible-canonical-mapping-regression: ok");
