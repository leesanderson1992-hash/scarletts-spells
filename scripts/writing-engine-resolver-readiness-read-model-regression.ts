import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  classifyResolverVisibilityReadiness,
  type ResolverVisibilityReadinessInput,
} from "../lib/writing-engine/spelling/resolver-visibility-readiness";

const migrationPath =
  "supabase/migrations/20260618183000_add_resolver_readiness_admin_read_model.sql";
const pagePath = "app/admin/spelling-canonical-resolver-readiness/page.tsx";
const classifierPath =
  "lib/writing-engine/spelling/resolver-visibility-readiness.ts";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const stage2aPath =
  "lib/writing-engine/spelling/stage2a-content-resolver.ts";
const reviewWorkPath = "app/courses/review/page.tsx";
const assignmentPath = "lib/writing-engine/assignments/service.ts";
const masteryPath = "lib/writing-engine/mastery/service.ts";
const rewardsPath = "lib/rewards/ledger.ts";
const dashboardPath = "app/dashboard/page.tsx";
const analyticsPath = "lib/writing-engine/analytics/events.ts";
const scoringPath = "lib/writing-engine/core/verification.ts";
const templatesPath =
  "lib/writing-engine/spelling/stage2d-lesson-template-registry.ts";
const childrenPath = "lib/children.ts";

assert.ok(existsSync(migrationPath), "Slice 4G.0a read model migration must exist.");

const migration = readFileSync(migrationPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const classifier = readFileSync(classifierPath, "utf8");

assert.match(
  migration,
  /create or replace function public\.get_spelling_canonical_resolver_readiness_admin/,
  "4G.0a must add a dedicated admin readiness read model RPC.",
);
assert.match(
  migration,
  /returns table \([\s\S]*total_count bigint[\s\S]*readiness_row jsonb/,
  "Read model RPC must return paginated rows plus total count.",
);
assert.match(
  migration,
  /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/,
  "Read model RPC must enforce pagination bounds.",
);
assert.match(
  migration,
  /where m\.mapping_status = 'active'[\s\S]*and m\.resolver_visibility_status = 'hidden'/,
  "Read model candidates must be only active hidden mappings.",
);
assert.doesNotMatch(
  migration,
  /where m\.mapping_status = 'active'[\s\S]*resolver_visibility_status = 'visible'/,
  "Visible mappings must not be candidates.",
);
assert.match(
  migration,
  /bool_or\(e\.event_type = 'created' and e\.new_status = 'active'\) as has_created_event/,
  "Read model must precompute creation-event presence.",
);
assert.match(
  migration,
  /bool_or\(e\.event_type = 'seed_import_adopted'\) as has_seed_import_adopted_event/,
  "Read model must precompute seed adoption-event presence.",
);
assert.match(
  migration,
  /bool_or\(e\.event_type = 'pcrm_adopted'\) as has_pcrm_adopted_event/,
  "Read model must precompute PCRM adoption-event presence.",
);
assert.match(
  migration,
  /limit 3/,
  "Read model must bound latest events for display.",
);
assert.match(
  migration,
  /seed\.row_status[\s\S]*seed\.canonical_mapping_id/,
  "Read model must include seed-import adopted linkage inputs.",
);
assert.match(
  migration,
  /rec\.recommendation_status[\s\S]*rec\.canonical_mapping_id/,
  "Read model must include PCRM accepted/adopted linkage inputs.",
);
assert.match(
  migration,
  /has_active_exact_pair_different_micro_skill/,
  "Read model must precompute exact-pair different-skill conflicts.",
);
assert.match(
  migration,
  /has_active_same_misspelling_conflicting_correction/,
  "Read model must precompute same-misspelling correction conflicts.",
);
assert.match(
  migration,
  /has_inactive_exact_pair_historical_mapping/,
  "Read model must precompute disabled/deprecated/superseded exact-pair blockers.",
);
assert.match(
  migration,
  /p\.requested_state is null[\s\S]*or p\.requested_state = 'all'[\s\S]*or p\.requested_state = case/,
  "Read model must support DB-level readiness state filtering.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.(spelling_canonical_mappings|spelling_canonical_mapping_events|micro_skill_catalog)\b/i,
  "Read model migration must not mutate canonical mappings, events, or micro_skill_catalog.",
);
assert.doesNotMatch(
  migration,
  /resolver_visibility_enabled/,
  "Read model migration must not produce resolver visibility enable events.",
);
assert.match(
  migration,
  /revoke all on function public\.get_spelling_canonical_resolver_readiness_admin[\s\S]*from public[\s\S]*from anon[\s\S]*from authenticated/,
  "Read model RPC must revoke public, anon, and authenticated access.",
);
assert.match(
  migration,
  /grant execute on function public\.get_spelling_canonical_resolver_readiness_admin[\s\S]*to service_role/,
  "Read model RPC must be executable only by service_role.",
);
assert.doesNotMatch(
  migration,
  /grant\s+(select|execute|all)[\s\S]*to\s+(anon|authenticated)/i,
  "4G.0a migration must not add anon/authenticated grants.",
);

const pageFunction = page.slice(
  page.indexOf(
    "export default async function AdminSpellingCanonicalResolverReadinessPage",
  ),
);
const requireAdminIndex = pageFunction.indexOf("await requireAdminUser()");
const readIndex = pageFunction.indexOf("await getReadinessPage");

assert.ok(
  requireAdminIndex >= 0 && readIndex > requireAdminIndex,
  "Readiness page must call requireAdminUser before service-role read model use.",
);
assert.match(
  page,
  /\.rpc\(\s*"get_spelling_canonical_resolver_readiness_admin"/,
  "Readiness page must use the performance read model RPC.",
);
assert.match(
  page,
  /p_limit:\s*PAGE_SIZE[\s\S]*p_offset:\s*offset[\s\S]*p_readiness_state:\s*input\.state/,
  "Readiness page must pass pagination and filter inputs to the read model.",
);
assert.match(
  page,
  /const PAGE_SIZE = 25/,
  "Readiness UI must use bounded page size.",
);
assert.match(
  page,
  /PaginationControls/,
  "Readiness UI must expose pagination controls.",
);
assert.doesNotMatch(
  page,
  /\.from\("spelling_canonical_mappings"\)|\.from\("spelling_canonical_mapping_events"\)|\.from\("spelling_seed_import_rows"\)|\.from\("spelling_canonical_mapping_recommendations"\)/,
  "Readiness page must not fan out across Supabase table reads.",
);
assert.doesNotMatch(
  page,
  /<form|action=\{|Enable visibility|set_spelling_canonical_mapping_resolver_visibility_admin|enableResolverVisibilityForCanonicalMappingAdmin/,
  "Readiness page must not expose or call visibility enablement.",
);
assert.doesNotMatch(
  classifier,
  /createServiceRoleClient|\.from\(|\.rpc\(|insert|update|upsert|delete/,
  "Classifier must remain pure after adding read-model summaries.",
);

const summaryInput: ResolverVisibilityReadinessInput = {
  mapping: {
    id: "mapping-1",
    misspellingNormalized: "buisness",
    correctSpellingNormalized: "business",
    microSkillKey: "D4_TEST_SKILL",
    mappingStatus: "active",
    resolverVisibilityStatus: "hidden",
    dialectCode: "en-GB",
    sourceSeedImportRowId: "seed-1",
  },
  microSkill: {
    microSkillKey: "D4_TEST_SKILL",
    masteryDomainKey: "D4",
    isActive: true,
    isAssignable: true,
  },
  eventSummary: {
    hasCreatedEvent: true,
    hasSeedImportAdoptedEvent: true,
    hasPcrmAdoptedEvent: false,
  },
  seedImportRow: {
    id: "seed-1",
    rowStatus: "adopted_hidden_canonical",
    canonicalMappingId: "mapping-1",
  },
  conflictSummary: {
    hasActiveExactPairDifferentMicroSkill: false,
    hasActiveSameMisspellingConflictingCorrection: false,
    hasInactiveExactPairHistoricalMapping: false,
  },
};

assert.equal(
  classifyResolverVisibilityReadiness(summaryInput).state,
  "eligible_for_visibility_review",
  "Classifier must accept precomputed read-model summaries.",
);
assert.match(
  classifyResolverVisibilityReadiness({
    ...summaryInput,
    eventSummary: {
      hasCreatedEvent: false,
      hasSeedImportAdoptedEvent: true,
      hasPcrmAdoptedEvent: false,
    },
  }).blockingReasons.join(","),
  /missing_created_event/,
  "Classifier must block missing creation event from event summary.",
);
assert.match(
  classifyResolverVisibilityReadiness({
    ...summaryInput,
    eventSummary: {
      hasCreatedEvent: true,
      hasSeedImportAdoptedEvent: false,
      hasPcrmAdoptedEvent: false,
    },
  }).blockingReasons.join(","),
  /missing_adoption_event/,
  "Classifier must block missing adoption event from event summary.",
);
assert.match(
  classifyResolverVisibilityReadiness({
    ...summaryInput,
    conflictSummary: {
      hasActiveExactPairDifferentMicroSkill: true,
      hasActiveSameMisspellingConflictingCorrection: false,
      hasInactiveExactPairHistoricalMapping: false,
    },
  }).blockingReasons.join(","),
  /exact_pair_duplicate_different_micro_skill/,
  "Classifier must consume read-model exact-pair conflict summary.",
);
assert.equal(
  classifyResolverVisibilityReadiness({
    ...summaryInput,
    conflictSummary: {
      hasActiveExactPairDifferentMicroSkill: false,
      hasActiveSameMisspellingConflictingCorrection: true,
      hasInactiveExactPairHistoricalMapping: false,
    },
  }).state,
  "needs_manual_authority_review",
  "Classifier must consume read-model same-misspelling conflict summary.",
);

const sideEffectSources = [
  readFileSync(resolverPath, "utf8"),
  readFileSync(stage2aPath, "utf8"),
  readFileSync(reviewWorkPath, "utf8"),
  readFileSync(assignmentPath, "utf8"),
  readFileSync(masteryPath, "utf8"),
  readFileSync(rewardsPath, "utf8"),
  readFileSync(dashboardPath, "utf8"),
  readFileSync(analyticsPath, "utf8"),
  readFileSync(scoringPath, "utf8"),
  readFileSync(templatesPath, "utf8"),
  readFileSync(childrenPath, "utf8"),
].join("\n");

assert.doesNotMatch(
  sideEffectSources,
  /get_spelling_canonical_resolver_readiness_admin|classifyResolverVisibilityReadiness|resolver-readiness/i,
  "4G.0a must not wire readiness into resolver, Review Work, assignment, mastery, rewards, dashboard, analytics, scoring, templates, or parent/child access.",
);

console.log("writing-engine-resolver-readiness-read-model-regression: ok");
