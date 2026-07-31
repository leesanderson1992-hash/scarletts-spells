import type {
  CompiledLessonSnapshotV2,
  GenericSnapshotBlocker,
} from "./generic-snapshot-contracts";
import type { GenericSnapshotMode } from "./generic-snapshot-mode";
import {
  canonicalSnapshotJson,
  validateCompiledGenericLessonSnapshot,
} from "./generic-snapshot-validator";

export interface GenericSnapshotReadableItem {
  id: string;
  sourceEntityId: string;
  sectionKey: string;
  templateKey: string;
  position: number;
  status: string;
  targetWord: string | null;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  adleLearningItemRef: string | null;
  promptData: Record<string, unknown>;
  itemMetadata?: Record<string, unknown>;
}

export type GenericSnapshotResolutionResult<T extends GenericSnapshotReadableItem> =
  | {
      status: "compatibility";
      mode: GenericSnapshotMode;
      source: "snapshot_absent";
      snapshot: null;
      items: T[];
      blockers: readonly [];
    }
  | {
      status: "resolved";
      mode: GenericSnapshotMode;
      source: "snapshot_v2";
      snapshot: CompiledLessonSnapshotV2;
      items: T[];
      blockers: readonly [];
    }
  | {
      status: "blocked";
      mode: GenericSnapshotMode;
      source: "snapshot_v2";
      snapshot: null;
      items: readonly [];
      blockers: readonly GenericSnapshotBlocker[];
    };

function projection<T extends GenericSnapshotReadableItem>(items: readonly T[]): unknown {
  return items.map((item) => ({
    id: item.id,
    sourceEntityId: item.sourceEntityId,
    sectionKey: item.sectionKey,
    templateKey: item.templateKey,
    position: item.position,
    status: item.status,
    targetWord: item.targetWord,
    canonicalWordId: item.canonicalWordId,
    microSkillKey: item.microSkillKey,
    adleLearningItemRef: item.adleLearningItemRef,
    promptData: item.promptData,
    itemMetadata: item.itemMetadata ?? {},
  }));
}

export function resolveGenericLessonSnapshot<T extends GenericSnapshotReadableItem>(input: {
  mode: GenericSnapshotMode;
  lessonRouteMetadata: unknown | null;
  assignmentGenerationSource: string | null;
  compiledLessonSnapshot: unknown | null;
  items: readonly T[];
}): GenericSnapshotResolutionResult<T> {
  const legacyItems = [...input.items].sort((left, right) => left.position - right.position);
  if (input.compiledLessonSnapshot === null || input.compiledLessonSnapshot === undefined) {
    return {
      status: "compatibility",
      mode: input.mode,
      source: "snapshot_absent",
      snapshot: null,
      items: legacyItems,
      blockers: [],
    };
  }
  const validated = validateCompiledGenericLessonSnapshot(input.compiledLessonSnapshot, {
    lessonRouteMetadata: input.lessonRouteMetadata,
    assignmentGenerationSource: input.assignmentGenerationSource,
    items: legacyItems.map((item) => ({
      sourceEntityId: item.sourceEntityId,
      position: item.position,
      sectionKey: item.sectionKey,
      templateKey: item.templateKey,
      canonicalWordId: item.canonicalWordId,
      targetWord: item.targetWord,
      promptData: item.promptData,
    })),
  });
  if (!validated.ok) {
    return {
      status: "blocked",
      mode: input.mode,
      source: "snapshot_v2",
      snapshot: null,
      items: [],
      blockers: validated.blockers,
    };
  }
  const itemBySource = new Map(legacyItems.map((item) => [item.sourceEntityId, item]));
  const wordBySnapshotId = new Map(
    validated.snapshot.words.map((word) => [word.wordSnapshotId, word]),
  );
  const snapshotItems = validated.snapshot.activities.flatMap((activity) => {
    const item = itemBySource.get(activity.itemBinding.sourceEntityId);
    if (!item) return [];
    const boundWords = activity.wordSnapshotIds.flatMap((id) => {
      const word = wordBySnapshotId.get(id);
      return word ? [word] : [];
    });
    const boundWord = item.canonicalWordId === null
      ? null
      : boundWords.find((word) => word.canonicalWordId === item.canonicalWordId) ?? null;
    return [{
      ...item,
      sourceEntityId: activity.itemBinding.sourceEntityId,
      sectionKey: activity.sectionKey,
      templateKey: activity.templateKey,
      position: activity.itemBinding.position,
      targetWord: boundWord?.displayWord ?? item.targetWord,
      canonicalWordId: boundWord?.canonicalWordId ?? item.canonicalWordId,
      microSkillKey: boundWord?.microSkillKey ?? item.microSkillKey,
      adleLearningItemRef: boundWord?.learningItemId ?? item.adleLearningItemRef,
    }];
  });
  if (snapshotItems.length !== legacyItems.length) {
    return {
      status: "blocked",
      mode: input.mode,
      source: "snapshot_v2",
      snapshot: null,
      items: [],
      blockers: [{ code: "snapshot_item_count_mismatch" }],
    };
  }
  if (canonicalSnapshotJson(projection(snapshotItems)) !== canonicalSnapshotJson(projection(legacyItems))) {
    return {
      status: "blocked",
      mode: input.mode,
      source: "snapshot_v2",
      snapshot: null,
      items: [],
      blockers: [{ code: "item_position_mismatch" }],
    };
  }
  return {
    status: "resolved",
    mode: input.mode,
    source: "snapshot_v2",
    snapshot: validated.snapshot,
    // Observe/off retain the current item-derived projection; enforce uses
    // snapshot activity order. Parity above makes the values identical.
    items: input.mode === "enforce" ? snapshotItems : legacyItems,
    blockers: [],
  };
}

export function emitGenericSnapshotResolutionEvent(
  result: GenericSnapshotResolutionResult<GenericSnapshotReadableItem>,
  assignmentGenerationSource: string | null,
): void {
  const event = {
    event: "adle_generic_snapshot_resolution",
    status: result.status,
    mode: result.mode,
    source: result.source,
    assignmentGenerationSource,
    ...(result.status === "blocked"
      ? { blockerCodes: result.blockers.map((entry) => entry.code) }
      : result.status === "resolved"
        ? {
            snapshotSchemaVersion: result.snapshot.snapshotSchemaVersion,
            compilerVersion: result.snapshot.compilerVersion,
            routeId: result.snapshot.route.routeId,
            routeVersion: result.snapshot.route.routeVersion,
            activityCount: result.snapshot.activities.length,
            wordCount: result.snapshot.words.length,
            itemCount: result.items.length,
          }
        : { itemCount: result.items.length }),
  };
  if (result.status === "blocked") console.warn(JSON.stringify(event));
  else console.info(JSON.stringify(event));
}
