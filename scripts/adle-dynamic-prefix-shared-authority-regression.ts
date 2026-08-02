import assert from "node:assert/strict";

import type { ComposedDailyPlan, DailyPlanFacts } from "../lib/adle/daily-assignment-composer";
import { canonicalSnapshotJson } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  buildDynamicPrefixAssignmentPlan,
  validateDynamicPrefixAssignmentPlanAgainstSharedLesson,
} from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import {
  DYNAMIC_PREFIX_COMPILER_AUTHORITIES,
  DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS,
  canPersistDynamicPrefixCompilerDecision,
  compileDynamicPrefixWordLabDecision,
  getDynamicPrefixCompilerAuthority,
  resolveDynamicPrefixCompilerMode,
  validateDynamicPrefixSharedResultIntegrity,
} from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import type {
  DynamicPrefixLessonPayloadV2,
  DynamicPrefixProfile,
  DynamicPrefixSelection,
  DynamicPrefixWord,
} from "../lib/adle/morphology/dynamic-prefix-contracts";
import { compileDynamicPrefixWordLabPayloadLegacy } from "../lib/adle/morphology/dynamic-prefix-legacy-compiler";
import { compileDynamicPrefixSelectionThroughSharedCompiler } from "../lib/adle/morphology/shared-affix-compatibility";
import { SHARED_AFFIX_COMPILER_VERSION } from "../lib/adle/morphology/shared-affix-contracts";
import type { LearningItemFact } from "../lib/adle/learning-items";
import { loadReviewedPrefixPackageFixtures } from "./lib/adle-reviewed-prefix-package-fixture";

function canonical(value: unknown): string {
  return canonicalSnapshotJson(JSON.parse(JSON.stringify(value)) as unknown);
}

function item(
  profile: DynamicPrefixProfile,
  word: DynamicPrefixWord,
  position: number,
): LearningItemFact {
  return {
    learningItemId: `shared-authority:${profile.microSkillKey}:${word.canonicalWordId}:${position}`,
    childId: "shared-authority-fixture-child",
    canonicalWordId: word.canonicalWordId,
    microSkillKey: profile.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "shared-authority-regression",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-08-02",
    rowStatus: "active",
  };
}

function selectionWithAuthenticAt(
  profile: DynamicPrefixProfile,
  words: readonly DynamicPrefixWord[],
  target: DynamicPrefixWord,
  position: number,
): DynamicPrefixSelection {
  const ordered = words.filter((word) => word.canonicalWordId !== target.canonicalWordId).slice(0, 3);
  ordered.splice(position, 0, target);
  return {
    profile,
    authenticTargets: ordered.map((word, index) => item(profile, word, index)),
    transfers: [],
  };
}

const basePlan = {
  childId: "shared-authority-fixture-child",
  planDate: "2026-08-02",
  composerPolicyVersion: "unchanged-fixture",
  schedulePolicyVersion: "unchanged-fixture",
  throttle: {},
  partOne: {},
  partTwo: {},
  budget: {
    budgetResponses: 0,
    estimatedResponses: 0,
    guidedWordCount: 0,
    introTrimmed: false,
    trims: [],
  },
} as unknown as ComposedDailyPlan;

assert.deepEqual(
  DYNAMIC_PREFIX_COMPILER_AUTHORITIES.map((entry) => entry.microSkillKey).sort(),
  ["D4_MOR_PREFIXES_UN", ...DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS].sort(),
  "all five production Prefix profiles have explicit compiler authority",
);
assert.equal(
  getDynamicPrefixCompilerAuthority("D4_MOR_PREFIXES_UN"),
  "legacy_pending_exact_source",
);
for (const key of DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS) {
  assert.equal(getDynamicPrefixCompilerAuthority(key), "shared_migration");
}
assert.equal(resolveDynamicPrefixCompilerMode(undefined), "shadow");
assert.equal(resolveDynamicPrefixCompilerMode("invalid"), "shadow");
assert.equal(resolveDynamicPrefixCompilerMode("enforced_parity"), "enforced_parity");

let exhaustiveCases = 0;
for (const fixture of loadReviewedPrefixPackageFixtures()) {
  assert(
    DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS.includes(
      fixture.profile.microSkillKey as (typeof DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS)[number],
    ),
    `${fixture.profile.microSkillKey}: reviewed fixture is in the four-profile migration`,
  );
  for (const target of fixture.words) {
    for (const authenticPosition of [0, 1, 2, 3]) {
      const selection = selectionWithAuthenticAt(
        fixture.profile,
        fixture.words,
        target,
        authenticPosition,
      );
      const legacy = compileDynamicPrefixWordLabPayloadLegacy(selection);
      assert(legacy, `${fixture.profile.microSkillKey}:${target.canonicalWordId}:${authenticPosition}: legacy`);
      for (const mode of ["shadow", "enforced_parity", "shared_authoritative"] as const) {
        const decision = compileDynamicPrefixWordLabDecision(selection, {
          mode,
          sourceKind: "reviewed_fixture",
        });
        assert(decision.ok, `${fixture.profile.microSkillKey}:${target.canonicalWordId}:${authenticPosition}:${mode}`);
        assert.equal(canonical(decision.payload), canonical(legacy), `${mode}: exact V2 payload`);
        assert.equal(
          decision.metrics.legacyInvoked,
          mode !== "shared_authoritative",
          `${mode}: legacy invocation contract`,
        );
        assert.equal(decision.compilerVersion, SHARED_AFFIX_COMPILER_VERSION);
        assert(decision.sharedLesson, `${mode}: shared lesson available`);
        const plan = buildDynamicPrefixAssignmentPlan({
          basePlan,
          facts: {} as DailyPlanFacts,
          selection,
          payload: decision.payload,
        });
        assert.deepEqual(
          validateDynamicPrefixAssignmentPlanAgainstSharedLesson({
            plan,
            payload: decision.payload,
            lesson: decision.sharedLesson,
          }),
          { ok: true },
          `${mode}: plan and bindings`,
        );
      }
      exhaustiveCases += 1;
    }
  }
}
assert.equal(exhaustiveCases, 112, "four profiles x seven words x four authentic positions");

const fixture = loadReviewedPrefixPackageFixtures()[0]!;
const selection = selectionWithAuthenticAt(fixture.profile, fixture.words, fixture.words[0]!, 0);
const shared = compileDynamicPrefixSelectionThroughSharedCompiler(selection, "reviewed_fixture");
assert(shared.ok);
assert.equal(validateDynamicPrefixSharedResultIntegrity(shared), null);

const badSourceFingerprint = {
  ...shared,
  lesson: {
    ...shared.lesson,
    provenance: { ...shared.lesson.provenance, sourceFingerprint: "0".repeat(64) },
  },
};
assert.equal(
  validateDynamicPrefixSharedResultIntegrity(badSourceFingerprint),
  "source_fingerprint_mismatch",
);
const badLessonFingerprint = {
  ...shared,
  lesson: { ...shared.lesson, fingerprint: "0".repeat(64) },
};
assert.equal(
  validateDynamicPrefixSharedResultIntegrity(badLessonFingerprint),
  "lesson_fingerprint_mismatch",
);
const invalidPayload = {
  ...shared,
  payload: { ...shared.payload, schemaVersion: 1 } as unknown as DynamicPrefixLessonPayloadV2,
};
assert.equal(
  validateDynamicPrefixSharedResultIntegrity(invalidPayload),
  "adapter_payload_invalid",
);

const sharedBlocked = () => ({
  ok: false as const,
  blockers: [{ code: "missing_affix_form" as const }],
});
const selectedWordBlocked = compileDynamicPrefixWordLabDecision(selection, {
  mode: "enforced_parity",
  sharedCompiler: () => ({
    ok: false as const,
    blockers: [{ code: "selected_word_not_in_profile" as const }],
  }),
});
assert(
  !selectedWordBlocked.ok
  && selectedWordBlocked.blockerCode === "selected_word_not_in_profile",
);
const shadowBlocked = compileDynamicPrefixWordLabDecision(selection, {
  mode: "shadow",
  sharedCompiler: sharedBlocked,
});
assert(shadowBlocked.ok && shadowBlocked.parity === "shared_blocked");
assert(canPersistDynamicPrefixCompilerDecision(shadowBlocked), "shadow keeps declared legacy authority");
for (const mode of ["enforced_parity", "shared_authoritative"] as const) {
  const decision = compileDynamicPrefixWordLabDecision(selection, {
    mode,
    sharedCompiler: sharedBlocked,
  });
  assert(!decision.ok && decision.blockerCode === "shared_compiler_blocked");
  let persistenceCalls = 0;
  if (canPersistDynamicPrefixCompilerDecision(decision)) persistenceCalls += 1;
  assert.equal(persistenceCalls, 0, `${mode}: blocker cannot cross persistence gate`);
}

const mismatchedShared = {
  ...shared,
  payload: { ...shared.payload, contentVersion: `${shared.payload.contentVersion}:mutated` },
};
const enforcedMismatch = compileDynamicPrefixWordLabDecision(selection, {
  mode: "enforced_parity",
  sharedCompiler: () => mismatchedShared,
});
assert(!enforcedMismatch.ok && enforcedMismatch.blockerCode === "semantic_parity_mismatch");
assert(!canPersistDynamicPrefixCompilerDecision(enforcedMismatch));

const sharedDecision = compileDynamicPrefixWordLabDecision(selection, {
  mode: "shared_authoritative",
  legacyCompiler: () => {
    throw new Error("legacy compiler must not run in shared-authoritative mode");
  },
});
assert(sharedDecision.ok && !sharedDecision.metrics.legacyInvoked);
assert.equal(
  canPersistDynamicPrefixCompilerDecision(sharedDecision, "assignment_binding_mismatch"),
  false,
  "shared plan mismatch cannot cross persistence gate",
);

const unknownSelection = {
  ...selection,
  profile: { ...selection.profile, microSkillKey: "D4_MOR_PREFIXES_UNKNOWN" },
};
const unknown = compileDynamicPrefixWordLabDecision(unknownSelection, {
  mode: "shared_authoritative",
  legacyCompiler: () => {
    throw new Error("unknown profiles must block before legacy compilation");
  },
  sharedCompiler: () => {
    throw new Error("unknown profiles must block before shared compilation");
  },
});
assert(!unknown.ok && unknown.blockerCode === "missing_profile_mapping");

const unSelection = {
  ...selection,
  profile: { ...selection.profile, microSkillKey: "D4_MOR_PREFIXES_UN" },
  authenticTargets: selection.authenticTargets.map((entry) => ({
    ...entry,
    microSkillKey: "D4_MOR_PREFIXES_UN",
  })),
};
const unDecision = compileDynamicPrefixWordLabDecision(unSelection, {
  mode: "shared_authoritative",
  sharedCompiler: () => {
    throw new Error("deferred un- must not call the shared compiler");
  },
});
assert(unDecision.ok);
assert.equal(unDecision.authority, "legacy_pending_exact_source");
assert.equal(unDecision.parity, "legacy_deferred");
assert.equal(unDecision.metrics.legacyInvoked, true);

const planBlockers = [
  "assignment_plan_mismatch",
  "assignment_binding_mismatch",
  "assignment_item_count_mismatch",
] as const;
for (const blocker of planBlockers) {
  let persistenceCalls = 0;
  if (canPersistDynamicPrefixCompilerDecision(sharedDecision, blocker)) persistenceCalls += 1;
  assert.equal(persistenceCalls, 0, `${blocker}: zero writes`);
}

console.log(
  `PASS: Dynamic Prefix shared authority (${exhaustiveCases} exhaustive fixture positions, three rollout modes, fingerprints, blockers, and zero-write gates)`,
);
