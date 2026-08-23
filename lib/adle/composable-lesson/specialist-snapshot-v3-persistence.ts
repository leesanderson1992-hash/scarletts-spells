import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import type { LearningItemFact } from "../learning-items";
import type { CompiledCompoundWordSpecialistSnapshotV3 } from "./specialist-snapshot-v3-contracts";
import { validateCompiledSpecialistSnapshotV3 } from "./specialist-snapshot-v3-validator";
import type { SpecialistSnapshotV3WriterAuthorization } from "./specialist-snapshot-writer-rollout";

export type SpecialistSnapshotV3PersistenceInput = {
  authorization: SpecialistSnapshotV3WriterAuthorization;
  parentUserId: string;
  childId: string;
  planDate: string;
  header: AssignmentHeaderDraft;
  items: readonly AssignmentItemDraft[];
  intakes: readonly LearningItemFact[];
  snapshot: CompiledCompoundWordSpecialistSnapshotV3;
};

export interface SpecialistSnapshotV3PersistencePort {
  persist(input: Omit<SpecialistSnapshotV3PersistenceInput, "authorization" | "snapshot"> & {
    compiledLessonSnapshot: CompiledCompoundWordSpecialistSnapshotV3;
  }): Promise<string>;
}

export function supabaseSpecialistSnapshotV3PersistencePort(
  serviceClient: Pick<SupabaseClient, "rpc">,
): SpecialistSnapshotV3PersistencePort {
  return {
    async persist(input) {
      const { data, error } = await serviceClient.rpc("persist_adle_specialist_daily_plan_v3", {
        p_parent_user_id: input.parentUserId,
        p_child_id: input.childId,
        p_plan_date: input.planDate,
        p_header: input.header,
        p_items: input.items,
        p_intakes: input.intakes,
        p_snapshot: input.compiledLessonSnapshot,
      });
      if (error) throw new Error(`persistSpecialistSnapshotV3:rpc:${error.message}`);
      if (typeof data !== "string" || data.length === 0) throw new Error("persistSpecialistSnapshotV3: RPC returned no assignment id");
      return data;
    },
  };
}

/** Reusable atomic specialist boundary; route-specific compilers validate first. */
export async function persistSpecialistSnapshotV3(
  port: SpecialistSnapshotV3PersistencePort,
  input: SpecialistSnapshotV3PersistenceInput,
): Promise<string> {
  if (input.authorization.kind !== "compound_word_v2_for_current_learner"
    || input.authorization.childId.toLowerCase() !== input.childId.toLowerCase()) {
    throw new Error("persistSpecialistSnapshotV3: writer selection mismatch");
  }
  const validation = validateCompiledSpecialistSnapshotV3(input.snapshot, {
    lessonRouteMetadata: input.header.lessonRouteMetadata,
    assignmentGenerationSource: input.header.assignmentGenerationSource,
    items: input.items.map((item) => ({
      sourceEntityId: item.sourceEntityId,
      position: item.position,
      sectionKey: item.metadata.sectionKey,
      canonicalWordId: item.metadata.canonicalWordId,
      templateKey: item.templateKey,
      targetWord: item.targetWord,
      promptData: item.promptData,
    })),
  });
  if (!validation.ok) throw new Error(`persistSpecialistSnapshotV3:validation:${validation.blockers.map((entry) => entry.code).join(",")}`);
  if (input.header.childId !== input.childId
    || input.header.parentUserId !== input.parentUserId
    || input.header.assignmentDate !== input.planDate
    || input.header.title !== "ADLE Daily Plan"
    || input.header.status !== "pending"
    || input.header.assignmentGenerationSource !== "adle_composer_v1"
    || input.items.length !== 18
    || input.items.some((item, index) => item.childId !== input.childId
      || item.parentUserId !== input.parentUserId
      || item.metadata.planDate !== input.planDate
      || item.position !== index + 1
      || item.domainModule !== "spelling"
      || item.sourceType !== "adle_composer"
      || item.status !== "ready")
    || input.intakes.some((intake) => intake.childId !== input.childId)) {
    throw new Error("persistSpecialistSnapshotV3: durable assignment identity mismatch");
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignmentId)) {
    throw new Error("persistSpecialistSnapshotV3: persistence port returned an invalid assignment id");
  }
  return assignmentId;
}
