import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import type { LearningItemFact } from "../learning-items";
import type { CompiledLessonSnapshotV3, GenericSnapshotV3ValidationResult } from "./generic-snapshot-v3-contracts";
import { validateCompiledGenericLessonSnapshotV3 } from "./generic-snapshot-v3-validator";

export interface GuardedGenericSnapshotV3PersistenceInput {
  environment: "test" | "development" | "staging";
  parentUserId: string;
  childId: string;
  planDate: string;
  header: AssignmentHeaderDraft;
  items: readonly AssignmentItemDraft[];
  intakes: readonly LearningItemFact[];
  snapshot: CompiledLessonSnapshotV3;
}

export interface GenericSnapshotJsonPersistencePort {
  persist(input: {
    parentUserId: string;
    childId: string;
    planDate: string;
    header: AssignmentHeaderDraft;
    items: readonly AssignmentItemDraft[];
    intakes: readonly LearningItemFact[];
    compiledLessonSnapshot: CompiledLessonSnapshotV3;
  }): Promise<string>;
}

/**
 * Pre-validates before the existing compiledLessonSnapshot JSON boundary.
 * The real Supabase v2 RPC is intentionally not used: its immutable database
 * constraint is v2-only and changing it requires a separately authorised
 * schema/release slice.
 */
export async function persistGuardedGenericSnapshotV3(
  port: GenericSnapshotJsonPersistencePort,
  input: GuardedGenericSnapshotV3PersistenceInput,
): Promise<{ assignmentId: string; validation: Extract<GenericSnapshotV3ValidationResult, { ok: true }> }> {
  const environment: string = input.environment;
  if (environment === "production") {
    throw new Error("persistGuardedGenericSnapshotV3: Production persistence is not authorised");
  }
  if (input.header.childId !== input.childId || input.header.parentUserId !== input.parentUserId) {
    throw new Error("persistGuardedGenericSnapshotV3: assignment identity mismatch");
  }
  const validation = validateCompiledGenericLessonSnapshotV3(input.snapshot, {
    lessonRouteMetadata: input.header.lessonRouteMetadata,
    assignmentGenerationSource: input.header.assignmentGenerationSource,
    items: input.items.map((item) => ({
      sourceEntityId: item.sourceEntityId,
      position: item.position,
      sectionKey: item.metadata.sectionKey,
      canonicalWordId: item.metadata.canonicalWordId,
      targetWord: item.targetWord,
    })),
  });
  if (!validation.ok) {
    throw new Error(`persistGuardedGenericSnapshotV3:validation:${validation.blockers.map((entry) => entry.code).join(",")}`);
  }
  const assignmentId = await port.persist({
    parentUserId: input.parentUserId,
    childId: input.childId,
    planDate: input.planDate,
    header: input.header,
    items: input.items,
    intakes: input.intakes,
    compiledLessonSnapshot: validation.snapshot,
  });
  if (!assignmentId) throw new Error("persistGuardedGenericSnapshotV3: persistence port returned no assignment id");
  return { assignmentId, validation };
}
