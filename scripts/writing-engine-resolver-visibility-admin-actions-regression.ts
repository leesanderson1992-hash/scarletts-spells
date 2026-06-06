import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260605144500_add_resolver_visibility_admin_rpc.sql";
const canonicalRepositoryPath =
  "lib/writing-engine/persistence/spelling-canonical-mappings.ts";
const adminActionsPath = "app/admin/canonical-mappings/actions.ts";
const adminPagePath = "app/admin/canonical-mappings/page.tsx";
const spellingReviewPagePath = "app/admin/spelling-review/page.tsx";
const adminCatalogActionPath = "app/admin/catalog-review/actions.ts";
const adminPcrmActionPath = "app/admin/canonical-recommendations/actions.ts";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const stage3aAnalysisPath =
  "lib/writing-engine/spelling/stage3a-authentic-submission-analysis.ts";
const resolverPriorityPath = "app/courses/review/resolver-visible-priority.ts";
const canonicalBackfillPath =
  "app/courses/review/actions/canonical-spelling-backfill-actions.ts";
const canonicalSubmissionActionsPath =
  "app/courses/review/canonical-submission-spelling-actions.ts";
const reviewWorkPagePath = "app/courses/review/[submissionId]/page.tsx";

const migration = readFileSync(migrationPath, "utf8");
const canonicalRepository = readFileSync(canonicalRepositoryPath, "utf8");
const adminActions = readFileSync(adminActionsPath, "utf8");
const adminPage = readFileSync(adminPagePath, "utf8");
const spellingReviewPage = readFileSync(spellingReviewPagePath, "utf8");
const existingAdminActions = [
  readFileSync(adminCatalogActionPath, "utf8"),
  readFileSync(adminPcrmActionPath, "utf8"),
].join("\n");
const pureResolverSources = [
  readFileSync(resolverPath, "utf8"),
  readFileSync(stage3aAnalysisPath, "utf8"),
].join("\n");
const approvedR3RuntimeResolverSources = [
  readFileSync(resolverPriorityPath, "utf8"),
  readFileSync(canonicalBackfillPath, "utf8"),
  readFileSync(canonicalSubmissionActionsPath, "utf8"),
].join("\n");
const reviewWorkPage = readFileSync(reviewWorkPagePath, "utf8");

assert.match(
  migration,
  /create or replace function public\.set_spelling_canonical_mapping_resolver_visibility_admin/,
  "R2 migration must add the admin resolver visibility RPC.",
);
assert.match(
  migration,
  /p_new_resolver_visibility_status not in \('visible', 'disabled'\)/,
  "R2 RPC must allow only visible/disabled target statuses.",
);
assert.match(
  migration,
  /where id = p_mapping_id[\s\S]*for update/,
  "R2 RPC must lock the mapping row before validation and update.",
);
assert.match(
  migration,
  /mapping_status <> 'active'/,
  "R2 RPC must require active canonical mappings.",
);
assert.match(
  migration,
  /mastery_domain_key = 'D4'[\s\S]*is_active = true[\s\S]*is_assignable = true/,
  "R2 RPC must validate active assignable D4 micro-skill truth.",
);
assert.match(
  migration,
  /event_type = 'created'[\s\S]*new_status = 'active'/,
  "R2 RPC must require canonical creation audit history before enabling visibility.",
);
assert.match(
  migration,
  /correct_spelling_normalized <> v_mapping\.correct_spelling_normalized/,
  "R2 RPC must block same-misspelling visible mappings with a different correction.",
);
assert.match(
  migration,
  /micro_skill_key <> v_mapping\.micro_skill_key/,
  "R2 RPC must block exact-pair visible mappings with a different micro-skill.",
);
assert.match(
  migration,
  /v_event_type := case[\s\S]*'resolver_visibility_enabled'[\s\S]*'resolver_visibility_disabled'/,
  "R2 RPC must choose resolver visibility audit event types.",
);
assert.match(
  migration,
  /insert into public\.spelling_canonical_mapping_events[\s\S]*event_type[\s\S]*values \([\s\S]*v_event_type/,
  "R2 RPC must write resolver visibility audit events.",
);
assert.match(
  migration,
  /previous_resolver_visibility_status[\s\S]*new_resolver_visibility_status/,
  "R2 RPC must write previous/new resolver visibility audit status.",
);
assert.match(
  migration,
  /action_source'[\s\S]*'resolver_visibility_admin_r2'[\s\S]*'conflict_check'/,
  "R2 RPC audit metadata must include action source and conflict-check summary.",
);
assert.match(
  migration,
  /revoke all on function public\.set_spelling_canonical_mapping_resolver_visibility_admin[\s\S]*from public[\s\S]*from anon[\s\S]*from authenticated/,
  "R2 RPC must not be executable by public, anon, or authenticated.",
);
assert.match(
  migration,
  /grant execute on function public\.set_spelling_canonical_mapping_resolver_visibility_admin[\s\S]*to service_role/,
  "R2 RPC must be service-role only.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.micro_skill_catalog\b/i,
  "R2 migration must not mutate micro_skill_catalog.",
);

assert.match(
  canonicalRepository,
  /enableResolverVisibilityForCanonicalMappingAdmin/,
  "R2 helper must expose an enable helper.",
);
assert.match(
  canonicalRepository,
  /disableResolverVisibilityForCanonicalMappingAdmin/,
  "R2 helper must expose a disable helper.",
);
assert.match(
  canonicalRepository,
  /\.rpc\(\s*"set_spelling_canonical_mapping_resolver_visibility_admin"/,
  "R2 helpers must call the resolver visibility RPC.",
);
assert.doesNotMatch(
  canonicalRepository,
  /\.from\("spelling_canonical_mappings"\)[\s\S]*\.(update|insert|upsert|delete)\(/,
  "R2 helpers must not directly write canonical mapping rows.",
);
assert.doesNotMatch(
  canonicalRepository,
  /\.from\("spelling_canonical_mapping_events"\)[\s\S]*\.(update|insert|upsert|delete)\(/,
  "R2 helpers must not directly write canonical mapping events.",
);

assert.match(
  adminActions,
  /"use server"/,
  "R2 admin visibility actions must be server actions.",
);
assert.match(
  adminActions,
  /requireAdminUser/,
  "R2 admin visibility actions must require an admin user.",
);
assert.match(
  adminActions,
  /enableResolverVisibilityForCanonicalMappingAdmin/,
  "R2 admin actions must call the enable helper.",
);
assert.match(
  adminActions,
  /disableResolverVisibilityForCanonicalMappingAdmin/,
  "R2 admin actions must call the disable helper.",
);
assert.doesNotMatch(
  adminActions,
  /findResolverVisibleExactPairMapping|stage2c|stage3a/i,
  "R2 admin actions must not wire resolver runtime behavior.",
);

assert.match(
  adminPage,
  /spelling_canonical_mappings/,
  "R2 admin page must list canonical mappings.",
);
assert.match(
  adminPage,
  /resolver_visibility_status/,
  "R2 admin page must display resolver visibility status.",
);
assert.match(
  adminPage,
  /required[\s\S]*name="note"|name="note"[\s\S]*required/,
  "R2 admin page must require a note for visibility changes.",
);
assert.match(
  adminPage,
  /mapping\.mapping_status === "active"[\s\S]*resolver_visibility_status === "hidden"[\s\S]*resolver_visibility_status === "disabled"/,
  "R2 admin page must show enable only for active hidden/disabled mappings.",
);
assert.match(
  adminPage,
  /mapping\.mapping_status === "active"[\s\S]*resolver_visibility_status === "visible"/,
  "R2 admin page must show disable only for active visible mappings.",
);
assert.doesNotMatch(
  adminPage,
  /archive|reopen|edit mapping|findResolverVisibleExactPairMapping/i,
  "R2 admin page must not add lifecycle edit/archive controls or resolver runtime calls.",
);
assert.match(
  spellingReviewPage,
  /\/admin\/canonical-mappings/,
  "Admin spelling review hub must link to canonical mapping visibility controls.",
);

assert.doesNotMatch(
  pureResolverSources,
  /findResolverVisibleExactPairMapping|resolver_visibility_status|resolver_visibility_enabled|resolver_visibility_disabled/,
  "R2/R3 must keep Stage 2C and Stage 3A pure helpers free of resolver-visible database reads.",
);
assert.match(
  approvedR3RuntimeResolverSources,
  /app\/courses\/review\/resolver-visible-priority|resolver-visible-priority|findResolverVisibleExactPairMapping/,
  "R3 may wire resolver-visible mappings only through the approved server-side priority helper.",
);
assert.doesNotMatch(
  reviewWorkPage,
  /findResolverVisibleExactPairMapping|resolver_visibility_status|resolver_visibility_enabled|resolver_visibility_disabled/,
  "R2 must not change Review Work behavior or display resolver visibility controls.",
);
assert.match(
  existingAdminActions,
  /resolver_visible:\s*false/,
  "Existing admin canonical/PCRM actions must preserve resolver non-effect metadata.",
);
assert.doesNotMatch(
  existingAdminActions,
  /resolver_visible:\s*true|enableResolverVisibilityForCanonicalMappingAdmin|disableResolverVisibilityForCanonicalMappingAdmin/,
  "Existing catalog/PCRM admin actions must not make PCRM evidence or canonical mappings resolver-visible.",
);

console.log("writing-engine-resolver-visibility-admin-actions-regression: ok");
