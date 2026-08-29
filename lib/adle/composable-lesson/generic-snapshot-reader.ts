import type { CanonicalActivitySpec } from "../canonical-activity-spec";
import type {
  CompiledLessonSnapshotV3,
  GenericSnapshotV3Blocker,
} from "./generic-snapshot-v3-contracts";
import { canonicalActivitySpecFromSnapshotV3 } from "./generic-snapshot-v3-registry";
import { validateCompiledGenericLessonSnapshotV3 } from "./generic-snapshot-v3-validator";
import type { GenericSnapshotMode } from "./generic-snapshot-mode";
import {
  canonicalSnapshotJson,
} from "./canonical-fingerprint";

type GenericSnapshotReaderBlocker = GenericSnapshotV3Blocker | {
  code:
    | "snapshot_column_unavailable"
    | "snapshot_missing_for_explicit_generic_route";
};

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
  canonicalActivitySpec?: CanonicalActivitySpec;
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
      source: "snapshot_v3";
      snapshot: CompiledLessonSnapshotV3;
      items: T[];
      blockers: readonly [];
    }
  | {
      status: "blocked";
      mode: GenericSnapshotMode;
      source: "snapshot_v3" | "snapshot_unsupported" | "snapshot_column_unavailable";
      snapshot: null;
      items: readonly [];
      blockers: readonly GenericSnapshotReaderBlocker[];
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
  compiledLessonSnapshot: unknown | null | undefined;
  items: readonly T[];
  snapshotColumn?: "available" | "deferred_absent";
  requiresSnapshot?: boolean;
}): GenericSnapshotResolutionResult<T> {
  const legacyItems = [...input.items].sort((left, right) => left.position - right.position);
  if (input.snapshotColumn === "deferred_absent") {
    if (input.requiresSnapshot !== true) {
      return {
        status: "compatibility",
        mode: input.mode,
        source: "snapshot_absent",
        snapshot: null,
        items: legacyItems,
        blockers: [],
      };
    }
    return {
      status: "blocked",
      mode: input.mode,
      source: "snapshot_column_unavailable",
      snapshot: null,
      items: [],
      blockers: [{ code: "snapshot_column_unavailable" }],
    };
  }
  if (input.compiledLessonSnapshot === null || input.compiledLessonSnapshot === undefined) {
    if (input.requiresSnapshot === true) {
      return {
        status: "blocked",
        mode: input.mode,
        source: "snapshot_unsupported",
        snapshot: null,
        items: [],
        blockers: [{ code: "snapshot_missing_for_explicit_generic_route" }],
      };
    }
    return {
      status: "compatibility",
      mode: input.mode,
      source: "snapshot_absent",
      snapshot: null,
      items: legacyItems,
      blockers: [],
    };
  }
  if (
    typeof input.compiledLessonSnapshot === "object"
    && input.compiledLessonSnapshot !== null
    && (input.compiledLessonSnapshot as { snapshotSchemaVersion?: unknown }).snapshotSchemaVersion === 3
  ) {
    const validated = validateCompiledGenericLessonSnapshotV3(input.compiledLessonSnapshot, {
      lessonRouteMetadata: input.lessonRouteMetadata,
      assignmentGenerationSource: input.assignmentGenerationSource,
      items: legacyItems.map((item) => ({
        sourceEntityId: item.sourceEntityId,
        position: item.position,
        sectionKey: item.sectionKey,
        canonicalWordId: item.canonicalWordId,
        targetWord: item.targetWord,
      })),
    });
    if (validated.ok === false) {
      return {
        status: "blocked",
        mode: input.mode,
        source: "snapshot_v3",
        snapshot: null,
        items: [],
        blockers: validated.blockers,
      };
    }
    const itemBySource = new Map(legacyItems.map((item) => [item.sourceEntityId, item]));
    const snapshotItems = validated.snapshot.activities.flatMap((activity) => {
      const item = itemBySource.get(activity.itemBinding.sourceEntityId);
      if (!item) return [];
      return [{
        ...item,
        canonicalActivitySpec: canonicalActivitySpecFromSnapshotV3(
          activity,
          item as unknown as Record<string, unknown>,
        ),
      } as T];
    });
    if (snapshotItems.length !== legacyItems.length) {
      return {
        status: "blocked",
        mode: input.mode,
        source: "snapshot_v3",
        snapshot: null,
        items: [],
        blockers: [{ code: "snapshot_item_count_mismatch" }],
      };
    }
    if (canonicalSnapshotJson(projection(snapshotItems)) !== canonicalSnapshotJson(projection(legacyItems))) {
      return {
        status: "blocked",
        mode: input.mode,
        source: "snapshot_v3",
        snapshot: null,
        items: [],
        blockers: [{ code: "item_position_mismatch" }],
      };
    }
    return {
      status: "resolved",
      mode: input.mode,
      source: "snapshot_v3",
      snapshot: validated.snapshot,
      items: input.mode === "enforce" ? snapshotItems : legacyItems.map((item) => {
        const resolved = snapshotItems.find((candidate) => candidate.sourceEntityId === item.sourceEntityId);
        return resolved ?? item;
      }),
      blockers: [],
    };
  }
  return {
    status: "blocked",
    mode: input.mode,
    source: "snapshot_unsupported",
    snapshot: null,
    items: [],
    blockers: [{ code: "unsupported_snapshot_schema_version" }],
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
