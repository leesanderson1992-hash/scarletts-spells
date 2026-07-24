import type { SupabaseClient } from "@supabase/supabase-js";
import type { BaseWordFamilyLessonSnapshotV1 } from "../morphology/base-word-family-payload";
import { validateBaseWordFamilyLessonSnapshot } from "../morphology/base-word-family-payload";
import { BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT } from "../morphology/base-word-family-pilot-contract";
import { buildBaseWordFamilyPilotItems } from "../morphology/base-word-family-pilot-plan";
import { compileBaseWordFamilyLessonSnapshot } from "../morphology/base-word-family-payload";
import { selectBaseWordFamilyLesson, type BaseWordFamilyFact, type BaseWordFamilyMemberFact } from "../base-word-family-selection";
import { loadBaseWordFamilyLessonReadModel } from "./base-word-family-lesson-read-model";
import { loadDailyPlanFacts } from "./composer-facts-loader";
import { assertBaseWordFamilyPilotEnabledForChild } from "../morphology/base-word-family-pilot-access";
import type { AssignmentAttemptEventWrite, LessonCompletionWrite } from "./session-completion-loader";
import type { BaseWordTransferMissWrite } from "../base-word-transfer-evidence";
import type { WordLabReflectionWrite } from "./word-lab-completion-loader";
import { loadAdleLessonRouteActivations } from "./lesson-route-activations";
import { resolveAdleRouteActivationEnvironment } from "../route-activation-environment";

export const BASE_WORD_PILOT_MICRO_SKILLS = [
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
] as const;
type FamilyRow = { id: string; base_family_key: string; micro_skill_key: string; row_status: "active" | "draft" | "rejected" | "superseded"; review_status: "approved_for_first_exposure" | "in_review" | "draft" | "ai_draft" | "changes_requested" | "approved_for_guided_review" | "rejected" | "superseded" };
type MemberRow = { base_word_family_id: string; canonical_word_id: string; member_role: BaseWordFamilyMemberFact["memberRole"]; assignment_eligible: boolean; row_status: BaseWordFamilyMemberFact["rowStatus"]; review_status: BaseWordFamilyMemberFact["reviewStatus"] };

/**
 * Loads only existing verified learning items and reviewed curriculum data.
 * It never creates a substitute target or turns a raw attempt into a lesson.
 */
export async function loadBaseWordFamilyPilotReadiness(params: {
  client: SupabaseClient;
  childId: string;
  planDate: string;
}): Promise<{ payload: BaseWordFamilyLessonSnapshotV1 | null; readinessReason: string | null }> {
  const activationEnvironment = resolveAdleRouteActivationEnvironment();
  if (!activationEnvironment) {
    return { payload: null, readinessReason: "adle_route_activation_environment_not_configured" };
  }
  const activations = await loadAdleLessonRouteActivations(params.client, {
    microSkillKeys: BASE_WORD_PILOT_MICRO_SKILLS,
    environmentKey: activationEnvironment,
  });
  const enabledActivations = activations.filter(
    (activation) =>
      activation.lessonRouteKey === "base_word_family_v1" &&
      activation.activationStatus === "production_enabled",
  );
  if (enabledActivations.length === 0)
    return { payload: null, readinessReason: "adle_route_not_production_enabled" };
  const { facts } = await loadDailyPlanFacts(params.client, { childId: params.childId, today: params.planDate as import("../review-scheduler").IsoDate });
  const { count: runCount, error: runError } = await params.client.from("adle_base_word_family_pilot_runs").select("id", { count: "exact", head: true }).eq("child_id", params.childId).neq("run_status", "cancelled");
  if (runError) throw new Error(`loadBaseWordFamilyPilotReadiness: ${runError.message}`);
  const candidates: Array<{ activation: (typeof enabledActivations)[number]; microSkillKey: string; selection: ReturnType<typeof selectBaseWordFamilyLesson> }> = [];
  const reasons: string[] = [];
  for (const activation of enabledActivations) {
    const { data: familyData, error: familyError } = await params.client.from("canonical_teaching_dictionary_base_word_families")
      .select("id, base_family_key, micro_skill_key, row_status, review_status")
      .eq("import_batch_id", activation.importBatchId).eq("micro_skill_key", activation.microSkillKey);
    if (familyError) throw new Error(`loadBaseWordFamilyPilotReadiness: ${familyError.message}`);
    const familyRows = (familyData ?? []) as FamilyRow[];
    const familyIds = familyRows.map((row) => row.id);
    const { data: memberData, error: memberError } = familyIds.length
      ? await params.client.from("canonical_teaching_dictionary_base_word_family_members").select("base_word_family_id, canonical_word_id, member_role, assignment_eligible, row_status, review_status").in("base_word_family_id", familyIds)
      : { data: [], error: null };
    if (memberError) throw new Error(`loadBaseWordFamilyPilotReadiness: ${memberError.message}`);
    const keyById = new Map(familyRows.map((row) => [row.id, row.base_family_key]));
    const families: BaseWordFamilyFact[] = familyRows.map((row) => ({ baseFamilyKey: row.base_family_key, microSkillKey: row.micro_skill_key, rowStatus: row.row_status, reviewStatus: row.review_status }));
    const members: BaseWordFamilyMemberFact[] = ((memberData ?? []) as MemberRow[]).flatMap((row) => {
      const baseFamilyKey = keyById.get(row.base_word_family_id);
      return baseFamilyKey ? [{ baseFamilyKey, canonicalWordId: row.canonical_word_id, memberRole: row.member_role, assignmentEligible: row.assignment_eligible, complexityLevel: null, rowStatus: row.row_status, reviewStatus: row.review_status }] : [];
    });
    const selection = selectBaseWordFamilyLesson(params.childId, activation.microSkillKey, { learningItems: facts.learningItems, families, members });
    if (selection.skipReasons.length === 0) candidates.push({ activation, microSkillKey: activation.microSkillKey, selection });
    else reasons.push(selection.skipReasons.join(","));
  }
  const candidate = candidates[0];
  if (!candidate) {
    return { payload: null, readinessReason: reasons.join(";") || "no_supported_base_word_skill_ready" };
  }
  const { activation, microSkillKey, selection } = candidate;
  const pilotLessonNumber = (runCount ?? 0) + 1;
  const authenticTargets = selection.slots.filter((slot) => slot.provenance === "authentic_target").map((slot) => {
    const item = facts.learningItems.find((candidate) => candidate.learningItemId === slot.learningItemId);
    return item ? { canonicalWordId: slot.canonicalWordId, learningItemId: item.learningItemId, sourceRef: item.sourceRef } : null;
  });
  if (authenticTargets.some((target) => target === null)) return { payload: null, readinessReason: "authentic_target_provenance_missing" };
  const readModel = await loadBaseWordFamilyLessonReadModel(params.client, {
    microSkillKey, contentVersion: activation.contentVersion, importBatchId: activation.importBatchId,
    authenticTargets: authenticTargets as NonNullable<(typeof authenticTargets)[number]>[],
    sections: selection.guidedFamilySections.map((section) => ({ baseFamilyKey: section.baseFamilyKey, authenticTargetWordIds: [...section.authenticTargetWordIds], guidedWordIds: [...section.guidedWordIds] })),
    independentSlots: selection.slots.map(({ canonicalWordId, provenance, baseFamilyKey, learningItemId }) => ({ canonicalWordId, provenance, baseFamilyKey, learningItemId })),
    pilotLessonNumber,
  });
  if (!readModel) return { payload: null, readinessReason: "reviewed_family_read_model_unavailable" };
  return { payload: compileBaseWordFamilyLessonSnapshot(readModel), readinessReason: null };
}

/** Service-only, explicit persistence. Caller must check the gate and genuine readiness first. */
export async function persistBaseWordFamilyPilotAssignment(params: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
  planDate: string;
  payload: BaseWordFamilyLessonSnapshotV1;
}): Promise<string> {
  const payload = validateBaseWordFamilyLessonSnapshot(params.payload);
  if (!payload) throw new Error("Refusing base-word pilot persistence: malformed reviewed snapshot.");
  const items = buildBaseWordFamilyPilotItems({ payload, parentUserId: params.parentUserId, childId: params.childId, planDate: params.planDate });
  if (items.length !== BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT) throw new Error("Refusing base-word pilot persistence: assignment binding count drift.");
  const { data, error } = await params.client.rpc("persist_adle_base_word_family_pilot_v1", {
    p_parent_user_id: params.parentUserId, p_child_id: params.childId, p_plan_date: params.planDate, p_payload: payload, p_items: items,
  });
  if (error) throw new Error(`persistBaseWordFamilyPilotAssignment: ${error.message}`);
  if (typeof data !== "string" || data.length === 0) throw new Error("persistBaseWordFamilyPilotAssignment: RPC returned no assignment id");
  return data;
}

/** Explicit guarded generator. This is intentionally not called by the child route or generic composer. */
export async function generateGuardedBaseWordFamilyPilot(params: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
  planDate: string;
}): Promise<{ assignmentId: string | null; readinessReason: string | null }> {
  assertBaseWordFamilyPilotEnabledForChild(params.childId);
  const readiness = await loadBaseWordFamilyPilotReadiness({ client: params.client, childId: params.childId, planDate: params.planDate });
  if (!readiness.payload) return { assignmentId: null, readinessReason: readiness.readinessReason ?? "not_ready" };
  return { assignmentId: await persistBaseWordFamilyPilotAssignment({ ...params, payload: readiness.payload }), readinessReason: null };
}

export async function persistBaseWordFamilyPilotCompletion(params: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
  assignmentId: string;
  planDate: string;
  microSkillKey: string;
  sourceRef: string;
  assignmentItemIds: readonly string[];
  attempts: readonly AssignmentAttemptEventWrite[];
  lesson: LessonCompletionWrite;
  reflection: WordLabReflectionWrite;
  transferMisses: readonly BaseWordTransferMissWrite[];
}): Promise<{ status: "completed" | "already_completed" }> {
  const { data, error } = await params.client.rpc("complete_adle_base_word_family_pilot_v2", {
    p_parent_user_id: params.parentUserId, p_child_id: params.childId, p_assignment_id: params.assignmentId,
    p_plan_date: params.planDate, p_micro_skill_key: params.microSkillKey, p_source_ref: params.sourceRef,
    p_assignment_item_ids: params.assignmentItemIds, p_attempts: params.attempts, p_lesson: { ...params.lesson, reflection: params.reflection },
    p_transfer_misses: params.transferMisses,
  });
  if (error) throw new Error(`persistBaseWordFamilyPilotCompletion: ${error.message}`);
  if (!data || typeof data !== "object" || !["completed", "already_completed"].includes(String((data as { status?: unknown }).status))) throw new Error("persistBaseWordFamilyPilotCompletion: invalid RPC response");
  return data as { status: "completed" | "already_completed" };
}
