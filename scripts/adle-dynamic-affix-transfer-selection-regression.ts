import assert from "node:assert/strict";

import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import type { LearningItemFact } from "../lib/adle/learning-items";
import { canonicalSnapshotJson } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  compileDynamicAffixWordLabPayload,
  selectDynamicAffixWordLab,
  type DynamicAffixProfile,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { compileDynamicAffixWordLabPayloadLegacy } from "../lib/adle/morphology/dynamic-affix-legacy-compiler";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import {
  projectDynamicAffixSemanticSelectionV2,
} from "../lib/adle/morphology/dynamic-affix-semantic-fingerprint";
import {
  DYNAMIC_AFFIX_TRANSFER_SELECTION_POLICY_VERSION,
  eligibleDynamicAffixTransferCandidates,
  isDynamicAffixWordLessonReady,
} from "../lib/adle/morphology/dynamic-affix-transfer-selection";
import {
  canonicalDynamicAffixPublicV3Bytes,
  compileDynamicAffixSelectionThroughSharedCompiler,
} from "../lib/adle/morphology/shared-affix-compatibility";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const packages = [
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
  childId: "dynamic-affix-transfer-selection-fixture",
  planDate: "2026-08-06",
  composerPolicyVersion: "fixture",
  schedulePolicyVersion: "fixture",
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

function permutations<T>(values: readonly T[], count: number, prefix: T[] = []): T[][] {
  if (prefix.length === count) return [prefix];
  return values.flatMap((value) => prefix.includes(value)
    ? []
    : permutations(values, count, [...prefix, value]));
}

function item(profile: DynamicAffixProfile, word: DynamicAffixWord, index: number): LearningItemFact {
  return {
    learningItemId: `li:${word.displayWord}:${index}`,
    childId: "dynamic-affix-transfer-selection-fixture",
    canonicalWordId: word.canonicalWordId,
    microSkillKey: profile.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "dynamic-affix-transfer-selection-regression",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: `2026-08-${String(index + 1).padStart(2, "0")}`,
    rowStatus: "active",
  };
}

function select(profile: DynamicAffixProfile, authentic: readonly DynamicAffixWord[]) {
  const selection = selectDynamicAffixWordLab({
    profiles: [profile],
    learningItems: authentic.map((word, index) => item(profile, word, index)),
  });
  assert(selection, `${profile.microSkillKey}: selection`);
  assert.deepEqual(
    selection.authenticTargets.map((entry) => profile.wordsByCanonicalId.get(entry.canonicalWordId)?.displayWord),
    authentic.map((word) => word.displayWord),
    `${profile.microSkillKey}: authentic order remains oldest-first`,
  );
  return selection;
}

function shiftParts(
  parts: DynamicAffixWord["parts"],
  prefix: string,
): DynamicAffixWord["parts"] {
  return parts.map((part, index) => ({
    ...part,
    text: index === 0 ? `${prefix}${part.text}` : part.text,
    sourceText: index === 0 ? `${prefix}${part.sourceText}` : part.sourceText,
    start: index === 0 ? part.start : part.start + prefix.length,
    end: part.end + prefix.length,
  }));
}

function expandedWord(source: DynamicAffixWord, marker: string): DynamicAffixWord {
  const displayWord = `${marker}${source.displayWord}`;
  const sentence = `Please write ${displayWord}.`;
  return {
    ...structuredClone(source),
    canonicalWordId: `expanded:${marker}:${source.canonicalWordId}`,
    displayWord,
    audioText: sentence,
    semanticBaseText: `${marker}${source.semanticBaseText}`,
    teachingBaseText: `${marker}${source.teachingBaseText}`,
    parts: shiftParts(source.parts, marker),
    splitPoints: source.splitPoints.map((point) => point + marker.length),
    dictationSentence: sentence,
    dictationTargetTokenIndex: 2,
    trueMorphology: {
      ...structuredClone(source.trueMorphology),
      parts: shiftParts(source.trueMorphology.parts, marker),
    },
    approvedTransfer: true,
  };
}

function withCanonicalIds(
  profile: DynamicAffixProfile,
  namespace: string,
  reverse: boolean,
): { profile: DynamicAffixProfile; byWord: Map<string, DynamicAffixWord> } {
  const sourceWords = [...profile.wordsByCanonicalId.values()];
  const words = sourceWords.map((source, index) => ({
    ...structuredClone(source),
    canonicalWordId: `${namespace}:${index}`,
  }));
  const ordered = reverse ? [...words].reverse() : words;
  return {
    profile: {
      ...structuredClone(profile),
      wordsByCanonicalId: new Map(ordered.map((word) => [word.canonicalWordId, word])),
    },
    byWord: new Map(words.map((word) => [word.displayWord, word])),
  };
}

function replaceEnvironmentIds(value: unknown, idToWord: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const [id, word] of idToWord) result = result.split(id).join(`word:${word}`);
    return result;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceEnvironmentIds(entry, idToWord));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    replaceEnvironmentIds(entry, idToWord),
  ]));
}

function semanticBytes(value: unknown, profile: DynamicAffixProfile): string {
  const ids = new Map([...profile.wordsByCanonicalId.values()].map((word) => [
    word.canonicalWordId,
    word.displayWord,
  ]));
  return canonicalSnapshotJson(JSON.parse(JSON.stringify(
    replaceEnvironmentIds(value, ids),
  )) as unknown);
}

let orderedSelections = 0;
let expandedPools = 0;
let sourceOrderMutations = 0;
let incompleteExclusions = 0;
let exactCompilerParity = 0;
const itemCounts = new Map<string, number>();

for (const directory of packages) {
  const fixture = loadReviewedAffixPackageFixture(
    `docs/implementation/seed-data/teaching-dictionary/candidates/${directory}/reviewed-staging-package.json`,
  );
  const stableWords = [...fixture.words].sort((left, right) => left.displayWord.localeCompare(right.displayWord));
  for (const authenticCount of [1, 2, 3, 4]) {
    for (const authentic of permutations(stableWords, authenticCount)) {
      const selection = select(fixture.profile, authentic);
      const legacy = compileDynamicAffixWordLabPayloadLegacy(selection);
      const shared = compileDynamicAffixSelectionThroughSharedCompiler(selection, "reviewed_fixture");
      assert(legacy && shared.ok, `${fixture.profile.microSkillKey}: both compilers`);
      assert.equal(
        canonicalDynamicAffixPublicV3Bytes(legacy),
        canonicalDynamicAffixPublicV3Bytes(shared.payload),
        `${fixture.profile.microSkillKey}: exact public V3 parity`,
      );
      const runtime = dynamicAffixRuntime(legacy);
      assert(runtime, `${fixture.profile.microSkillKey}: runtime`);
      const plan = buildDynamicAffixAssignmentPlan({ basePlan, selection, payload: legacy });
      const itemCount = plan.partTwo.sections.flatMap((section) => section.items).length;
      itemCounts.set(fixture.profile.microSkillKey, itemCount);
      assert.equal(runtime.words.lesson.length, 4);
      orderedSelections += 1;
      exactCompilerParity += 1;
    }
  }

  const source = stableWords[stableWords.length - 1]!;
  const added = expandedWord(source, "aaa");
  assert(isDynamicAffixWordLessonReady(fixture.profile, added));
  const expandedProfile = {
    ...fixture.profile,
    wordsByCanonicalId: new Map([
      ...fixture.profile.wordsByCanonicalId,
      [added.canonicalWordId, added] as const,
    ]),
  };
  const pool = eligibleDynamicAffixTransferCandidates(expandedProfile, new Set());
  assert(pool.ok && pool.candidates.some((word) => word.canonicalWordId === added.canonicalWordId));
  const authenticWithoutSource = stableWords.filter((word) => word !== source).slice(0, 3);
  const expandedSelection = select(expandedProfile, authenticWithoutSource);
  assert.equal(expandedSelection.transfers[0]?.canonicalWordId, added.canonicalWordId);
  expandedPools += 1;

  const incomplete = {
    ...structuredClone(added),
    canonicalWordId: `${added.canonicalWordId}:incomplete`,
    trueMorphology: { ...structuredClone(added.trueMorphology), provenance: {} },
  };
  const incompleteProfile = {
    ...expandedProfile,
    wordsByCanonicalId: new Map([
      ...expandedProfile.wordsByCanonicalId,
      [incomplete.canonicalWordId, incomplete] as const,
    ]),
  };
  const incompletePool = eligibleDynamicAffixTransferCandidates(incompleteProfile, new Set());
  assert(incompletePool.ok && !incompletePool.candidates.some((word) => word.canonicalWordId === incomplete.canonicalWordId));
  assert(incompletePool.exclusions.some((entry) => entry.blockerCode === "candidate_lesson_facts_incomplete"));
  const blockedAddedProfile = {
    ...fixture.profile,
    wordsByCanonicalId: new Map([
      ...fixture.profile.wordsByCanonicalId,
      [incomplete.canonicalWordId, incomplete] as const,
    ]),
  };
  const fallbackSelection = select(blockedAddedProfile, authenticWithoutSource);
  assert.equal(fallbackSelection.transfers[0]?.canonicalWordId, source.canonicalWordId);
  incompleteExclusions += 1;

  const forward = withCanonicalIds(fixture.profile, "staging", false);
  const reversed = withCanonicalIds(fixture.profile, "production", true);
  for (const authenticCount of [1, 2, 3, 4]) {
    const semanticAuthentic = stableWords.slice(0, authenticCount).map((word) => word.displayWord);
    const left = select(forward.profile, semanticAuthentic.map((word) => forward.byWord.get(word)!));
    const right = select(reversed.profile, semanticAuthentic.map((word) => reversed.byWord.get(word)!));
    assert.equal(
      canonicalSnapshotJson(projectDynamicAffixSemanticSelectionV2(left)),
      canonicalSnapshotJson(projectDynamicAffixSemanticSelectionV2(right)),
      `${fixture.profile.microSkillKey}: semantic selection ignores IDs and relation order`,
    );
    const leftPayload = compileDynamicAffixWordLabPayload(left)!;
    const rightPayload = compileDynamicAffixWordLabPayload(right)!;
    assert.equal(semanticBytes(leftPayload, forward.profile), semanticBytes(rightPayload, reversed.profile));
    const leftPlan = buildDynamicAffixAssignmentPlan({ basePlan, selection: left, payload: leftPayload });
    const rightPlan = buildDynamicAffixAssignmentPlan({ basePlan, selection: right, payload: rightPayload });
    assert.equal(semanticBytes(leftPlan, forward.profile), semanticBytes(rightPlan, reversed.profile));
    assert.equal(
      semanticBytes(dynamicAffixRuntime(leftPayload), forward.profile),
      semanticBytes(dynamicAffixRuntime(rightPayload), reversed.profile),
    );
    sourceOrderMutations += 1;
  }

  const oneAuthentic = select(fixture.profile, [stableWords[0]!]);
  const lessonWords = [
    ...oneAuthentic.authenticTargets.map((entry) => fixture.profile.wordsByCanonicalId.get(entry.canonicalWordId)!),
    ...oneAuthentic.transfers,
  ];
  if (["D4_MOR_SUFFIXES_ABLE_IBLE", "D4_MOR_SUFFIXES_FUL_LESS"].includes(fixture.profile.microSkillKey)) {
    assert.equal(new Set(lessonWords.map((word) => word.affixVariant)).size, 2, `${fixture.profile.microSkillKey}: form coverage`);
  }
  if (fixture.profile.includeMeaningSort) {
    assert.equal(new Set(lessonWords.map((word) => word.effect)).size, 2, `${fixture.profile.microSkillKey}: meaning coverage`);
  }
  if (["D4_MOR_SUFFIXES_TION", "D4_MOR_SUFFIXES_SION"].includes(fixture.profile.microSkillKey)) {
    for (const word of lessonWords) {
      assert.equal(word.affixVariant, fixture.profile.microSkillKey.endsWith("TION") ? "tion" : "sion");
      assert(word.trueMorphology.parts.some((part) => part.role === "suffix" && part.sourceText === "ion"));
    }
  }
}

assert.equal(orderedSelections, 640, "ten profiles x all ordered 1-4 authentic selections");
assert.equal(exactCompilerParity, 640);
assert.equal(expandedPools, 10, "every profile accepts a new reviewed member without code registration");
assert.equal(incompleteExclusions, 10);
assert.equal(sourceOrderMutations, 40, "ten profiles x four authentic counts");
assert.equal(itemCounts.get("D4_MOR_SUFFIXES_FUL_LESS"), 18);
for (const [profileKey, count] of itemCounts) {
  if (profileKey !== "D4_MOR_SUFFIXES_FUL_LESS") assert.equal(count, 16, profileKey);
}

console.log(JSON.stringify({
  status: "passed",
  policyVersion: DYNAMIC_AFFIX_TRANSFER_SELECTION_POLICY_VERSION,
  profiles: packages.length,
  candidatePoolExpansions: expandedPools,
  orderedAuthenticSelections: orderedSelections,
  uuidAndRelationOrderCases: sourceOrderMutations,
  exactLegacySharedPublicV3Cases: exactCompilerParity,
  incompleteCandidatesExcluded: incompleteExclusions,
  itemCounts: Object.fromEntries([...itemCounts].sort()),
}));
