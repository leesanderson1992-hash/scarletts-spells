/* Mutation cases intentionally cross readonly/public contracts. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";

import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  buildDynamicAffixAssignmentPlan,
  validateDynamicAffixAssignmentPlanAgainstSharedLesson,
} from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import {
  DYNAMIC_AFFIX_COMPILER_AUTHORITIES,
  DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS,
  canPersistDynamicAffixCompilerDecision,
  compileDynamicAffixWordLabDecision,
  getDynamicAffixCompilerAuthority,
  resolveDynamicAffixCompilerMode,
  validateDynamicAffixSharedResultIntegrity,
} from "../lib/adle/morphology/dynamic-affix-compiler-rollout";
import { compileDynamicAffixWordLabPayloadLegacy } from "../lib/adle/morphology/dynamic-affix-legacy-compiler";
import { validateDynamicAffixV3ForNewWrite } from "../lib/adle/morphology/dynamic-affix-v3-compatibility";
import {
  canonicalDynamicAffixPublicV3Bytes,
  compileDynamicAffixSelectionThroughSharedCompiler,
} from "../lib/adle/morphology/shared-affix-compatibility";
import { SHARED_AFFIX_COMPILER_VERSION } from "../lib/adle/morphology/shared-affix-contracts";
import { SHARED_AFFIX_PROFILE_REGISTRY } from "../lib/adle/morphology/shared-affix-profile-registry";
import {
  selectDynamicAffixWordLab,
  type DynamicAffixLessonPayloadV3,
  type DynamicAffixProfile,
  type DynamicAffixSelection,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const suffixPackages = [
  "2026-07-27-dynamic-suffix-ness",
  "2026-07-27-dynamic-suffix-able-ible",
  "2026-07-27-dynamic-suffix-ment",
  "2026-07-28-dynamic-suffix-ful-less",
  "2026-07-28-dynamic-suffix-al",
  "2026-07-28-dynamic-suffix-ity",
  "2026-07-28-dynamic-suffix-ly",
  "2026-07-28-dynamic-suffix-ous",
  "2026-07-29-dynamic-suffix-tion",
  "2026-07-29-dynamic-suffix-sion",
] as const;

const basePlan = {
  childId: "dynamic-affix-authority-fixture",
  planDate: "2026-08-06",
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

function permutations<T>(values: readonly T[], length: number, prefix: T[] = []): T[][] {
  if (prefix.length === length) return [prefix];
  return values.flatMap((value) =>
    prefix.includes(value)
      ? []
      : permutations(values, length, [...prefix, value]),
  );
}

function learningItem(
  profile: DynamicAffixProfile,
  word: DynamicAffixWord,
  position: number,
): LearningItemFact {
  return {
    learningItemId: `affix-authority:${profile.microSkillKey}:${word.canonicalWordId}:${position}`,
    childId: "dynamic-affix-authority-fixture",
    canonicalWordId: word.canonicalWordId,
    microSkillKey: profile.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "dynamic-affix-authority-regression",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: `2026-07-0${position + 1}`,
    rowStatus: "active",
  };
}

function selectionFor(
  profile: DynamicAffixProfile,
  words: readonly DynamicAffixWord[],
): DynamicAffixSelection {
  const selected = selectDynamicAffixWordLab({
    profiles: [profile],
    learningItems: words.map((word, index) => learningItem(profile, word, index)),
  });
  assert(selected, `${profile.microSkillKey}: selector returned a lesson`);
  assert.deepEqual(
    selected.authenticTargets.map((item) => item.canonicalWordId),
    words.map((word) => word.canonicalWordId),
    `${profile.microSkillKey}: selector preserves ordered authentic items`,
  );
  return selected;
}

assert.equal(resolveDynamicAffixCompilerMode(undefined), "legacy_authoritative");
assert.equal(resolveDynamicAffixCompilerMode(""), "legacy_authoritative");
assert.equal(resolveDynamicAffixCompilerMode("invalid"), null);
assert.deepEqual(
  DYNAMIC_AFFIX_COMPILER_AUTHORITIES.map((entry) => entry.microSkillKey).sort(),
  [...DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS].sort(),
);
for (const key of DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS) {
  assert.equal(getDynamicAffixCompilerAuthority(key), "shared_migration");
  const mapping = SHARED_AFFIX_PROFILE_REGISTRY.find((entry) => entry.microSkillKey === key)!;
  assert.deepEqual(mapping.policy.schedule, { kind: "authentic_targets" });
  assert.deepEqual(mapping.policy.reward, { kind: "all_lesson_words" });
}

let orderedSelections = 0;
let modeDecisions = 0;
let representative: DynamicAffixSelection | null = null;
const itemCountByProfile = new Map<string, number>();
const transformationTypes = new Set<string>();
let directMorphologyWords = 0;
let tionSionTeachingTrueMorphologyWords = 0;
for (const directory of suffixPackages) {
  const path = `docs/implementation/seed-data/teaching-dictionary/candidates/${directory}/reviewed-staging-package.json`;
  const fixture = loadReviewedAffixPackageFixture(path);
  for (const word of fixture.words) {
    const transformations = word.trueMorphology.transformations as Array<{ type?: unknown }>;
    if (transformations.length === 0) directMorphologyWords += 1;
    for (const transformation of transformations) {
      if (typeof transformation.type === "string") transformationTypes.add(transformation.type);
    }
    if (["D4_MOR_SUFFIXES_TION", "D4_MOR_SUFFIXES_SION"].includes(fixture.profile.microSkillKey)) {
      assert(word.trueMorphology.parts.length >= 2);
      assert(word.trueMorphology.joins.length === word.trueMorphology.parts.length - 1);
      assert(Object.keys(word.trueMorphology.provenance).length > 0);
      assert.equal(word.parts.map((part) => part.text).join(""), word.displayWord);
      assert.equal(word.trueMorphology.parts.map((part) => part.text).join(""), word.displayWord);
      tionSionTeachingTrueMorphologyWords += 1;
    }
  }
  assert(DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS.includes(
    fixture.profile.microSkillKey as (typeof DYNAMIC_AFFIX_MIGRATED_PROFILE_KEYS)[number],
  ));
  for (const authenticCount of [1, 2, 3, 4]) {
    for (const ordered of permutations(fixture.words, authenticCount)) {
      const selection = selectionFor(fixture.profile, ordered);
      representative ??= selection;
      const legacy = compileDynamicAffixWordLabPayloadLegacy(selection);
      assert(legacy, `${fixture.profile.microSkillKey}:${authenticCount}: legacy payload`);
      const legacyPlan = buildDynamicAffixAssignmentPlan({ basePlan, selection, payload: legacy });
      const legacyItemCount = legacyPlan.partTwo.sections.flatMap((section) => section.items).length;
      const previousItemCount = itemCountByProfile.get(fixture.profile.microSkillKey);
      if (previousItemCount !== undefined) assert.equal(legacyItemCount, previousItemCount);
      itemCountByProfile.set(fixture.profile.microSkillKey, legacyItemCount);
      for (const mode of [
        "legacy_authoritative",
        "shadow",
        "enforced_parity",
        "shared_authoritative",
      ] as const) {
        const decision = compileDynamicAffixWordLabDecision(selection, {
          mode,
          sourceKind: "reviewed_fixture",
        });
        assert(decision.ok, `${fixture.profile.microSkillKey}:${authenticCount}:${mode}`);
        assert.equal(canonicalDynamicAffixPublicV3Bytes(decision.payload), canonicalDynamicAffixPublicV3Bytes(legacy));
        assert.equal(decision.metrics.legacyInvoked, mode !== "shared_authoritative");
        assert.equal(decision.compilerVersion, SHARED_AFFIX_COMPILER_VERSION);
        assert(dynamicAffixRuntime(decision.payload));
        if (mode === "legacy_authoritative") {
          assert.equal(decision.sharedLesson, null);
        } else {
          assert(decision.sharedLesson);
          const plan = buildDynamicAffixAssignmentPlan({
            basePlan,
            selection,
            payload: decision.payload,
          });
          assert.deepEqual(
            validateDynamicAffixAssignmentPlanAgainstSharedLesson({
              plan,
              payload: decision.payload,
              lesson: decision.sharedLesson,
            }),
            { ok: true },
          );
        }
        modeDecisions += 1;
      }
      orderedSelections += 1;
    }
  }
}
assert.equal(orderedSelections, 640, "ten profiles x every ordered 1-4 authentic selection");
assert.equal(modeDecisions, 2_560, "640 selections x four authority modes");
assert.equal(itemCountByProfile.get("D4_MOR_SUFFIXES_ABLE_IBLE"), 16, "ABLE/IBLE retains the audited V3 16-item shape");
assert.equal(itemCountByProfile.get("D4_MOR_SUFFIXES_FUL_LESS"), 18, "FUL/LESS retains the audited V3 18-item shape");
assert(directMorphologyWords > 0, "direct transformation class");
assert.deepEqual([...transformationTypes].sort(), [
  "base_spelling_change",
  "change_final_y_to_i",
  "drop_final_e",
  "remove_letter",
  "replace_final",
]);
assert.equal(tionSionTeachingTrueMorphologyWords, 8, "TION/SION teaching and true morphology are both retained");
assert(representative);

const legacy = compileDynamicAffixWordLabPayloadLegacy(representative)!;
const shared = compileDynamicAffixSelectionThroughSharedCompiler(representative, "reviewed_fixture");
assert(shared.ok);
assert.equal(validateDynamicAffixSharedResultIntegrity(shared), null);
assert.equal(validateDynamicAffixV3ForNewWrite({
  payload: legacy,
  selection: representative,
  sharedLesson: shared.lesson,
  parityPayload: shared.payload,
}).ok, true);

assert.equal(validateDynamicAffixSharedResultIntegrity({
  ...shared,
  lesson: {
    ...shared.lesson,
    provenance: { ...shared.lesson.provenance, sourceFingerprint: "0".repeat(64) },
  },
}), "source_fingerprint_mismatch");
assert.equal(validateDynamicAffixSharedResultIntegrity({
  ...shared,
  lesson: { ...shared.lesson, fingerprint: "0".repeat(64) },
}), "lesson_fingerprint_mismatch");

const invalidMode = compileDynamicAffixWordLabDecision(representative, { mode: "invalid" });
assert(!invalidMode.ok && invalidMode.blockerCode === "unsupported_rollout_state");
assert.equal(invalidMode.metrics.legacyInvoked, false);

const blockedShared = () => ({
  ok: false as const,
  blockers: [{ code: "missing_affix_form" as const }],
});
const shadowBlocked = compileDynamicAffixWordLabDecision(representative, {
  mode: "shadow",
  sharedCompiler: blockedShared,
});
assert(shadowBlocked.ok && shadowBlocked.parity === "shared_blocked");
assert(canPersistDynamicAffixCompilerDecision(shadowBlocked));
for (const mode of ["enforced_parity", "shared_authoritative"] as const) {
  const decision = compileDynamicAffixWordLabDecision(representative, {
    mode,
    sharedCompiler: blockedShared,
    legacyCompiler: mode === "shared_authoritative"
      ? () => { throw new Error("shared authority must never call legacy"); }
      : undefined,
  });
  assert(!decision.ok && decision.blockerCode === "shared_compiler_blocked");
  assert.equal(canPersistDynamicAffixCompilerDecision(decision), false);
}

const mismatchedShared = {
  ...shared,
  payload: {
    ...shared.payload,
    activities: {
      ...shared.payload.activities,
      reflection: { ...shared.payload.activities.reflection, promptText: "mutated" },
    },
  },
};
const shadowMismatch = compileDynamicAffixWordLabDecision(representative, {
  mode: "shadow",
  sharedCompiler: () => mismatchedShared,
});
assert(shadowMismatch.ok && shadowMismatch.parity === "mismatched");
assert(canPersistDynamicAffixCompilerDecision(shadowMismatch));
const enforcedMismatch = compileDynamicAffixWordLabDecision(representative, {
  mode: "enforced_parity",
  sharedCompiler: () => mismatchedShared,
});
assert(!enforcedMismatch.ok && enforcedMismatch.blockerCode === "public_payload_byte_mismatch");
assert.equal(canPersistDynamicAffixCompilerDecision(enforcedMismatch), false);

const sharedOnly = compileDynamicAffixWordLabDecision(representative, {
  mode: "shared_authoritative",
  legacyCompiler: () => { throw new Error("legacy invocation is forbidden"); },
});
assert(sharedOnly.ok && sharedOnly.metrics.legacyInvoked === false);
assert.equal(canPersistDynamicAffixCompilerDecision(sharedOnly, "assignment_binding_mismatch"), false);

const unknown = compileDynamicAffixWordLabDecision({
  ...representative,
  profile: { ...representative.profile, microSkillKey: "D4_MOR_SUFFIXES_UNKNOWN" },
}, {
  mode: "shared_authoritative",
  legacyCompiler: () => { throw new Error("unknown profile must block before compilers"); },
  sharedCompiler: () => { throw new Error("unknown profile must block before compilers"); },
});
assert(!unknown.ok && unknown.blockerCode === "missing_profile_mapping");

const representativePlan = buildDynamicAffixAssignmentPlan({
  basePlan,
  selection: representative,
  payload: shared.payload,
});
const bindingMutation = structuredClone(representativePlan);
(bindingMutation.partTwo.sections[0]!.items[0]!.payload as Record<string, unknown>).dynamicAffixActivityId = "mutated";
assert.deepEqual(
  validateDynamicAffixAssignmentPlanAgainstSharedLesson({ plan: bindingMutation, payload: shared.payload, lesson: shared.lesson }),
  { ok: false, blockerCode: "assignment_binding_mismatch" },
);
const countMutation = structuredClone(representativePlan);
countMutation.partTwo.sections[0]!.items.pop();
assert.deepEqual(
  validateDynamicAffixAssignmentPlanAgainstSharedLesson({ plan: countMutation, payload: shared.payload, lesson: shared.lesson }),
  { ok: false, blockerCode: "assignment_item_count_mismatch" },
);

function scalarPaths(value: unknown, prefix: Array<string | number> = []): Array<Array<string | number>> {
  if (value === null || typeof value !== "object") return [prefix];
  if (Array.isArray(value)) return value.flatMap((entry, index) => scalarPaths(entry, [...prefix, index]));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => scalarPaths(entry, [...prefix, key]));
}
function mutateAtPath(value: DynamicAffixLessonPayloadV3, path: Array<string | number>) {
  const draft: any = structuredClone(value);
  let cursor: any = draft;
  for (const key of path.slice(0, -1)) cursor = cursor[key];
  const key = path.at(-1)!;
  const current = cursor[key];
  cursor[key] = typeof current === "string"
    ? `${current}:drift`
    : typeof current === "number"
      ? current + 1
      : typeof current === "boolean"
        ? !current
        : "drift";
  return draft as DynamicAffixLessonPayloadV3;
}
let publicLeafMutations = 0;
for (const path of scalarPaths(legacy)) {
  const result = validateDynamicAffixV3ForNewWrite({
    payload: mutateAtPath(legacy, path),
    selection: representative,
    parityPayload: legacy,
  });
  assert(!result.ok, `public V3 leaf mutation escaped at ${path.join(".")}`);
  publicLeafMutations += 1;
}

console.log(JSON.stringify({
  status: "passed",
  profiles: suffixPackages.length,
  orderedSelections,
  modeDecisions,
  publicLeafMutations,
  ableIbleItems: itemCountByProfile.get("D4_MOR_SUFFIXES_ABLE_IBLE"),
  fulLessItems: itemCountByProfile.get("D4_MOR_SUFFIXES_FUL_LESS"),
  transformationClasses: ["direct", ...transformationTypes],
  tionSionTeachingTrueMorphologyWords,
  payloadVersion: 3,
  selector: "unchanged",
}));
