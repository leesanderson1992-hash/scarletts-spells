import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import type { LearningItemFact } from "../learning-items";
import type { SupabaseClient } from "@supabase/supabase-js";
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

type GenericSnapshotV3RpcClient = Pick<SupabaseClient, "rpc">;

function supabaseGenericSnapshotV3PersistencePort(
  serviceClient: GenericSnapshotV3RpcClient,
): GenericSnapshotJsonPersistencePort {
  return {
    async persist(input) {
      const { data, error } = await serviceClient.rpc("persist_adle_generic_daily_plan_v3", {
        p_parent_user_id: input.parentUserId,
        p_child_id: input.childId,
        p_plan_date: input.planDate,
        p_header: input.header,
        p_items: input.items,
        p_intakes: input.intakes,
        p_snapshot: input.compiledLessonSnapshot,
      });
      if (error) {
        throw new Error(`persistGuardedGenericSnapshotV3ToSupabase:rpc:${error.message}`);
      }
      if (typeof data !== "string" || data.length === 0) {
        throw new Error("persistGuardedGenericSnapshotV3ToSupabase: RPC returned no assignment id");
      }
      return data;
    },
  };
}

/**
 * Pre-validates before the compiledLessonSnapshot JSON boundary. D2A keeps this
 * application validator authoritative for canonical and pedagogical rules; the
 * database independently enforces durable envelope and binding integrity.
 */
export async function persistGuardedGenericSnapshotV3(
  port: GenericSnapshotJsonPersistencePort,
  input: GuardedGenericSnapshotV3PersistenceInput,
): Promise<{ assignmentId: string; validation: Extract<GenericSnapshotV3ValidationResult, { ok: true }> }> {
  const environment: string = input.environment;
  if (environment === "production") {
    throw new Error("persistGuardedGenericSnapshotV3: Production persistence is not authorised");
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
  if (
    input.header.childId !== input.childId
    || input.header.parentUserId !== input.parentUserId
    || input.header.assignmentDate !== input.planDate
    || input.header.title !== "ADLE Daily Plan"
    || input.header.status !== "pending"
    || input.header.assignmentGenerationSource !== "adle_composer_v1"
    || input.items.length !== validation.snapshot.assignment.itemCount
    || input.items.some((item, index) =>
      item.childId !== input.childId
      || item.parentUserId !== input.parentUserId
      || item.metadata.planDate !== input.planDate
      || item.position !== index + 1
      || item.domainModule !== "spelling"
      || item.sourceType !== "adle_composer"
      || item.status !== "ready"
    )
    || input.intakes.some((intake) => intake.childId !== input.childId)
  ) {
    throw new Error("persistGuardedGenericSnapshotV3: durable assignment identity mismatch");
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
    throw new Error("persistGuardedGenericSnapshotV3: persistence port returned an invalid assignment id");
  }
  return { assignmentId, validation };
}

/**
 * The only application-facing Supabase entry point for v3 persistence.
 * Canonical Phase D validation always completes before the service-only RPC
 * can be invoked; detailed activity eligibility deliberately stays out of SQL.
 * This function is not wired into assignment generation in D2A.
 */
export function persistGuardedGenericSnapshotV3ToSupabase(
  serviceClient: GenericSnapshotV3RpcClient,
  input: GuardedGenericSnapshotV3PersistenceInput,
): Promise<{
  assignmentId: string;
  validation: Extract<GenericSnapshotV3ValidationResult, { ok: true }>;
}> {
  return persistGuardedGenericSnapshotV3(
    supabaseGenericSnapshotV3PersistencePort(serviceClient),
    input,
  );
}
