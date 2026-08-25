import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { planAssignmentPersistence } from "../assignment-persistence";
import { selectPartTwoSkill } from "../composer-skill-selection";
import { composeDailyPlan } from "../daily-assignment-composer";
import {
  authorCompleteGenericSnapshotV3,
} from "../composable-lesson/generic-snapshot-v3-forward-authoring";
import { compileGenericLessonSnapshotV3 } from "../composable-lesson/generic-snapshot-v3-compiler";
import {
  compileDynamicAffixSpecialistSnapshotV3,
} from "../composable-lesson/specialist-snapshot-v3-compiler";
import {
  compileBaseWordSpecialistSnapshotV3,
  compileDynamicPrefixSpecialistSnapshotV3,
} from "../composable-lesson/specialist-snapshot-v3-prefix-base-compiler";
import { compileCompoundWordSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-compiler";
import { loadDailyPlanFacts } from "../loaders/composer-facts-loader";
import { loadBaseWordFamilyPilotReadiness } from "../loaders/base-word-family-pilot-loader";
import { loadCompoundWordAssignmentReadiness } from "../loaders/compound-word-assignment-loader";
import {
  prepareDynamicAffixAssignment,
} from "../morphology/dynamic-affix-assignment-writer";
import {
  prepareDynamicPrefixAssignment,
  type DynamicPrefixQaProfileKey,
} from "../morphology/dynamic-prefix-assignment-writer";
import { resolveDynamicAffixLessonAuthorityV3 } from "../morphology/dynamic-affix-runtime";
import { resolveDynamicPrefixLessonAuthorityV2 } from "../morphology/dynamic-prefix-runtime";
import { resolveBaseWordFamilyLessonAuthorityV2 } from "../morphology/resolved-base-word-family-lesson-v2";
import { resolveCompoundWordFirstImpressionConfig } from "../morphology/resolved-compound-word-lesson-v2";
import { buildBaseWordFamilyPilotItems } from "../morphology/base-word-family-pilot-plan";
import { createPersistedRouteMetadataV2 } from "../composable-lesson/persisted-route-metadata";
import { persistedReleaseAuthority } from "../curriculum-release-activation";
import { persistedCompoundWordReleaseAuthority } from "../morphology/compound-word-release-loader";
import { buildCompoundWordAssignmentPlanV2 } from "../morphology/compound-word-assignment-plan-v2";
import { resolveParentManualAdleRoute } from "../today-assignment-service";
import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import type { LearningItemFact } from "../learning-items";
import type { IsoDate } from "../review-scheduler";
import { validateCompiledSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-validator";

type Client = SupabaseClient;

export type EnsureSpecialistStageR6Result =
  | { outcome: "ready"; assignmentId: string }
  | { outcome: "not_due"; assignmentId: string }
  | { outcome: "blocked"; assignmentId: string; blockerCode: string };

function persistenceFor(input: {
  plan: ReturnType<typeof composeDailyPlan>;
  parentUserId: string;
}) {
  const persistence = planAssignmentPersistence(input.plan, {
    parentUserId: input.parentUserId,
    existingHeaders: [],
    generationTrigger: "parent_manual",
  });
  if (persistence.action !== "insert" || !persistence.header || persistence.items.length === 0) {
    throw new Error("r6_specialist_persistence_plan_invalid");
  }
  return persistence as typeof persistence & {
    action: "insert";
    header: NonNullable<typeof persistence.header>;
  };
}

async function append(input: {
  client: Client;
  assignmentId: string;
  snapshot: unknown;
  items: readonly AssignmentItemDraft[];
  learningItemIntakes?: readonly LearningItemFact[];
  lessonRouteMetadata: unknown;
}): Promise<EnsureSpecialistStageR6Result> {
  const validation = validateCompiledSpecialistSnapshotV3(input.snapshot);
  if (!validation.ok && (input.snapshot as { route?: { routeId?: string } })?.route?.routeId !== "generic_composer") {
    return {
      outcome: "blocked",
      assignmentId: input.assignmentId,
      blockerCode: validation.blockers.map((entry) => entry.code).join(","),
    };
  }
  const result = await input.client.rpc("append_adle_specialist_stage_r6", {
    p_daily_assignment_id: input.assignmentId,
    p_snapshot: input.snapshot,
    p_items: input.items,
    p_intakes: input.learningItemIntakes ?? [],
    p_lesson_route_metadata: input.lessonRouteMetadata,
  });
  if (result.error) throw new Error(`appendAdleSpecialistStageR6: ${result.error.message}`);
  return { outcome: "ready", assignmentId: input.assignmentId };
}

async function ensureSpecialistStageR6Internal(input: {
  userClient: Client;
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  assignmentId: string;
  assignmentDate: string;
}): Promise<EnsureSpecialistStageR6Result> {
  const existing = await input.serviceClient.from("daily_assignments")
    .select("compiled_lesson_snapshot")
    .eq("id", input.assignmentId)
    .eq("child_id", input.childId)
    .eq("parent_user_id", input.parentUserId)
    .maybeSingle();
  if (existing.error || !existing.data) throw new Error("r6_specialist_assignment_not_found");
  if (existing.data.compiled_lesson_snapshot !== null) {
    return { outcome: "ready", assignmentId: input.assignmentId };
  }
  const { facts } = await loadDailyPlanFacts(input.serviceClient, {
    childId: input.childId,
    today: input.assignmentDate as IsoDate,
  });
  const selection = selectPartTwoSkill({
    learningItems: facts.learningItems.filter((item) => item.childId === input.childId),
    skillFamilyKeyBySkill: facts.skillFamilyKeyBySkill,
    prerequisiteKeysBySkill: facts.prerequisiteKeysBySkill,
    notYetSecureSkillKeys: facts.notYetSecureSkillKeys,
    frequencyBandByWordId: facts.frequencyBandByWordId,
    previousLessonFamilyKey: facts.previousLessonFamilyKey,
  });
  if (!selection.microSkillKey) {
    const completed = await input.serviceClient.rpc("complete_adle_review_only_session_r6", {
      p_daily_assignment_id: input.assignmentId,
    });
    if (completed.error) throw new Error(`completeReviewOnlySessionR6: ${completed.error.message}`);
    return { outcome: "not_due", assignmentId: input.assignmentId };
  }

  const routeId = resolveParentManualAdleRoute(selection.microSkillKey);
  const allowStagingProfiles = process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging";
  if (routeId === "dynamic_prefix_word_lab") {
    const prepared = await prepareDynamicPrefixAssignment({
      userClient: input.userClient,
      serviceClient: input.serviceClient,
      parentUserId: input.parentUserId,
      childId: input.childId,
      planDate: input.assignmentDate,
      requiredProfileKey: selection.microSkillKey as DynamicPrefixQaProfileKey,
      allowStagingProfiles,
      generationTrigger: "parent_manual",
      r6AppendAssignmentId: input.assignmentId,
    });
    if (prepared.status !== "ready") return {
      outcome: "blocked", assignmentId: input.assignmentId,
      blockerCode: prepared.reason ?? prepared.status,
    };
    const persistence = persistenceFor({ plan: prepared.plan, parentUserId: input.parentUserId });
    const resolved = resolveDynamicPrefixLessonAuthorityV2(prepared.payload);
    if (!resolved) return { outcome: "blocked", assignmentId: input.assignmentId, blockerCode: "dynamic_prefix_authority_invalid" };
    const snapshot = compileDynamicPrefixSpecialistSnapshotV3({
      payload: resolved,
      selection: prepared.selection,
      compilerDecision: prepared.compilerDecision,
      header: persistence.header,
      items: persistence.items,
    });
    return append({ client: input.serviceClient, assignmentId: input.assignmentId, snapshot,
      items: persistence.items, learningItemIntakes: persistence.learningItemIntakes,
      lessonRouteMetadata: persistence.header.lessonRouteMetadata });
  }
  if (routeId === "dynamic_affix_word_lab") {
    const prepared = await prepareDynamicAffixAssignment({
      userClient: input.userClient,
      serviceClient: input.serviceClient,
      parentUserId: input.parentUserId,
      childId: input.childId,
      planDate: input.assignmentDate,
      requiredProfileKey: selection.microSkillKey,
      allowStagingProfiles,
      generationTrigger: "parent_manual",
      r6AppendAssignmentId: input.assignmentId,
    });
    if (prepared.status !== "ready") return {
      outcome: "blocked", assignmentId: input.assignmentId,
      blockerCode: prepared.reason ?? prepared.status,
    };
    const persistence = persistenceFor({ plan: prepared.plan, parentUserId: input.parentUserId });
    const resolved = resolveDynamicAffixLessonAuthorityV3(prepared.payload);
    if (!resolved) return { outcome: "blocked", assignmentId: input.assignmentId, blockerCode: "dynamic_affix_authority_invalid" };
    const snapshot = compileDynamicAffixSpecialistSnapshotV3({
      payload: resolved, selection: prepared.selection,
      compilerDecision: prepared.compilerDecision,
      header: persistence.header, items: persistence.items,
    });
    return append({ client: input.serviceClient, assignmentId: input.assignmentId, snapshot,
      items: persistence.items, learningItemIntakes: persistence.learningItemIntakes,
      lessonRouteMetadata: persistence.header.lessonRouteMetadata });
  }
  if (routeId === "base_word_lab") {
    const readiness = await loadBaseWordFamilyPilotReadiness({
      client: input.serviceClient, childId: input.childId,
      planDate: input.assignmentDate, requiredMicroSkillKey: selection.microSkillKey,
    });
    if (!readiness.payload || !readiness.releaseAuthority) return {
      outcome: "blocked", assignmentId: input.assignmentId,
      blockerCode: readiness.readinessReason ?? "base_word_not_ready",
    };
    const rawItems = buildBaseWordFamilyPilotItems({
      payload: readiness.payload, parentUserId: input.parentUserId,
      childId: input.childId, planDate: input.assignmentDate,
      generationTrigger: "parent_manual",
    });
    const routeMetadata = createPersistedRouteMetadataV2("base_word_lab", persistedReleaseAuthority(readiness.releaseAuthority));
    const header: AssignmentHeaderDraft = {
      childId: input.childId, parentUserId: input.parentUserId,
      assignmentDate: input.assignmentDate as IsoDate,
      title: "ADLE Daily Plan", status: "pending",
      targetWords: readiness.payload.independentWords.map((word) => word.displayWord),
      reviewWords: [], assignmentGenerationSource: "adle_composer_v1",
      lessonRouteMetadata: routeMetadata,
    };
    const items: AssignmentItemDraft[] = rawItems.map((item) => ({
      ...item, status: "ready" as const,
      metadata: {
        planDate: input.assignmentDate as IsoDate,
        sectionKey: String(item.metadata.sectionKey), provenance: "base_word_family_release_v2",
        microSkillKey: readiness.payload!.microSkillKey,
        canonicalWordId: typeof item.metadata.canonicalWordId === "string" ? item.metadata.canonicalWordId : null,
        expectedEvidenceKind: item.metadata.sectionKey === "lesson_dictation" ? "dictation" : item.metadata.sectionKey === "lesson_production" ? "controlled_spelling" : "guided_task",
        adleLearningItemRef: typeof item.metadata.learningItemId === "string" ? item.metadata.learningItemId : null,
        composerPolicyVersion: "base_word_family_v1", schedulePolicyVersion: "base_word_family_v1",
      },
    }));
    const resolved = resolveBaseWordFamilyLessonAuthorityV2(readiness.payload);
    if (!resolved) return { outcome: "blocked", assignmentId: input.assignmentId, blockerCode: "base_word_authority_invalid" };
    const snapshot = compileBaseWordSpecialistSnapshotV3({
      payload: resolved, releaseAuthority: readiness.releaseAuthority, header, items,
    });
    return append({ client: input.serviceClient, assignmentId: input.assignmentId, snapshot,
      items, lessonRouteMetadata: routeMetadata });
  }
  if (routeId === "compound_word_lab") {
    const readiness = await loadCompoundWordAssignmentReadiness({
      client: input.serviceClient, childId: input.childId,
      planDate: input.assignmentDate,
      microSkillKey: selection.microSkillKey as Parameters<typeof loadCompoundWordAssignmentReadiness>[0]["microSkillKey"],
    });
    if (!readiness.payload || !readiness.releaseAuthority) return {
      outcome: "blocked", assignmentId: input.assignmentId,
      blockerCode: readiness.readinessReason ?? "compound_word_not_ready",
    };
    const plan = buildCompoundWordAssignmentPlanV2(
      composeDailyPlan(facts, input.assignmentDate as IsoDate),
      readiness.payload,
      createPersistedRouteMetadataV2("compound_word_lab", persistedCompoundWordReleaseAuthority(readiness.releaseAuthority)),
    );
    const persistence = persistenceFor({ plan, parentUserId: input.parentUserId });
    const resolved = resolveCompoundWordFirstImpressionConfig(readiness.payload);
    if (!resolved) return { outcome: "blocked", assignmentId: input.assignmentId, blockerCode: "compound_word_authority_invalid" };
    const snapshot = compileCompoundWordSpecialistSnapshotV3({
      payload: resolved, releaseAuthority: readiness.releaseAuthority,
      header: persistence.header, items: persistence.items,
    });
    return append({ client: input.serviceClient, assignmentId: input.assignmentId, snapshot,
      items: persistence.items, learningItemIntakes: persistence.learningItemIntakes,
      lessonRouteMetadata: persistence.header.lessonRouteMetadata });
  }
  if (routeId !== null) return {
    outcome: "blocked", assignmentId: input.assignmentId,
    blockerCode: `r6_specialist_adapter_missing:${routeId}`,
  };

  const composed = composeDailyPlan(facts, input.assignmentDate as IsoDate);
  const lessonOnly = {
    ...composed,
    partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] },
  };
  const authored = authorCompleteGenericSnapshotV3(facts, lessonOnly);
  if (!authored.ok) return {
    outcome: "blocked", assignmentId: input.assignmentId, blockerCode: authored.blockerCode,
  };
  const persistence = persistenceFor({ plan: authored.plan, parentUserId: input.parentUserId });
  const compiled = compileGenericLessonSnapshotV3({
    facts, plan: authored.plan, persistence,
  });
  if (!compiled.ok) return {
    outcome: "blocked", assignmentId: input.assignmentId,
    blockerCode: compiled.blockers.map((entry) => entry.code).join(","),
  };
  return append({ client: input.serviceClient, assignmentId: input.assignmentId,
    snapshot: compiled.snapshot, items: persistence.items,
    learningItemIntakes: persistence.learningItemIntakes,
    lessonRouteMetadata: persistence.header.lessonRouteMetadata });
}

export async function ensureSpecialistStageR6(input: {
  userClient: Client;
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  assignmentId: string;
  assignmentDate: string;
}): Promise<EnsureSpecialistStageR6Result> {
  const retry = await input.serviceClient.rpc("retry_adle_specialist_generation_r6", {
    p_daily_assignment_id: input.assignmentId,
  });
  if (retry.error) throw new Error(`retryAdleSpecialistGenerationR6: ${retry.error.message}`);
  let result: EnsureSpecialistStageR6Result;
  try {
    result = await ensureSpecialistStageR6Internal(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    result = {
      outcome: "blocked",
      assignmentId: input.assignmentId,
      blockerCode: `specialist_generation_error:${detail}`.slice(0, 240),
    };
  }
  if (result.outcome === "blocked") {
    const blocked = await input.serviceClient.rpc("block_adle_specialist_generation_r6", {
      p_daily_assignment_id: input.assignmentId,
      p_blocker_code: result.blockerCode,
    });
    if (blocked.error) throw new Error(`blockAdleSpecialistGenerationR6: ${blocked.error.message}`);
  }
  return result;
}
