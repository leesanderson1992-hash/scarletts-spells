import type { WritingEnginePracticeRoute } from "../types";

export const WRITING_ENGINE_STAGE2D1_WORD_MAP_ROUTES = [
  "word_practice",
  "grouped_set_practice",
  "contrast_practice",
  "dictation",
] as const satisfies WritingEnginePracticeRoute[];

export type WritingEngineStage2d1WordMapRoute =
  (typeof WRITING_ENGINE_STAGE2D1_WORD_MAP_ROUTES)[number];

export const WRITING_ENGINE_STAGE2D1_WORD_MAP_STATUSES = [
  "available",
  "ineligible_learning_item",
  "route_not_supported",
  "no_active_route_support",
  "insufficient_words",
  "insufficient_contrast_words",
  "content_conflict",
] as const;

export type WritingEngineStage2d1WordMapStatus =
  (typeof WRITING_ENGINE_STAGE2D1_WORD_MAP_STATUSES)[number];

export type WritingEngineStage2d1SourceProvenance = {
  importBatchId: string;
  sourceSheet: string;
  sourceRowNumber: number;
  sourceRowHash: string;
};

export type WritingEngineStage2d1LearningItemRead = {
  learningItemId: string;
  childId: string;
  parentUserId: string;
  microSkillKey: string | null;
  practiceRoute: string | null;
  isActive: boolean;
};

export type WritingEngineStage2d1CatalogRead = {
  microSkillKey: string;
  masteryDomainKey: string;
  practiceRoute: string | null;
  isAssignable: boolean;
  isActive: boolean;
};

export type WritingEngineStage2d1RouteSupportRead = {
  id: string;
  importBatchId: string;
  importBatchStatus: string;
  rowStatus: string;
  microSkillKey: string;
  route: string;
  minimumWordsRequired: number;
  requiresContrastWords: boolean;
  templateKey: string | null;
  enabledForMvp: boolean;
  provenance: WritingEngineStage2d1SourceProvenance;
};

export type WritingEngineStage2d1WordRead = {
  id: string;
  importBatchId: string;
  importBatchStatus: string;
  rowStatus: string;
  microSkillKey: string;
  word: string;
  normalisedWord: string;
  wordRole: string;
  microSkillRole: string;
  diversityGroupKey: string | null;
  complexityBand: string;
  frequencyBand: string;
  practiceRoute: string;
  approvedForAssignment: boolean;
  provenance: WritingEngineStage2d1SourceProvenance;
};

export type WritingEngineStage2d1ContrastPairRead = {
  id: string;
  importBatchId: string;
  importBatchStatus: string;
  rowStatus: string;
  targetMicroSkillKey: string;
  targetWord: string;
  contrastWord: string;
  contrastMicroSkillKey: string;
  contrastType: string;
  approvedForAssignment: boolean;
  provenance: WritingEngineStage2d1SourceProvenance;
};

export type WritingEngineStage2d1WordContent = {
  id: string;
  word: string;
  normalisedWord: string;
  wordRole: string;
  microSkillRole: string;
  diversityGroupKey: string | null;
  complexityBand: string;
  frequencyBand: string;
  provenance: WritingEngineStage2d1SourceProvenance;
};

export type WritingEngineStage2d1ContrastContent = {
  id: string;
  targetWord: string;
  contrastWord: string;
  contrastMicroSkillKey: string;
  contrastType: string;
  provenance: WritingEngineStage2d1SourceProvenance;
};

export type WritingEngineStage2d1RouteSupportContent = {
  id: string;
  minimumWordsRequired: number;
  requiresContrastWords: boolean;
  templateKey: string | null;
  provenance: WritingEngineStage2d1SourceProvenance;
};

export type WritingEngineStage2d1AssignmentContent = {
  learningItemId: string;
  childId: string;
  parentUserId: string;
  microSkillKey: string;
  practiceRoute: WritingEngineStage2d1WordMapRoute;
  routeSupport: WritingEngineStage2d1RouteSupportContent;
  targetWords: WritingEngineStage2d1WordContent[];
  contrastPairs: WritingEngineStage2d1ContrastContent[];
};

export type WritingEngineStage2d1AssignmentContentResult =
  | {
      status: "available";
      content: WritingEngineStage2d1AssignmentContent;
    }
  | {
      status: Exclude<WritingEngineStage2d1WordMapStatus, "available">;
      learningItemId: string;
      microSkillKey: string | null;
      practiceRoute: string | null;
      reason: string;
    };

export type WritingEngineStage2d1WordMapContentRepository = {
  getLearningItem(input: {
    learningItemId: string;
    childId: string;
    parentUserId: string;
  }): Promise<WritingEngineStage2d1LearningItemRead | null>;
  getCatalogEntry(input: {
    microSkillKey: string;
  }): Promise<WritingEngineStage2d1CatalogRead | null>;
  getRouteSupport(input: {
    microSkillKey: string;
    practiceRoute: WritingEngineStage2d1WordMapRoute;
  }): Promise<WritingEngineStage2d1RouteSupportRead[]>;
  getWords(input: {
    microSkillKey: string;
    practiceRoute: WritingEngineStage2d1WordMapRoute;
  }): Promise<WritingEngineStage2d1WordRead[]>;
  getContrastPairs(input: {
    microSkillKey: string;
  }): Promise<WritingEngineStage2d1ContrastPairRead[]>;
};

function isStage2d1WordMapRoute(
  route: string | null,
): route is WritingEngineStage2d1WordMapRoute {
  return WRITING_ENGINE_STAGE2D1_WORD_MAP_ROUTES.includes(
    route as WritingEngineStage2d1WordMapRoute,
  );
}

function normalizeWord(value: string) {
  return value.trim().toLowerCase();
}

function isActiveBatchContent(input: {
  rowStatus: string;
  importBatchStatus: string;
}) {
  return input.rowStatus === "active" && input.importBatchStatus === "active";
}

function unavailable(input: {
  status: Exclude<WritingEngineStage2d1WordMapStatus, "available">;
  learningItemId: string;
  microSkillKey: string | null;
  practiceRoute: string | null;
  reason: string;
}): WritingEngineStage2d1AssignmentContentResult {
  return input;
}

function dedupeWordsStable(
  words: WritingEngineStage2d1WordRead[],
): WritingEngineStage2d1WordContent[] {
  const seen = new Set<string>();
  const deduped: WritingEngineStage2d1WordContent[] = [];

  for (const row of words) {
    const normalisedWord = normalizeWord(row.normalisedWord || row.word);
    if (!normalisedWord || seen.has(normalisedWord)) {
      continue;
    }

    seen.add(normalisedWord);
    deduped.push({
      id: row.id,
      word: row.word,
      normalisedWord,
      wordRole: row.wordRole,
      microSkillRole: row.microSkillRole,
      diversityGroupKey: row.diversityGroupKey,
      complexityBand: row.complexityBand,
      frequencyBand: row.frequencyBand,
      provenance: row.provenance,
    });
  }

  return deduped;
}

function hasDuplicateActiveRouteSupport(
  routeSupport: WritingEngineStage2d1RouteSupportRead[],
) {
  return routeSupport.length > 1;
}

function hasActiveWordContentConflict(words: WritingEngineStage2d1WordRead[]) {
  const seen = new Map<string, string>();

  for (const row of words) {
    const normalisedWord = normalizeWord(row.normalisedWord || row.word);
    if (!normalisedWord) {
      continue;
    }

    const signature = [
      row.wordRole,
      row.microSkillRole,
      row.practiceRoute,
      row.diversityGroupKey ?? "",
    ].join("::");
    const previousSignature = seen.get(normalisedWord);

    if (previousSignature && previousSignature !== signature) {
      return true;
    }

    seen.set(normalisedWord, signature);
  }

  return false;
}

function toContrastContent(
  rows: WritingEngineStage2d1ContrastPairRead[],
): WritingEngineStage2d1ContrastContent[] {
  return rows.map((row) => ({
    id: row.id,
    targetWord: row.targetWord,
    contrastWord: row.contrastWord,
    contrastMicroSkillKey: row.contrastMicroSkillKey,
    contrastType: row.contrastType,
    provenance: row.provenance,
  }));
}

export async function resolveStage2d1WordMapAssignmentContent(input: {
  learningItemId: string;
  childId: string;
  parentUserId: string;
  repository: WritingEngineStage2d1WordMapContentRepository;
}): Promise<WritingEngineStage2d1AssignmentContentResult> {
  const learningItem = await input.repository.getLearningItem({
    learningItemId: input.learningItemId,
    childId: input.childId,
    parentUserId: input.parentUserId,
  });

  if (
    !learningItem ||
    !learningItem.isActive ||
    learningItem.childId !== input.childId ||
    learningItem.parentUserId !== input.parentUserId ||
    !learningItem.microSkillKey
  ) {
    return unavailable({
      status: "ineligible_learning_item",
      learningItemId: input.learningItemId,
      microSkillKey: learningItem?.microSkillKey ?? null,
      practiceRoute: learningItem?.practiceRoute ?? null,
      reason: "Learning item is missing, inactive, out of scope, or lacks a micro-skill.",
    });
  }

  if (!isStage2d1WordMapRoute(learningItem.practiceRoute)) {
    return unavailable({
      status: "route_not_supported",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "Learning item route is not supported by Stage 2D.1 word-map content.",
    });
  }

  const catalogEntry = await input.repository.getCatalogEntry({
    microSkillKey: learningItem.microSkillKey,
  });

  if (
    !catalogEntry ||
    !catalogEntry.isActive ||
    !catalogEntry.isAssignable ||
    catalogEntry.masteryDomainKey !== "D4" ||
    catalogEntry.practiceRoute !== learningItem.practiceRoute
  ) {
    return unavailable({
      status: "ineligible_learning_item",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "Catalog row is missing, inactive, non-assignable, non-spelling, or route-incompatible.",
    });
  }

  const routeSupportRows = (
    await input.repository.getRouteSupport({
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
    })
  ).filter(
    (row) =>
      row.microSkillKey === learningItem.microSkillKey &&
      row.route === learningItem.practiceRoute &&
      row.enabledForMvp &&
      isActiveBatchContent(row),
  );

  if (routeSupportRows.length === 0) {
    return unavailable({
      status: "no_active_route_support",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "No active MVP-enabled route support exists for this micro-skill and route.",
    });
  }

  if (hasDuplicateActiveRouteSupport(routeSupportRows)) {
    return unavailable({
      status: "content_conflict",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "Multiple active MVP-enabled route-support rows exist for this micro-skill and route.",
    });
  }

  const routeSupport = routeSupportRows[0];
  const wordRows = (
    await input.repository.getWords({
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
    })
  ).filter(
    (row) =>
      row.microSkillKey === learningItem.microSkillKey &&
      row.practiceRoute === learningItem.practiceRoute &&
      row.approvedForAssignment &&
      isActiveBatchContent(row),
  );

  if (hasActiveWordContentConflict(wordRows)) {
    return unavailable({
      status: "content_conflict",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "Active approved word-map rows contain conflicting content roles for the same normalized word.",
    });
  }

  const targetWords = dedupeWordsStable(wordRows);

  if (targetWords.length < routeSupport.minimumWordsRequired) {
    return unavailable({
      status: "insufficient_words",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "Active approved word-map content does not meet the route minimum word count.",
    });
  }

  const contrastRows =
    learningItem.practiceRoute === "contrast_practice" ||
    routeSupport.requiresContrastWords
      ? (
          await input.repository.getContrastPairs({
            microSkillKey: learningItem.microSkillKey,
          })
        ).filter(
          (row) =>
            row.targetMicroSkillKey === learningItem.microSkillKey &&
            row.approvedForAssignment &&
            isActiveBatchContent(row),
        )
      : [];
  const contrastPairs = toContrastContent(contrastRows);

  if (routeSupport.requiresContrastWords && contrastPairs.length === 0) {
    return unavailable({
      status: "insufficient_contrast_words",
      learningItemId: learningItem.learningItemId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      reason: "Route support requires contrast words, but no active approved contrast pairs are available.",
    });
  }

  return {
    status: "available",
    content: {
      learningItemId: learningItem.learningItemId,
      childId: learningItem.childId,
      parentUserId: learningItem.parentUserId,
      microSkillKey: learningItem.microSkillKey,
      practiceRoute: learningItem.practiceRoute,
      routeSupport: {
        id: routeSupport.id,
        minimumWordsRequired: routeSupport.minimumWordsRequired,
        requiresContrastWords: routeSupport.requiresContrastWords,
        templateKey: routeSupport.templateKey,
        provenance: routeSupport.provenance,
      },
      targetWords,
      contrastPairs,
    },
  };
}
