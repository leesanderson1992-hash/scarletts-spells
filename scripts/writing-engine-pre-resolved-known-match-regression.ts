import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  preResolveReturnedCorrectionKnownMatch,
  type ReturnedCorrectionKnownMatchIssue,
} from "../lib/writing-engine/persistence/returned-correction-known-match";

function issue(
  overrides: Partial<ReturnedCorrectionKnownMatchIssue> = {},
): ReturnedCorrectionKnownMatchIssue {
  return {
    id: "issue-1",
    child_id: "child-1",
    parent_user_id: "parent-1",
    issue_status: "child_responded",
    final_classification: null,
    observed_text: "wosh",
    suggested_replacement: "wash",
    approved_replacement: "wash",
    micro_skill_key: "unknown",
    metadata: {},
    ...overrides,
  };
}

function resolvedLookup() {
  return Promise.resolve({
    status: "resolved" as const,
    source: "resolver_visible_canonical_exact_pair" as const,
    mappingId: "mapping-wosh-wash",
    misspellingNormalized: "wosh",
    correctSpellingNormalized: "wash",
    microSkillKey: "D4_WASH",
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
  });
}

function fakePersistence() {
  const updates: unknown[] = [];
  const chain = {
    update(value: unknown) {
      updates.push(value);
      return chain;
    },
    eq() {
      return chain;
    },
    in() {
      return chain;
    },
    is() {
      return chain;
    },
    select() {
      return chain;
    },
    async maybeSingle() {
      return { data: { id: "issue-1" }, error: null };
    },
  };

  return {
    updates,
    supabase: {
      from(table: string) {
        assert.equal(table, "writing_issues");
        return chain;
      },
    },
  };
}

async function main() {
  const persistence = fakePersistence();
  const openIssue = issue();
  const result = await preResolveReturnedCorrectionKnownMatch({
    supabase: persistence.supabase as never,
    issue: openIssue,
    nowIso: "2026-08-07T12:00:00.000Z",
    canonicalLookup: resolvedLookup as never,
  });

  assert.deepEqual(result, {
    status: "resolved",
    mappingId: "mapping-wosh-wash",
    microSkillKey: "D4_WASH",
  });
  assert.equal(persistence.updates.length, 1);
  assert.deepEqual(persistence.updates[0], {
    micro_skill_key: "D4_WASH",
    metadata: {
      known_match_auto_resolution: {
        authority: "known_match",
        authority_reference:
          "spelling_canonical_mappings:mapping-wosh-wash",
        canonical_mapping_id: "mapping-wosh-wash",
        canonical_correction: "wash",
        dialect_code: "en-GB",
        micro_skill_key: "D4_WASH",
        normalization_version: "spelling_normalize_v1",
        resolved_at: "2026-08-07T12:00:00.000Z",
      },
    },
    updated_at: "2026-08-07T12:00:00.000Z",
  });
  assert.equal(openIssue.final_classification, null);

  const alreadyResolved = issue({
    micro_skill_key: "D4_WASH",
    metadata: {
      known_match_auto_resolution: {
        authority: "known_match",
        canonical_mapping_id: "mapping-wosh-wash",
        micro_skill_key: "D4_WASH",
        resolved_at: "2026-08-07T11:00:00.000Z",
      },
    },
  });
  const idempotentPersistence = fakePersistence();
  const idempotentResult = await preResolveReturnedCorrectionKnownMatch({
    supabase: idempotentPersistence.supabase as never,
    issue: alreadyResolved,
    canonicalLookup: resolvedLookup as never,
  });
  assert.equal(idempotentResult.status, "already_resolved");
  assert.equal(idempotentPersistence.updates.length, 0);

  const unsafeResult = await preResolveReturnedCorrectionKnownMatch({
    supabase: fakePersistence().supabase as never,
    issue: issue(),
    persist: false,
    canonicalLookup: (async () => ({
      status: "blocked" as const,
      reason: "conflicting_visible_micro_skills" as const,
      mappingIds: ["mapping-1", "mapping-2"],
    })) as never,
  });
  assert.deepEqual(unsafeResult, {
    status: "not_resolved",
    reason: "conflicting_visible_micro_skills",
  });

  const submissionProcessing = readFileSync(
    "lib/courses/submission-processing.ts",
    "utf8",
  );
  assert.match(
    submissionProcessing,
    /writing_issue_correction_attempts"\)\.insert\(rows\)[\s\S]*preResolveReturnedCorrectionKnownMatch[\s\S]*issue_status: "child_responded"/,
    "Retry evidence must be durable before route pre-resolution, and route pre-resolution must precede child_responded visibility.",
  );

  console.log("writing-engine-pre-resolved-known-match-regression: ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
