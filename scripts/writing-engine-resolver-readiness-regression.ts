import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  classifyResolverVisibilityReadiness,
  type ResolverVisibilityReadinessInput,
} from "../lib/writing-engine/spelling/resolver-visibility-readiness";

const classifierPath =
  "lib/writing-engine/spelling/resolver-visibility-readiness.ts";
const readinessPagePath =
  "app/admin/spelling-canonical-resolver-readiness/page.tsx";
const hubPagePath = "app/admin/spelling-review/page.tsx";
const appShellPath = "components/app-shell.tsx";
const resolverPath =
  "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts";
const stage2aPath =
  "lib/writing-engine/spelling/stage2a-content-resolver.ts";
const reviewWorkPagePath = "app/courses/review/page.tsx";
const assignmentPath = "lib/writing-engine/assignments/service.ts";
const masteryPath = "lib/writing-engine/mastery/service.ts";
const rewardsPath = "lib/rewards/ledger.ts";
const dashboardPath = "app/dashboard/page.tsx";
const analyticsPath = "lib/writing-engine/analytics/events.ts";
const scoringPath = "lib/writing-engine/core/verification.ts";
const templatesPath =
  "lib/writing-engine/spelling/stage2d-lesson-template-registry.ts";
const childrenPath = "lib/children.ts";

assert.ok(existsSync(classifierPath), "Slice 4G.0 classifier must exist.");
assert.ok(existsSync(readinessPagePath), "Slice 4G.0 admin page must exist.");

const baseInput: ResolverVisibilityReadinessInput = {
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
  events: [
    {
      eventType: "created",
      newStatus: "active",
      sourceSeedImportRowId: "seed-1",
    },
    {
      eventType: "seed_import_adopted",
      newStatus: "active",
      sourceSeedImportRowId: "seed-1",
    },
  ],
  seedImportRow: {
    id: "seed-1",
    rowStatus: "adopted_hidden_canonical",
    canonicalMappingId: "mapping-1",
  },
  peerMappings: [
    {
      id: "mapping-1",
      misspellingNormalized: "buisness",
      correctSpellingNormalized: "business",
      microSkillKey: "D4_TEST_SKILL",
      mappingStatus: "active",
      resolverVisibilityStatus: "hidden",
      dialectCode: "en-GB",
    },
  ],
};

function classify(input: ResolverVisibilityReadinessInput) {
  return classifyResolverVisibilityReadiness(input);
}

assert.equal(
  classify(baseInput).state,
  "eligible_for_visibility_review",
  "Eligible hidden seed-adopted mapping must be review-ready.",
);
assert.equal(
  classify(baseInput).source,
  "seed_import_4f_adoption",
  "Eligible seed mapping must keep seed-import lineage source.",
);

assert.deepEqual(
  classify({
    ...baseInput,
    mapping: {
      ...baseInput.mapping!,
      resolverVisibilityStatus: "visible",
    },
  }).blockingReasons,
  ["mapping_not_hidden"],
  "Visible mappings must be blocked by the pure classifier and excluded by the page.",
);

assert.match(
  classify({
    ...baseInput,
    microSkill: {
      microSkillKey: "D4_TEST_SKILL",
      masteryDomainKey: "D3",
      isActive: true,
      isAssignable: true,
    },
  }).blockingReasons.join(","),
  /micro_skill_not_active_assignable_d4/,
  "Inactive, non-assignable, or non-D4 skills must be blocked.",
);

assert.match(
  classify({
    ...baseInput,
    mapping: {
      ...baseInput.mapping!,
      sourceSeedImportRowId: null,
    },
    seedImportRow: null,
  }).blockingReasons.join(","),
  /missing_authority_lineage/,
  "Hidden mapping with missing lineage must be blocked.",
);

assert.match(
  classify({
    ...baseInput,
    events: [{ eventType: "created", newStatus: "active" }],
  }).blockingReasons.join(","),
  /missing_adoption_event/,
  "Hidden seed-adopted mapping without an adoption event must be blocked.",
);

assert.match(
  classify({
    ...baseInput,
    events: [{ eventType: "seed_import_adopted", newStatus: "active" }],
  }).blockingReasons.join(","),
  /missing_created_event/,
  "Hidden mapping without creation event must be blocked.",
);

assert.match(
  classify({
    ...baseInput,
    peerMappings: [
      ...(baseInput.peerMappings ?? []),
      {
        id: "mapping-2",
        misspellingNormalized: "buisness",
        correctSpellingNormalized: "business",
        microSkillKey: "D4_OTHER_SKILL",
        mappingStatus: "active",
        resolverVisibilityStatus: "hidden",
        dialectCode: "en-GB",
      },
    ],
  }).blockingReasons.join(","),
  /exact_pair_duplicate_different_micro_skill/,
  "Exact-pair active mapping with a different micro-skill must be blocked.",
);

assert.equal(
  classify({
    ...baseInput,
    peerMappings: [
      ...(baseInput.peerMappings ?? []),
      {
        id: "mapping-3",
        misspellingNormalized: "buisness",
        correctSpellingNormalized: "busyness",
        microSkillKey: "D4_TEST_SKILL",
        mappingStatus: "active",
        resolverVisibilityStatus: "hidden",
        dialectCode: "en-GB",
      },
    ],
  }).state,
  "needs_manual_authority_review",
  "Same misspelling/dialect with different correction must require manual authority review.",
);

assert.match(
  classify({
    ...baseInput,
    mapping: {
      ...baseInput.mapping!,
      mappingStatus: "disabled",
    },
  }).blockingReasons.join(","),
  /mapping_not_active/,
  "Disabled mappings must not be eligible.",
);
assert.match(
  classify({
    ...baseInput,
    mapping: {
      ...baseInput.mapping!,
      mappingStatus: "deprecated",
    },
  }).blockingReasons.join(","),
  /mapping_not_active/,
  "Deprecated mappings must not be eligible.",
);
assert.match(
  classify({
    ...baseInput,
    mapping: {
      ...baseInput.mapping!,
      mappingStatus: "superseded",
    },
  }).blockingReasons.join(","),
  /mapping_not_active/,
  "Superseded mappings must not be eligible.",
);

const pcrmInput: ResolverVisibilityReadinessInput = {
  ...baseInput,
  mapping: {
    ...baseInput.mapping!,
    sourceSeedImportRowId: null,
    sourceRecommendationId: "recommendation-1",
  },
  seedImportRow: null,
  recommendation: {
    id: "recommendation-1",
    recommendationStatus: "accepted",
    canonicalMappingId: "mapping-1",
  },
  events: [
    { eventType: "created", newStatus: "active" },
    { eventType: "pcrm_adopted", newStatus: "active" },
  ],
};

assert.equal(
  classify(pcrmInput).state,
  "eligible_for_visibility_review",
  "Accepted/adopted PCRM lineage can be eligible for readiness review.",
);
assert.equal(
  classify(pcrmInput).source,
  "pcrm_adoption",
  "PCRM lineage must be classified distinctly from seed adoption.",
);

const page = readFileSync(readinessPagePath, "utf8");
const classifier = readFileSync(classifierPath, "utf8");
const hubPage = readFileSync(hubPagePath, "utf8");
const appShell = readFileSync(appShellPath, "utf8");

const pageFunction = page.slice(
  page.indexOf(
    "export default async function AdminSpellingCanonicalResolverReadinessPage",
  ),
);
const requireAdminIndex = pageFunction.indexOf("await requireAdminUser()");
const readModelIndex = pageFunction.indexOf("await getReadinessPage");

assert.ok(
  requireAdminIndex >= 0 && readModelIndex > requireAdminIndex,
  "Readiness page must authorize admin access before service-role reads.",
);
assert.match(
  page,
  /createServiceRoleClient/,
  "Readiness page must use the server-only service-role boundary.",
);
assert.match(
  page,
  /\.rpc\(\s*"get_spelling_canonical_resolver_readiness_admin"/,
  "Readiness page must use the bounded service-role read model RPC.",
);
assert.doesNotMatch(
  page,
  /\.from\("spelling_canonical_mappings"\)|\.from\("spelling_canonical_mapping_events"\)|\.from\("spelling_seed_import_rows"\)|\.from\("spelling_canonical_mapping_recommendations"\)/,
  "Readiness page must not fan out across direct Supabase table reads.",
);
assert.match(
  page,
  /Readiness is audit-only[\s\S]*not assignment eligibility[\s\S]*mastery/,
  "Readiness page must disclose non-runtime, non-mastery semantics.",
);
assert.match(
  page,
  /Future action placeholder[\s\S]*intentionally\s+unavailable/,
  "Slice 4G.0 may only render disabled future action copy.",
);
assert.doesNotMatch(
  page,
  /<form|action=\{|Enable visibility|enableResolverVisibilityForCanonicalMappingAdmin|set_spelling_canonical_mapping_resolver_visibility_admin/,
  "Readiness page must not expose or call resolver visibility enablement.",
);
assert.doesNotMatch(
  page,
  /\.(insert|update|upsert|delete)\(/,
  "Readiness page must not write to Supabase.",
);
assert.doesNotMatch(
  page,
  /set_spelling_canonical_mapping_resolver_visibility_admin|enableResolverVisibilityForCanonicalMappingAdmin/,
  "Readiness page must not call resolver visibility mutation RPCs/actions.",
);
assert.doesNotMatch(
  page,
  /SERVICE_ROLE|SUPABASE_SERVICE_ROLE|service_role/i,
  "Readiness page must not expose service-role credentials or grant names.",
);
assert.doesNotMatch(
  classifier,
  /createServiceRoleClient|\.from\(|\.rpc\(|insert|update|upsert|delete/,
  "Readiness classifier must stay pure and regression-testable.",
);
assert.match(
  hubPage,
  /href="\/admin\/spelling-canonical-resolver-readiness"/,
  "Admin spelling hub must link to resolver readiness.",
);
assert.match(
  appShell,
  /label: "Resolver Readiness"[\s\S]*href: "\/admin\/spelling-canonical-resolver-readiness"/,
  "Admin navigation must include resolver readiness.",
);

const sideEffectSources = [
  readFileSync(resolverPath, "utf8"),
  readFileSync(stage2aPath, "utf8"),
  readFileSync(reviewWorkPagePath, "utf8"),
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
  /spelling-canonical-resolver-readiness|classifyResolverVisibilityReadiness|resolver_visibility_readiness/i,
  "Slice 4G.0 must not wire readiness into resolver, Review Work, assignment, mastery, reward, dashboard, analytics, scoring, template, or parent/child workflows.",
);

const migrations = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .map((name) => [name, readFileSync(join("supabase/migrations", name), "utf8")] as const);

assert.equal(
  migrations.filter(
    ([name]) =>
      (/4g|readiness/i.test(name) &&
        name !==
          "20260618183000_add_resolver_readiness_admin_read_model.sql"),
  ).length,
  0,
  "Slice 4G.0 must not have migrations beyond the approved 4G.0a read model.",
);
assert.deepEqual(
  migrations
    .filter(([name]) => /4g|readiness/i.test(name))
    .filter(([, source]) => /resolver_visibility_enabled/i.test(source))
    .map(([name]) => name),
  [],
  "Slice 4G.0 must not add a migration that can produce resolver visibility enable events.",
);
assert.deepEqual(
  migrations
    .filter(([name]) => /4g|readiness/i.test(name))
    .filter(([, source]) => /grant\s+.*\s+to\s+(anon|authenticated)/i.test(source))
    .map(([name]) => name),
  [],
  "Slice 4G.0 must not add anon/authenticated grants.",
);

const changedSliceSources = [page, classifier, hubPage, appShell].join("\n");

assert.doesNotMatch(
  changedSliceSources,
  /\.from\("micro_skill_catalog"\)[\s\S]*\.(insert|update|upsert|delete)\(/,
  "Slice 4G.0 must not mutate micro_skill_catalog.",
);
assert.doesNotMatch(
  changedSliceSources,
  /resolver_visible:\s*true|resolver_visibility_status:\s*"visible"|resolver_visibility_enabled/,
  "Slice 4G.0 must not mark mappings resolver-visible or create enable events.",
);

console.log("writing-engine-resolver-readiness-regression: ok");
