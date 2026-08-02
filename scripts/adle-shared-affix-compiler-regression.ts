/* Mutation cases intentionally cross the readonly contract boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { ComposedDailyPlan, DailyPlanFacts } from "../lib/adle/daily-assignment-composer";
import {
  compileDynamicAffixWordLabPayload,
  validateDynamicAffixWordLabPayload,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { buildDynamicPrefixAssignmentPlan } from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import {
  compileDynamicPrefixWordLabPayload,
  validateDynamicPrefixWordLabPayload,
} from "../lib/adle/morphology/dynamic-prefix-word-lab";
import { compileSharedAffixLesson } from "../lib/adle/morphology/shared-affix-compiler";
import {
  adaptSharedAffixLessonToDynamicAffixV3,
  normaliseDynamicAffixSelection,
} from "../lib/adle/morphology/shared-affix-compatibility";
import type {
  AffixLessonCompilationInputV1,
  SharedAffixBlockerCode,
} from "../lib/adle/morphology/shared-affix-contracts";
import {
  SHARED_AFFIX_PROFILE_REGISTRY,
  validateSharedAffixProfileRegistry,
} from "../lib/adle/morphology/shared-affix-profile-registry";
import { DYNAMIC_PREFIX_PROFILE_KEYS } from "../lib/adle/morphology/dynamic-prefix-profile-loader";
import { DYNAMIC_SUFFIX_PROFILE_KEYS } from "../lib/adle/morphology/dynamic-suffix-profile-loader";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";
import { assertDynamicAffixSharedParity, assertDynamicPrefixSharedParity } from "./lib/adle-shared-affix-parity-fixtures";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";
import { loadReviewedPrefixPackageFixtures, selectReviewedPrefixFixture } from "./lib/adle-reviewed-prefix-package-fixture";

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
  childId: "shared-affix-fixture-child",
  planDate: "2026-08-01",
  composerPolicyVersion: "unchanged-fixture",
  schedulePolicyVersion: "unchanged-fixture",
  throttle: {},
  partOne: {},
  partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;

function bindingView(plan: ComposedDailyPlan) {
  return plan.partTwo.sections.flatMap((section) => section.items).map((item) => {
    const payload = item.payload as Record<string, unknown>;
    return {
      activityId: payload.dynamicPrefixActivityId ?? payload.dynamicAffixActivityId,
      sectionKey: item.sectionKey,
      templateKey: item.templateKey,
      canonicalWordId: item.canonicalWordId,
      expectedEvidenceKind: item.expectedEvidenceKind,
    };
  });
}

assert.deepEqual(validateSharedAffixProfileRegistry(), []);
const registryKeys = SHARED_AFFIX_PROFILE_REGISTRY.map((profile) => profile.microSkillKey).sort();
assert.deepEqual(
  registryKeys,
  [...DYNAMIC_PREFIX_PROFILE_KEYS, ...DYNAMIC_SUFFIX_PROFILE_KEYS].sort(),
  "every current production Prefix and Affix profile has exactly one declarative shared mapping",
);
for (const routeId of ["dynamic_prefix_word_lab", "dynamic_affix_word_lab"] as const) {
  const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((entry) => entry.routeId === routeId)!;
  assert.deepEqual(
    SHARED_AFFIX_PROFILE_REGISTRY.filter((entry) => entry.routeId === routeId).map((entry) => entry.microSkillKey).sort(),
    [...route.supportedMicroSkillKeys].sort(),
    `${routeId} registry agrees with the production route declaration`,
  );
}

let prefixTargetCases = 0;
let representativePrefix: ReturnType<typeof assertDynamicPrefixSharedParity> | null = null;
for (const fixture of loadReviewedPrefixPackageFixtures()) {
  for (const word of fixture.words) {
    const selection = selectReviewedPrefixFixture(fixture.profile, word);
    const authoritative = compileDynamicPrefixWordLabPayload(selection);
    assert(authoritative && validateDynamicPrefixWordLabPayload(authoritative));
    const shadow = assertDynamicPrefixSharedParity(selection, authoritative, `${fixture.profile.microSkillKey}:${word.canonicalWordId}`);
    representativePrefix ??= shadow;
    prefixTargetCases += 1;
  }
}
assert.equal(prefixTargetCases, 28, "all 28 reviewed mixed-prefix fixture targets run through both compilers");

let suffixTargetCases = 0;
let transformedInput: AffixLessonCompilationInputV1 | null = null;
let representativeAffix: ReturnType<typeof assertDynamicAffixSharedParity> | null = null;
for (const directory of suffixPackages) {
  const path = `docs/implementation/seed-data/teaching-dictionary/candidates/${directory}/reviewed-staging-package.json`;
  for (const authenticWordIndex of [0, 1, 2, 3]) {
    const fixture = loadReviewedAffixPackageFixture(path, authenticWordIndex);
    const authoritative = compileDynamicAffixWordLabPayload(fixture.selection);
    assert(authoritative && validateDynamicAffixWordLabPayload(authoritative));
    const shadow = assertDynamicAffixSharedParity(fixture.selection, authoritative, `${fixture.profile.microSkillKey}:${fixture.words[authenticWordIndex]!.canonicalWordId}`);
    representativeAffix ??= shadow;
    suffixTargetCases += 1;
    if (!transformedInput && shadow.input.words.some((word) => word.morphology.kind === "reviewed_true_morphology" && word.morphology.transformations.length > 0)) {
      transformedInput = shadow.input;
    }
  }
}
assert.equal(suffixTargetCases, 40, "all 40 reviewed suffix fixture targets run through both compilers, including LY");
assert(representativePrefix && representativeAffix && transformedInput);

const prefixSelection = selectReviewedPrefixFixture(
  loadReviewedPrefixPackageFixtures()[0]!.profile,
  loadReviewedPrefixPackageFixtures()[0]!.words[0]!,
);
const prefixPayload = compileDynamicPrefixWordLabPayload(prefixSelection)!;
const prefixPlan = buildDynamicPrefixAssignmentPlan({
  basePlan,
  facts: {} as DailyPlanFacts,
  selection: prefixSelection,
  payload: prefixPayload,
});
assert.deepEqual(bindingView(prefixPlan), representativePrefix.lesson.assignmentBindings, "Prefix assignment item bindings remain exact");

const affixFixture = loadReviewedAffixPackageFixture(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ness/reviewed-staging-package.json",
);
const affixPayload = compileDynamicAffixWordLabPayload(affixFixture.selection)!;
const affixShadow = assertDynamicAffixSharedParity(affixFixture.selection, affixPayload, "assignment binding fixture");
const affixPlan = buildDynamicAffixAssignmentPlan({ basePlan, selection: affixFixture.selection, payload: affixPayload });
assert.deepEqual(bindingView(affixPlan), affixShadow.lesson.assignmentBindings, "Affix assignment item bindings remain exact");

const normalised = normaliseDynamicAffixSelection(affixFixture.selection);
assert(normalised.ok);
const ordered = compileSharedAffixLesson(normalised.input);
const reversed = compileSharedAffixLesson({ ...normalised.input, words: [...normalised.input.words].reverse() });
assert(ordered.ok && reversed.ok);
assert.deepEqual(reversed.lesson, ordered.lesson, "reviewed fact order cannot change shared output or fingerprints");

function mutate(
  source: AffixLessonCompilationInputV1,
  change: (draft: any) => void,
) {
  const draft: any = structuredClone(source);
  change(draft);
  return compileSharedAffixLesson(draft as AffixLessonCompilationInputV1);
}

function requiresBlocker(
  result: ReturnType<typeof compileSharedAffixLesson>,
  code: SharedAffixBlockerCode,
) {
  assert(!result.ok, `${code}: mutation unexpectedly compiled`);
  assert(result.blockers.some((entry) => entry.code === code), `${code}: exact blocker absent: ${JSON.stringify(result.blockers)}`);
}

const validInput = normalised.input;
requiresBlocker(mutate(validInput, (draft) => { draft.words[0]!.parts = []; }), "missing_decomposition");
requiresBlocker(mutate(validInput, (draft) => { draft.words[0]!.displayWord += "x"; }), "reconstruction_mismatch");
requiresBlocker(mutate(validInput, (draft) => { draft.words[0]!.affixForm = ""; }), "missing_affix_form");
requiresBlocker(mutate(validInput, (draft) => { draft.selection.lessonWordIds[0] = "absent-word"; draft.selection.authenticTargetIds[0] = "absent-word"; }), "selected_word_not_in_profile");
requiresBlocker(mutate(validInput, (draft) => { (draft.profile as { position: string }).position = "middle"; }), "invalid_position");
requiresBlocker(mutate(validInput, (draft) => { draft.words[0]!.semanticBaseText = ""; }), "missing_semantic_base");
requiresBlocker(mutate(validInput, (draft) => { draft.words[0]!.teachingSurfaceText = ""; }), "missing_teaching_surface");
requiresBlocker(mutate(transformedInput, (draft) => {
  const word = draft.words.find((entry: AffixLessonCompilationInputV1["words"][number]) => entry.morphology.kind === "reviewed_true_morphology" && entry.morphology.transformations.length > 0)!;
  word.morphology.transformations = [];
}), "missing_transformation");
requiresBlocker(mutate(validInput, (draft) => {
  draft.words[0]!.morphology.transformations = [{ type: "consonant_doubling" } as never];
}), "unsupported_transformation");
requiresBlocker(mutate(validInput, (draft) => { draft.words[0]!.derivedMeaning = ""; }), "missing_meaning_facts");
requiresBlocker(mutate(validInput, (draft) => { draft.policy.requiredFormCoverage.count = 2; }), "insufficient_form_coverage");
requiresBlocker(mutate(validInput, (draft) => { draft.policy.requiredMeaningCoverage.count = 2; }), "insufficient_meaning_group_coverage");
requiresBlocker(mutate(validInput, (draft) => { draft.selection.lessonWordIds = draft.selection.lessonWordIds.slice(0, 3); }), "wrong_lesson_count");
requiresBlocker(mutate(validInput, (draft) => { draft.selection.authenticTargetIds = []; }), "wrong_authentic_count");
requiresBlocker(mutate(validInput, (draft) => { draft.selection.transferWordIds = []; }), "wrong_transfer_count");
requiresBlocker(mutate(validInput, (draft) => { draft.selection.lessonWordIds[1] = draft.selection.lessonWordIds[0]!; }), "duplicate_word");
requiresBlocker(mutate(validInput, (draft) => { draft.policy.split = { kind: "first_words", count: 0 }; }), "unresolved_activity_binding");

const wrongAdapter = adaptSharedAffixLessonToDynamicAffixV3(representativePrefix.lesson);
assert(!wrongAdapter.ok && wrongAdapter.blockers[0]?.code === "compatibility_adapter_mismatch");

const compilerSource = readFileSync("lib/adle/morphology/shared-affix-compiler.ts", "utf8");
assert(!compilerSource.includes("D4_MOR_"), "shared compiler contains no production microskill literal");
for (const key of registryKeys) assert(!compilerSource.includes(key), `shared compiler must not recognise ${key}`);
assert(!/microSkillKey\s*===/.test(compilerSource), "shared compiler contains no microskill-key branch");

console.log(`Shared affix compiler regression passed (${SHARED_AFFIX_PROFILE_REGISTRY.length} profiles, ${prefixTargetCases + suffixTargetCases} reviewed target slots).`);
