import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION,
  normalizeReviewWritingGoldBarEffectiveAt,
  qualifyReviewWritingGoldBarUse,
  REVIEW_WRITING_GOLD_BAR_PRODUCTION_EFFECTIVE_AT_FLOOR,
  reviewWritingGoldBarGateConfig,
} from "../lib/rewards/gold-bar-authentic-use";
import {
  assertReviewWritingGoldBarEffectiveAtAuthority,
  recordReviewWritingGoldBarUses,
} from "../lib/rewards/review-writing-authentic-use";

const enabled = "enabled";
const effectiveAt = "2026-09-02T08:22:46Z";
const releasePolicy = GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION;
const production = (overrides: Record<string, string | undefined> = {}) => ({
  VERCEL_ENV: "production",
  ...overrides,
});
const exactProduction = production({
  GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
  GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
  GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
});

for (const [name, environment] of Object.entries({
  no_controls: production(),
  enable_only: production({ GOLD_BAR_REVIEW_WRITING_ENABLED: enabled }),
  timestamp_only: production({ GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt }),
  marker_only: production({ GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy }),
  enable_timestamp: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
  }),
  enable_marker: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
  timestamp_marker: production({
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
  wrong_enable: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: "true",
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
  wrong_policy: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: "WORD_TREASURE_AUTHENTIC_USE_V1",
  }),
  marker_case_changed: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy.toLowerCase(),
  }),
  marker_whitespace: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: effectiveAt,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: ` ${releasePolicy}`,
  }),
  malformed_timestamp: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "not-a-time",
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
  impossible_timestamp: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "2026-02-30T12:00:00Z",
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
  ambiguous_local_timestamp: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "2026-09-03T12:00:00",
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
  historical_timestamp: production({
    GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT:
      REVIEW_WRITING_GOLD_BAR_PRODUCTION_EFFECTIVE_AT_FLOOR,
    GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
  }),
})) {
  assert.equal(reviewWritingGoldBarGateConfig(environment), null, `${name} must fail closed`);
}

assert.deepEqual(reviewWritingGoldBarGateConfig(exactProduction), {
  policyVersion: releasePolicy,
  effectiveAt: "2026-09-02T08:22:46.000Z",
});
assert.deepEqual(reviewWritingGoldBarGateConfig({
  VERCEL_ENV: "production",
  GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
  GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "2026-09-02T09:22:46+01:00",
  GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: releasePolicy,
}), {
  policyVersion: releasePolicy,
  effectiveAt: "2026-09-02T08:22:46.000Z",
});

const previewTwoKey = {
  VERCEL_ENV: "preview",
  GOLD_BAR_REVIEW_WRITING_ENABLED: enabled,
  GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "2026-09-01T00:00:00Z",
};
assert.deepEqual(reviewWritingGoldBarGateConfig(previewTwoKey), {
  policyVersion: releasePolicy,
  effectiveAt: "2026-09-01T00:00:00.000Z",
});
assert.deepEqual(reviewWritingGoldBarGateConfig({
  ...previewTwoKey,
  GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY: "ignored-outside-production",
}), reviewWritingGoldBarGateConfig(previewTwoKey));

assert.equal(normalizeReviewWritingGoldBarEffectiveAt("2026-02-29T12:00:00Z"), null);
assert.equal(normalizeReviewWritingGoldBarEffectiveAt("2028-02-29T12:00:00Z"),
  "2028-02-29T12:00:00.000Z");
assert.equal(normalizeReviewWritingGoldBarEffectiveAt("2026-09-02 12:00:00Z"), null);
assert.equal(normalizeReviewWritingGoldBarEffectiveAt("2026-09-02T12:00:00+14:01"), null);

const qualificationBase = {
  reviewCompleted: true,
  sourceEventActive: true,
  provenanceKind: "prompted_review_writing_application",
  useKind: "authentic_correct_use",
  writingDisposition: "correct_in_writing",
  originalOutcome: "success",
  originalOutcomeSource: "writing",
  repairState: "not_required",
  exactAuthoredOccurrence: true,
  answerVisibilityStatus: "HIDDEN" as const,
  contextValidationStatus: "NOT_REQUIRED" as const,
  enteredForgeAt: "2026-09-02T08:00:00.000Z",
  policyEffectiveAt: "2026-09-02T08:22:46.000Z",
};
assert.equal(qualifyReviewWritingGoldBarUse({
  ...qualificationBase,
  writingSubmittedAt: "2026-09-02T08:22:45.999Z",
}).status, "INELIGIBLE", "pre-effective evidence must not qualify");
assert.equal(qualifyReviewWritingGoldBarUse({
  ...qualificationBase,
  writingSubmittedAt: "2026-09-02T08:22:46.000Z",
}).status, "ELIGIBLE", "the exact >= boundary must qualify");
assert.equal(qualifyReviewWritingGoldBarUse({
  ...qualificationBase,
  writingSubmittedAt: "2026-09-02T08:22:46.001Z",
}).status, "ELIGIBLE", "post-effective evidence may qualify");
assert.equal(qualifyReviewWritingGoldBarUse({
  ...qualificationBase,
  writingSubmittedAt: "2026-09-02T08:22:46.001Z",
  enteredForgeAt: "2026-09-02T08:22:46.002Z",
}).status, "INELIGIBLE", "pre-Forge evidence must not qualify");

function authorityClient(persistedEffectiveAt: string | null) {
  let rpcCalls = 0;
  let selectedTable = "";
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({
      data: persistedEffectiveAt === null ? null : { policy_effective_at: persistedEffectiveAt },
      error: null,
    }),
  };
  const client = {
    from: (table: string) => {
      selectedTable = table;
      return builder;
    },
    rpc: async () => {
      rpcCalls += 1;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, selectedTable: () => selectedTable, rpcCalls: () => rpcCalls };
}

async function main(): Promise<void> {
  const gate = reviewWritingGoldBarGateConfig(exactProduction);
  assert.ok(gate);
  const noAuthority = authorityClient(null);
  await assertReviewWritingGoldBarEffectiveAtAuthority({ client: noAuthority.client, gate });
  assert.equal(noAuthority.rpcCalls(), 0, "resolving configuration/authority must not write rewards");

  const matchingAuthority = authorityClient("2026-09-02T09:22:46+01:00");
  await assertReviewWritingGoldBarEffectiveAtAuthority({ client: matchingAuthority.client, gate });
  assert.equal(matchingAuthority.rpcCalls(), 0);

  const conflictingAuthority = authorityClient("2026-09-02T08:22:47.000Z");
  await assert.rejects(
    assertReviewWritingGoldBarEffectiveAtAuthority({ client: conflictingAuthority.client, gate }),
    /effective_at_authority_conflict/,
  );
  assert.equal(conflictingAuthority.rpcCalls(), 0);

  const consumerConflict = authorityClient("2026-09-02T08:22:47.000Z");
  await assert.rejects(recordReviewWritingGoldBarUses({
    client: consumerConflict.client,
    reviewSessionId: "00000000-0000-4000-8000-000000000001",
    gate,
  }), /effective_at_authority_conflict/);
  assert.equal(
    consumerConflict.selectedTable(),
    "child_word_treasure_review_use_qualifications",
    "the runtime consumer must check the immutable reward-owned authority first",
  );
  assert.equal(consumerConflict.rpcCalls(), 0, "an effective-time conflict must fail before reward RPC");

  console.log("GB.5D Production activation-gate regression passed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
