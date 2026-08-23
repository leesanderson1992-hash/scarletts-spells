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
import { resolveAdleRouteActivationEnvironment } from "../route-activation-environment";
import { createPersistedRouteMetadataV2 } from "../composable-lesson/persisted-route-metadata";
import {
  loadEnabledBaseWordReleaseAuthorities,
} from "./curriculum-release-authority";
import {
  baseWordFamilyMemberAppliesToMicroSkill,
  baseWordFamilyMemberStructuralRole,
  persistedReleaseAuthority,
  type ActivatedBaseWordReleaseAuthority,
} from "../curriculum-release-activation";
import { getCurriculumRouteDefinition } from "../curriculum-readiness/route-registry";
import { configuredSpecialistSnapshotV3Writer } from "../composable-lesson/specialist-snapshot-writer-rollout";
import { compileBaseWordSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-prefix-base-compiler";
import { persistSpecialistSnapshotV3, supabaseSpecialistSnapshotV3PersistencePort } from "../composable-lesson/specialist-snapshot-v3-persistence";
import { resolveBaseWordFamilyLessonAuthorityV2 } from "../morphology/resolved-base-word-family-lesson-v2";
import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";

/** Current fixed 2-authentic/4-transfer/18-binding recipe support. Route
 * ownership is broader and derives from the canonical Base Word cluster. */
export const BASE_WORD_PILOT_MICRO_SKILLS = getCurriculumRouteDefinition("base_word_lab", "v2")
  ?.supportedMicroSkillKeys ?? [];
/**
 * Loads only existing verified learning items and reviewed curriculum data.
 * It never creates a substitute target or turns a raw attempt into a lesson.
 */
export async function loadBaseWordFamilyPilotReadiness(params: {
  client: SupabaseClient;
  childId: string;
  planDate: string;
  requiredMicroSkillKey?: string;
}): Promise<{
  payload: BaseWordFamilyLessonSnapshotV1 | null;
  releaseAuthority: ActivatedBaseWordReleaseAuthority | null;
  readinessReason: string | null;
}> {
  const activationEnvironment = resolveAdleRouteActivationEnvironment();
  if (!activationEnvironment) {
    return { payload: null, releaseAuthority: null, readinessReason: "adle_route_activation_environment_not_configured" };
  }
  const enabledActivations = await loadEnabledBaseWordReleaseAuthorities({
    client: params.client,
    microSkillKeys: BASE_WORD_PILOT_MICRO_SKILLS,
    environmentKey: activationEnvironment,
  }).then((activations) => activations.filter(
    (activation) =>
      !params.requiredMicroSkillKey || activation.microSkillKey === params.requiredMicroSkillKey,
  ));
  if (enabledActivations.length === 0)
    return { payload: null, releaseAuthority: null, readinessReason: "adle_route_not_production_enabled" };
  const { facts } = await loadDailyPlanFacts(params.client, { childId: params.childId, today: params.planDate as import("../review-scheduler").IsoDate });
  const { count: runCount, error: runError } = await params.client.from("adle_base_word_family_pilot_runs").select("id", { count: "exact", head: true }).eq("child_id", params.childId).neq("run_status", "cancelled");
  if (runError) throw new Error(`loadBaseWordFamilyPilotReadiness: ${runError.message}`);
  const candidates: Array<{ activation: ActivatedBaseWordReleaseAuthority; microSkillKey: string; selection: ReturnType<typeof selectBaseWordFamilyLesson> }> = [];
  const reasons: string[] = [];
  for (const activation of enabledActivations) {
    const closureWordIds = new Set(activation.dictionaryWords.map((word) => word.canonicalWordId));
    const families: BaseWordFamilyFact[] = activation.family.families.map((family) => ({
      baseFamilyKey: family.baseFamilyKey,
      microSkillKey: activation.microSkillKey,
      rowStatus: "active",
      reviewStatus: "approved_for_first_exposure",
    }));
    const members: BaseWordFamilyMemberFact[] = activation.family.families.flatMap((family) =>
      family.members.map((member) => ({
        baseFamilyKey: family.baseFamilyKey,
        canonicalWordId: member.canonicalWordId,
        memberRole: baseWordFamilyMemberStructuralRole(member) === "base" ? "base" as const : "transfer" as const,
        applicableMicroSkillKeys: activation.family.schemaVersion === 2 && "applicableMicroSkillKeys" in member
          ? member.applicableMicroSkillKeys
          : [activation.microSkillKey],
        authenticSelectionEligible: activation.family.schemaVersion === 2
          ? baseWordFamilyMemberAppliesToMicroSkill(activation.family, member, activation.microSkillKey)
          : "memberRole" in member && member.memberRole === "authentic_target",
        lessonContentEligible: closureWordIds.has(member.canonicalWordId),
        assignmentEligible: member.assignmentEligible,
        complexityLevel: member.complexityLevel,
        rowStatus: "active" as const,
        reviewStatus: "approved_for_first_exposure" as const,
      })),
    );
    const selection = selectBaseWordFamilyLesson(params.childId, activation.microSkillKey, { familyAuthoritySchemaVersion: activation.family.schemaVersion, learningItems: facts.learningItems, families, members });
    if (selection.skipReasons.length === 0 && selection.baseFamilyKeys.length === 2)
      candidates.push({ activation, microSkillKey: activation.microSkillKey, selection });
    else reasons.push(selection.skipReasons.join(","));
  }
  const candidate = candidates[0];
  if (!candidate) {
    return { payload: null, releaseAuthority: null, readinessReason: reasons.join(";") || "no_supported_base_word_skill_ready" };
  }
  const { activation, microSkillKey, selection } = candidate;
  const pilotLessonNumber = (runCount ?? 0) + 1;
  const authenticTargets = selection.slots.filter((slot) => slot.assignmentRole === "primary_authentic_target").map((slot) => {
    const item = facts.learningItems.find((candidate) => candidate.learningItemId === slot.learningItemId);
    return item ? { canonicalWordId: slot.canonicalWordId, learningItemId: item.learningItemId, sourceRef: item.sourceRef } : null;
  });
  if (authenticTargets.some((target) => target === null)) return { payload: null, releaseAuthority: null, readinessReason: "authentic_target_provenance_missing" };
  const readModel = await loadBaseWordFamilyLessonReadModel(params.client, {
    microSkillKey, contentVersion: activation.teachingContent.contentVersion,
    releaseAuthority: activation,
    authenticTargets: authenticTargets as NonNullable<(typeof authenticTargets)[number]>[],
    sections: selection.guidedFamilySections.map((section) => ({ baseFamilyKey: section.baseFamilyKey, authenticTargetWordIds: [...section.authenticTargetWordIds], guidedWordIds: [...section.guidedWordIds] })),
    independentSlots: selection.slots.map(({ canonicalWordId, provenance, assignmentRole, learnerProvenance, baseFamilyKey, learningItemId }) => ({ canonicalWordId, provenance, assignmentRole, learnerProvenance, baseFamilyKey, learningItemId })),
    pilotLessonNumber,
  });
  if (!readModel) return { payload: null, releaseAuthority: null, readinessReason: "reviewed_family_read_model_unavailable" };
  return { payload: compileBaseWordFamilyLessonSnapshot(readModel), releaseAuthority: activation, readinessReason: null };
}

/** Service-only, explicit persistence. Caller must check the gate and genuine readiness first. */
export async function persistBaseWordFamilyPilotAssignment(params: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
  planDate: string;
  payload: BaseWordFamilyLessonSnapshotV1;
  releaseAuthority: ActivatedBaseWordReleaseAuthority;
  generationTrigger?: "parent_manual" | "automatic_scheduler";
}): Promise<string> {
  const payload = validateBaseWordFamilyLessonSnapshot(params.payload);
  if (!payload) throw new Error("Refusing base-word pilot persistence: malformed reviewed snapshot.");
  const items = buildBaseWordFamilyPilotItems({
    payload,
    parentUserId: params.parentUserId,
    childId: params.childId,
    planDate: params.planDate,
    generationTrigger: params.generationTrigger,
  });
  if (items.length !== BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT) throw new Error("Refusing base-word pilot persistence: assignment binding count drift.");
  const authorization = configuredSpecialistSnapshotV3Writer(params.childId, "base_word_lab:v2");
  if (authorization) {
    const routeMetadata = createPersistedRouteMetadataV2("base_word_lab", persistedReleaseAuthority(params.releaseAuthority));
    const header: AssignmentHeaderDraft = {
      childId: params.childId, parentUserId: params.parentUserId, assignmentDate: params.planDate as import("../review-scheduler").IsoDate,
      title: "ADLE Base-word Family Pilot", status: "pending", targetWords: payload.independentWords.map((word) => word.displayWord), reviewWords: [],
      assignmentGenerationSource: "adle_base_word_family_pilot_v1", lessonRouteMetadata: routeMetadata,
    };
    const snapshotItems: AssignmentItemDraft[] = items.map((item) => ({
      ...item, status: "ready" as const,
      metadata: {
        planDate: params.planDate as import("../review-scheduler").IsoDate,
        sectionKey: String(item.metadata.sectionKey), provenance: "base_word_family_release_v2",
        microSkillKey: payload.microSkillKey, canonicalWordId: typeof item.metadata.canonicalWordId === "string" ? item.metadata.canonicalWordId : null,
        expectedEvidenceKind: item.metadata.sectionKey === "lesson_dictation" ? "dictation" : item.metadata.sectionKey === "lesson_production" ? "controlled_spelling" : "guided_task",
        adleLearningItemRef: typeof item.metadata.learningItemId === "string" ? item.metadata.learningItemId : null,
        composerPolicyVersion: "base_word_family_v1", schedulePolicyVersion: "base_word_family_v1",
      },
    }));
    const resolved = resolveBaseWordFamilyLessonAuthorityV2(payload);
    if (!resolved) throw new Error("Refusing base-word specialist snapshot: resolved lesson invalid.");
    const snapshot = compileBaseWordSpecialistSnapshotV3({ payload: resolved, releaseAuthority: params.releaseAuthority, header, items: snapshotItems });
    return persistSpecialistSnapshotV3(supabaseSpecialistSnapshotV3PersistencePort(params.client), {
      authorization, parentUserId: params.parentUserId, childId: params.childId, planDate: params.planDate,
      header, items: snapshotItems, intakes: [], snapshot,
    });
  }
  const { data, error } = await params.client.rpc("persist_adle_base_word_family_pilot_v2", {
    p_parent_user_id: params.parentUserId, p_child_id: params.childId, p_plan_date: params.planDate, p_payload: payload, p_items: items,
    p_route_metadata: createPersistedRouteMetadataV2(
      "base_word_lab",
      persistedReleaseAuthority(params.releaseAuthority),
    ),
    p_activation_revision_id: params.releaseAuthority.activationRevisionId,
    p_release_manifest_id: params.releaseAuthority.releaseManifestId,
    p_release_manifest_sha256: params.releaseAuthority.releaseManifestSha256,
    p_dependency_fingerprint: params.releaseAuthority.dependencyFingerprint,
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
  requiredMicroSkillKey?: string;
  generationTrigger?: "parent_manual" | "automatic_scheduler";
}): Promise<{ assignmentId: string | null; readinessReason: string | null }> {
  assertBaseWordFamilyPilotEnabledForChild(params.childId);
  const readiness = await loadBaseWordFamilyPilotReadiness({
    client: params.client,
    childId: params.childId,
    planDate: params.planDate,
    requiredMicroSkillKey: params.requiredMicroSkillKey,
  });
  if (!readiness.payload || !readiness.releaseAuthority) return { assignmentId: null, readinessReason: readiness.readinessReason ?? "not_ready" };
  return {
    assignmentId: await persistBaseWordFamilyPilotAssignment({
      ...params,
      payload: readiness.payload,
      releaseAuthority: readiness.releaseAuthority,
    }),
    readinessReason: null,
  };
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
