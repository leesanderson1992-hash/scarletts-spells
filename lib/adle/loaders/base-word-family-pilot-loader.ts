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

export const BASE_WORD_PILOT_MICRO_SKILLS = [
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
] as const;
const BASE_WORD_PILOT_CONTENT_VERSION = "d4-mor-base-word-family-v2";

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
  const { facts } = await loadDailyPlanFacts(params.client, { childId: params.childId, today: params.planDate as import("../review-scheduler").IsoDate });
  const [familyResult, memberResult, runResult] = await Promise.all([
    params.client.from("canonical_teaching_dictionary_base_word_families").select("id, base_family_key, micro_skill_key, row_status, review_status").in("micro_skill_key", BASE_WORD_PILOT_MICRO_SKILLS),
    params.client.from("canonical_teaching_dictionary_base_word_family_members").select("base_word_family_id, canonical_word_id, member_role, assignment_eligible, row_status, review_status"),
    params.client.from("adle_base_word_family_pilot_runs").select("id", { count: "exact", head: true }).eq("child_id", params.childId).neq("run_status", "cancelled"),
  ]);
  if (familyResult.error || memberResult.error || runResult.error) throw new Error(`loadBaseWordFamilyPilotReadiness: ${familyResult.error?.message ?? memberResult.error?.message ?? runResult.error?.message}`);
  const familyRows = (familyResult.data ?? []) as FamilyRow[];
  const keyById = new Map(familyRows.map((row) => [row.id, row.base_family_key]));
  const families: BaseWordFamilyFact[] = familyRows.map((row) => ({ baseFamilyKey: row.base_family_key, microSkillKey: row.micro_skill_key, rowStatus: row.row_status, reviewStatus: row.review_status }));
  const members: BaseWordFamilyMemberFact[] = ((memberResult.data ?? []) as MemberRow[])
    .flatMap((row) => {
      const baseFamilyKey = keyById.get(row.base_word_family_id);
      return baseFamilyKey ? [{ baseFamilyKey, canonicalWordId: row.canonical_word_id, memberRole: row.member_role, assignmentEligible: row.assignment_eligible, complexityLevel: null, rowStatus: row.row_status, reviewStatus: row.review_status }] : [];
    });
  const candidates = BASE_WORD_PILOT_MICRO_SKILLS.map((microSkillKey) => ({ microSkillKey, selection: selectBaseWordFamilyLesson(params.childId, microSkillKey, { learningItems: facts.learningItems, families, members }) }))
    .filter((candidate) => candidate.selection.skipReasons.length === 0);
  const candidate = candidates[0];
  if (!candidate) {
    const reasons = BASE_WORD_PILOT_MICRO_SKILLS.map((microSkillKey) => selectBaseWordFamilyLesson(params.childId, microSkillKey, { learningItems: facts.learningItems, families, members }).skipReasons.join(",")).filter(Boolean);
    return { payload: null, readinessReason: reasons.join(";") || "no_supported_base_word_skill_ready" };
  }
  const { microSkillKey, selection } = candidate;
  const pilotLessonNumber = (runResult.count ?? 0) + 1;
  const authenticTargets = selection.slots.filter((slot) => slot.provenance === "authentic_target").map((slot) => {
    const item = facts.learningItems.find((candidate) => candidate.learningItemId === slot.learningItemId);
    return item ? { canonicalWordId: slot.canonicalWordId, learningItemId: item.learningItemId, sourceRef: item.sourceRef } : null;
  });
  if (authenticTargets.some((target) => target === null)) return { payload: null, readinessReason: "authentic_target_provenance_missing" };
  const readModel = await loadBaseWordFamilyLessonReadModel(params.client, {
    microSkillKey, contentVersion: BASE_WORD_PILOT_CONTENT_VERSION,
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
  const { data, error } = await params.client.rpc("complete_adle_base_word_family_pilot_v1", {
    p_parent_user_id: params.parentUserId, p_child_id: params.childId, p_assignment_id: params.assignmentId,
    p_plan_date: params.planDate, p_micro_skill_key: params.microSkillKey, p_source_ref: params.sourceRef,
    p_assignment_item_ids: params.assignmentItemIds, p_attempts: params.attempts, p_lesson: { ...params.lesson, reflection: params.reflection },
    p_transfer_misses: params.transferMisses,
  });
  if (error) throw new Error(`persistBaseWordFamilyPilotCompletion: ${error.message}`);
  if (!data || typeof data !== "object" || !["completed", "already_completed"].includes(String((data as { status?: unknown }).status))) throw new Error("persistBaseWordFamilyPilotCompletion: invalid RPC response");
  return data as { status: "completed" | "already_completed" };
}
