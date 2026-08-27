import type { SupabaseClient } from "@supabase/supabase-js";

import { composeDailyPlan } from "../daily-assignment-composer";
import { createPersistedRouteMetadataV2 } from "../composable-lesson/persisted-route-metadata";
import { compileCompoundWordSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-compiler";
import {
  persistSpecialistSnapshotV3,
  supabaseSpecialistSnapshotV3PersistencePort,
} from "../composable-lesson/specialist-snapshot-v3-persistence";
import { buildCompoundWordAssignmentPlanV2 } from "../morphology/compound-word-assignment-plan-v2";
import {
  compileCompoundWordLessonV2,
  type CompoundWordLessonPayloadV2,
} from "../morphology/compound-word-lesson-v2";
import {
  loadActivatedCompoundWordReleaseV2,
  persistedCompoundWordReleaseAuthority,
  type ActivatedCompoundWordReleaseV2,
} from "../morphology/compound-word-release-loader";
import type { CompoundWordMicroSkillKey } from "../morphology/compound-word-structure-v2";
import { resolveCompoundWordFirstImpressionConfig } from "../morphology/resolved-compound-word-lesson-v2";
import { resolveAdleRouteActivationEnvironment } from "../route-activation-environment";
import type { IsoDate } from "../review-scheduler";
import { loadDailyPlanFacts } from "./composer-facts-loader";
import {
  findAdleHeader,
  prepareComposedAdleDailyPlanPersistence,
} from "./daily-plan-surface";

export async function loadCompoundWordAssignmentReadiness(params: {
  client: SupabaseClient;
  childId: string;
  planDate: string;
  microSkillKey: CompoundWordMicroSkillKey;
}): Promise<{
  payload: CompoundWordLessonPayloadV2 | null;
  releaseAuthority: ActivatedCompoundWordReleaseV2 | null;
  readinessReason: string | null;
}> {
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return {
    payload: null,
    releaseAuthority: null,
    readinessReason: "adle_route_activation_environment_not_configured",
  };
  const releaseAuthority = await loadActivatedCompoundWordReleaseV2({
    client: params.client,
    childId: params.childId,
    environmentKey: environment,
    microSkillKey: params.microSkillKey,
  });
  if (!releaseAuthority) return {
    payload: null,
    releaseAuthority: null,
    readinessReason: "compound_word_release_not_enabled_for_child",
  };
  const payload = compileCompoundWordLessonV2({
    recipe: releaseAuthority.recipe,
    structures: releaseAuthority.curriculum.structures,
    dictationByCanonicalId: releaseAuthority.curriculum.dictationByCanonicalId,
    learningItems: releaseAuthority.curriculum.learningItems,
    selectionSeed: `${params.childId}:${params.planDate}:${params.microSkillKey}`,
  });
  return payload
    ? { payload, releaseAuthority, readinessReason: null }
    : {
        payload: null,
        releaseAuthority,
        readinessReason: "compound_word_v2_payload_not_compilable",
      };
}

export async function persistCompoundWordAssignment(params: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  parentUserId: string;
  childId: string;
  planDate: string;
  payload: CompoundWordLessonPayloadV2;
  releaseAuthority: ActivatedCompoundWordReleaseV2;
  generationTrigger?: "parent_manual" | "automatic_scheduler";
}): Promise<string | null> {
  const { facts } = await loadDailyPlanFacts(params.serviceClient, {
    childId: params.childId,
    today: params.planDate as IsoDate,
  });
  const plan = buildCompoundWordAssignmentPlanV2(
    composeDailyPlan(facts, params.planDate as IsoDate),
    params.payload,
    createPersistedRouteMetadataV2(
      "compound_word_lab",
      persistedCompoundWordReleaseAuthority(params.releaseAuthority),
    ),
  );
  const persistence = await prepareComposedAdleDailyPlanPersistence({
    userClient: params.userClient,
    serviceClient: params.serviceClient,
    parentUserId: params.parentUserId,
    childId: params.childId,
    planDate: params.planDate as IsoDate,
    plan,
    generationTrigger: params.generationTrigger,
  });
  if (persistence.action === "noop") {
    return persistence.noopReason === "existing_active_plan"
      ? (await findAdleHeader(params.userClient, params.parentUserId, params.childId, params.planDate as IsoDate))?.id ?? null
      : null;
  }
  if (!persistence.header) return null;
  const resolvedLesson = resolveCompoundWordFirstImpressionConfig(params.payload);
  if (!resolvedLesson) throw new Error("persistCompoundWordAssignment:specialist_snapshot:resolved_lesson_invalid");
  const snapshot = compileCompoundWordSpecialistSnapshotV3({
    payload: resolvedLesson,
    releaseAuthority: params.releaseAuthority,
    header: persistence.header,
    items: persistence.items,
  });
  return persistSpecialistSnapshotV3(
    supabaseSpecialistSnapshotV3PersistencePort(params.serviceClient),
    {
      parentUserId: params.parentUserId,
      childId: params.childId,
      planDate: params.planDate,
      header: persistence.header,
      items: persistence.items,
      intakes: persistence.learningItemIntakes,
      snapshot,
    },
  );
}

export async function generateGuardedCompoundWordAssignment(params: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  parentUserId: string;
  childId: string;
  planDate: string;
  microSkillKey: CompoundWordMicroSkillKey;
  generationTrigger?: "parent_manual" | "automatic_scheduler";
}): Promise<{ assignmentId: string | null; readinessReason: string | null }> {
  const readiness = await loadCompoundWordAssignmentReadiness({
    client: params.serviceClient,
    childId: params.childId,
    planDate: params.planDate,
    microSkillKey: params.microSkillKey,
  });
  if (!readiness.payload || !readiness.releaseAuthority) return {
    assignmentId: null,
    readinessReason: readiness.readinessReason ?? "not_ready",
  };
  return {
    assignmentId: await persistCompoundWordAssignment({
      ...params,
      payload: readiness.payload,
      releaseAuthority: readiness.releaseAuthority,
    }),
    readinessReason: null,
  };
}
