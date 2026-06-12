import assert from "node:assert/strict";

import {
  resolveStage2d1WordMapAssignmentContent,
  type WritingEngineStage2d1CatalogRead,
  type WritingEngineStage2d1ContrastPairRead,
  type WritingEngineStage2d1LearningItemRead,
  type WritingEngineStage2d1RouteSupportRead,
  type WritingEngineStage2d1SourceProvenance,
  type WritingEngineStage2d1WordMapContentRepository,
  type WritingEngineStage2d1WordMapRoute,
  type WritingEngineStage2d1WordRead,
} from "../lib/writing-engine/assignments/stage2d1-word-map-content";

const PROVENANCE: WritingEngineStage2d1SourceProvenance = {
  importBatchId: "batch-active",
  sourceSheet: "micro_skill_word_bank",
  sourceRowNumber: 2,
  sourceRowHash: "row-hash-2",
};

type FixtureOverrides = {
  learningItem?: Partial<WritingEngineStage2d1LearningItemRead> | null;
  catalog?: Partial<WritingEngineStage2d1CatalogRead> | null;
  routeSupport?: WritingEngineStage2d1RouteSupportRead[];
  words?: WritingEngineStage2d1WordRead[];
  contrastPairs?: WritingEngineStage2d1ContrastPairRead[];
};

function buildLearningItem(
  overrides?: Partial<WritingEngineStage2d1LearningItemRead>,
): WritingEngineStage2d1LearningItemRead {
  return {
    learningItemId: "learning-item-1",
    childId: "child-1",
    parentUserId: "parent-1",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    practiceRoute: "word_practice",
    isActive: true,
    ...overrides,
  };
}

function buildCatalogEntry(
  overrides?: Partial<WritingEngineStage2d1CatalogRead>,
): WritingEngineStage2d1CatalogRead {
  return {
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    masteryDomainKey: "D4",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    ...overrides,
  };
}

function buildRouteSupport(
  overrides?: Partial<WritingEngineStage2d1RouteSupportRead>,
): WritingEngineStage2d1RouteSupportRead {
  return {
    id: "route-support-1",
    importBatchId: "batch-active",
    importBatchStatus: "active",
    rowStatus: "active",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    route: "word_practice",
    minimumWordsRequired: 1,
    requiresContrastWords: false,
    templateKey: "T03",
    enabledForMvp: true,
    provenance: PROVENANCE,
    ...overrides,
  };
}

function buildWord(
  overrides?: Partial<WritingEngineStage2d1WordRead>,
): WritingEngineStage2d1WordRead {
  return {
    id: "word-1",
    importBatchId: "batch-active",
    importBatchStatus: "active",
    rowStatus: "active",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    word: "cat",
    normalisedWord: "cat",
    wordRole: "practice_word",
    microSkillRole: "primary_tested",
    diversityGroupKey: "short_a_cvc",
    complexityBand: "easy",
    frequencyBand: "common",
    practiceRoute: "word_practice",
    approvedForAssignment: true,
    provenance: PROVENANCE,
    ...overrides,
  };
}

function buildContrastPair(
  overrides?: Partial<WritingEngineStage2d1ContrastPairRead>,
): WritingEngineStage2d1ContrastPairRead {
  return {
    id: "contrast-1",
    importBatchId: "batch-active",
    importBatchStatus: "active",
    rowStatus: "active",
    targetMicroSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    targetWord: "cat",
    contrastWord: "cot",
    contrastMicroSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_O",
    contrastType: "near_pattern",
    approvedForAssignment: true,
    provenance: {
      ...PROVENANCE,
      sourceSheet: "contrast_pairs",
      sourceRowNumber: 4,
      sourceRowHash: "row-hash-4",
    },
    ...overrides,
  };
}

function createRepository(overrides: FixtureOverrides = {}) {
  const calls: string[] = [];
  const learningItem =
    overrides.learningItem === null
      ? null
      : buildLearningItem(overrides.learningItem);
  const catalog =
    overrides.catalog === null ? null : buildCatalogEntry(overrides.catalog);
  const routeSupport = overrides.routeSupport ?? [buildRouteSupport()];
  const words = overrides.words ?? [buildWord()];
  const contrastPairs = overrides.contrastPairs ?? [buildContrastPair()];

  const repository: WritingEngineStage2d1WordMapContentRepository = {
    async getLearningItem() {
      calls.push("learning_items");
      return learningItem;
    },
    async getCatalogEntry() {
      calls.push("micro_skill_catalog");
      return catalog;
    },
    async getRouteSupport() {
      calls.push("canonical_spelling_word_map_route_support");
      return routeSupport;
    },
    async getWords() {
      calls.push("canonical_spelling_word_map_words");
      return words;
    },
    async getContrastPairs() {
      calls.push("canonical_spelling_word_map_contrast_pairs");
      return contrastPairs;
    },
  };

  return { repository, calls };
}

async function resolveWith(overrides: FixtureOverrides = {}) {
  const fixture = createRepository(overrides);
  const result = await resolveStage2d1WordMapAssignmentContent({
    learningItemId: "learning-item-1",
    childId: "child-1",
    parentUserId: "parent-1",
    repository: fixture.repository,
  });

  return { result, calls: fixture.calls };
}

async function assertHappyPathUsesApprovedActiveContent() {
  const { result, calls } = await resolveWith({
    routeSupport: [buildRouteSupport({ minimumWordsRequired: 2 })],
    words: [
      buildWord({
        id: "word-1",
        word: "cat",
        normalisedWord: "cat",
        provenance: { ...PROVENANCE, sourceRowNumber: 10 },
      }),
      buildWord({
        id: "word-2",
        word: "map",
        normalisedWord: "map",
        provenance: { ...PROVENANCE, sourceRowNumber: 11 },
      }),
      buildWord({
        id: "word-3",
        word: "CAT",
        normalisedWord: "cat",
        provenance: { ...PROVENANCE, sourceRowNumber: 12 },
      }),
    ],
  });

  assert.equal(result.status, "available");
  assert.deepEqual(
    result.content.targetWords.map((word) => word.normalisedWord),
    ["cat", "map"],
  );
  assert.deepEqual(calls, [
    "learning_items",
    "micro_skill_catalog",
    "canonical_spelling_word_map_route_support",
    "canonical_spelling_word_map_words",
  ]);
}

async function assertMissingOrInactiveLearningItemIsIneligible() {
  const missing = await resolveWith({ learningItem: null });
  assert.equal(missing.result.status, "ineligible_learning_item");
  assert.deepEqual(missing.calls, ["learning_items"]);

  const inactive = await resolveWith({ learningItem: { isActive: false } });
  assert.equal(inactive.result.status, "ineligible_learning_item");
  assert.deepEqual(inactive.calls, ["learning_items"]);
}

async function assertCatalogGuardsLearningItemEligibility() {
  const inactive = await resolveWith({ catalog: { isActive: false } });
  assert.equal(inactive.result.status, "ineligible_learning_item");

  const nonAssignable = await resolveWith({ catalog: { isAssignable: false } });
  assert.equal(nonAssignable.result.status, "ineligible_learning_item");

  const routeMismatch = await resolveWith({
    catalog: { practiceRoute: "dictation" },
  });
  assert.equal(routeMismatch.result.status, "ineligible_learning_item");
}

async function assertUnsupportedRouteSkipsBeforeContentReads() {
  const { result, calls } = await resolveWith({
    learningItem: { practiceRoute: "sentence_application" },
  });

  assert.equal(result.status, "route_not_supported");
  assert.deepEqual(calls, ["learning_items"]);
}

async function assertMissingRouteSupportIsExplicit() {
  const { result } = await resolveWith({ routeSupport: [] });
  assert.equal(result.status, "no_active_route_support");
}

async function assertGroupedSetRequiresEnoughWords() {
  const route: WritingEngineStage2d1WordMapRoute = "grouped_set_practice";
  const { result } = await resolveWith({
    learningItem: { practiceRoute: route },
    catalog: { practiceRoute: route },
    routeSupport: [
      buildRouteSupport({
        route,
        minimumWordsRequired: 2,
      }),
    ],
    words: [
      buildWord({ practiceRoute: route, normalisedWord: "cat" }),
      buildWord({ id: "word-2", practiceRoute: route, normalisedWord: "cat" }),
    ],
  });

  assert.equal(result.status, "insufficient_words");
}

async function assertContrastRouteRequiresApprovedPairsWhenConfigured() {
  const route: WritingEngineStage2d1WordMapRoute = "contrast_practice";
  const { result } = await resolveWith({
    learningItem: { practiceRoute: route },
    catalog: { practiceRoute: route },
    routeSupport: [
      buildRouteSupport({
        route,
        minimumWordsRequired: 1,
        requiresContrastWords: true,
      }),
    ],
    words: [buildWord({ practiceRoute: route })],
    contrastPairs: [],
  });

  assert.equal(result.status, "insufficient_contrast_words");
}

async function assertInactiveRejectedAndDeactivatedContentIsExcluded() {
  const { result } = await resolveWith({
    routeSupport: [
      buildRouteSupport({
        minimumWordsRequired: 1,
      }),
      buildRouteSupport({
        id: "route-support-inactive",
        rowStatus: "inactive",
      }),
    ],
    words: [
      buildWord({ id: "word-active", normalisedWord: "cat" }),
      buildWord({
        id: "word-inactive",
        normalisedWord: "map",
        rowStatus: "inactive",
      }),
      buildWord({
        id: "word-rejected",
        normalisedWord: "sat",
        rowStatus: "rejected",
      }),
      buildWord({
        id: "word-deactivated-batch",
        normalisedWord: "pan",
        importBatchStatus: "deactivated",
      }),
      buildWord({
        id: "word-unapproved",
        normalisedWord: "mat",
        approvedForAssignment: false,
      }),
    ],
  });

  assert.equal(result.status, "available");
  assert.deepEqual(
    result.content.targetWords.map((word) => word.normalisedWord),
    ["cat"],
  );
}

async function assertConflictingActiveContentIsBlocked() {
  const { result } = await resolveWith({
    words: [
      buildWord({ id: "word-1", normalisedWord: "cat", wordRole: "practice_word" }),
      buildWord({
        id: "word-2",
        normalisedWord: "cat",
        wordRole: "dictation_word",
      }),
    ],
  });

  assert.equal(result.status, "content_conflict");
}

async function assertDuplicateRouteSupportIsConflict() {
  const { result } = await resolveWith({
    routeSupport: [
      buildRouteSupport({ id: "route-support-1" }),
      buildRouteSupport({ id: "route-support-2" }),
    ],
  });

  assert.equal(result.status, "content_conflict");
}

async function assertDiagnosticExamplesAreNotQueryable() {
  const { calls } = await resolveWith();

  assert.ok(
    !calls.includes("canonical_spelling_word_map_diagnostic_examples"),
    "Stage 2D.1 resolver must not query diagnostic examples.",
  );
}

async function main() {
  await assertHappyPathUsesApprovedActiveContent();
  await assertMissingOrInactiveLearningItemIsIneligible();
  await assertCatalogGuardsLearningItemEligibility();
  await assertUnsupportedRouteSkipsBeforeContentReads();
  await assertMissingRouteSupportIsExplicit();
  await assertGroupedSetRequiresEnoughWords();
  await assertContrastRouteRequiresApprovedPairsWhenConfigured();
  await assertInactiveRejectedAndDeactivatedContentIsExcluded();
  await assertConflictingActiveContentIsBlocked();
  await assertDuplicateRouteSupportIsConflict();
  await assertDiagnosticExamplesAreNotQueryable();

  console.log("writing-engine-stage2d1-word-map-assignment-content-regression: ok");
}

void main();
