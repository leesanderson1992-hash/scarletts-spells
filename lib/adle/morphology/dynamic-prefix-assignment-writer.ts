import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeDailyPlan, type ComposedDailyPlan } from "../daily-assignment-composer";
import { getExistingAdleSessionPlanId, persistComposedAdleDailyPlan } from "../loaders/daily-plan-surface";
import { loadDailyPlanFacts } from "../loaders/composer-facts-loader";
import {
  buildDynamicPrefixAssignmentPlan,
  validateDynamicPrefixAssignmentPlanAgainstSharedLesson,
} from "./dynamic-prefix-assignment-plan";
import {
  canPersistDynamicPrefixCompilerDecision,
  compileDynamicPrefixWordLabDecision,
  emitDynamicPrefixCompilerDecision,
} from "./dynamic-prefix-compiler-rollout";
import { loadDynamicPrefixProfiles } from "./dynamic-prefix-profile-loader";
import { selectDynamicPrefixWordLab } from "./dynamic-prefix-word-lab";

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const DYNAMIC_PREFIX_QA_PROFILE_ORDER = [
  "D4_MOR_PREFIXES_UN",
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
] as const;

export type DynamicPrefixQaProfileKey = (typeof DYNAMIC_PREFIX_QA_PROFILE_ORDER)[number];

export type DynamicPrefixAssignmentResult = {
  status: "created" | "existing" | "conflict" | "not_ready";
  profileKey: string;
  planDate: string;
  assignmentId: string | null;
  existingProfileKey: string | null;
  itemCount: number | null;
  reason: string | null;
};

export type PreparedDynamicPrefixAssignment =
  | {
      status: "ready";
      profileKey: string;
      planDate: string;
      plan: ComposedDailyPlan;
      itemCount: number;
    }
  | Exclude<DynamicPrefixAssignmentResult, { status: "created" }>;

type WriterParams = {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  parentUserId: string;
  childId: string;
  planDate: string;
  requiredProfileKey?: DynamicPrefixQaProfileKey;
  allowStagingProfiles: boolean;
};

async function existingProfileKey(
  serviceClient: SupabaseClient,
  assignmentId: string,
): Promise<string | null> {
  const { data, error } = await serviceClient
    .from("assignment_items")
    .select("metadata")
    .eq("daily_assignment_id", assignmentId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`dynamicPrefixAssignmentWriter:existingProfile: ${error.message}`);
  const metadata = data?.metadata;
  return metadata && typeof metadata === "object" && typeof metadata.microSkillKey === "string"
    ? metadata.microSkillKey
    : null;
}

export async function prepareDynamicPrefixAssignment(
  params: WriterParams,
): Promise<PreparedDynamicPrefixAssignment> {
  const profileKey = params.requiredProfileKey ?? "dynamic_selector";
  if (!ISO_DATE_ONLY.test(params.planDate)) {
    return {
      status: "not_ready",
      profileKey,
      planDate: params.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: "invalid_plan_date",
    };
  }
  const existingId = await getExistingAdleSessionPlanId({
    userClient: params.userClient,
    parentUserId: params.parentUserId,
    childId: params.childId,
    planDate: params.planDate,
  });
  if (existingId) {
    const existingProfile = await existingProfileKey(params.serviceClient, existingId);
    return {
      status: params.requiredProfileKey && existingProfile === params.requiredProfileKey
        ? "existing"
        : "conflict",
      profileKey,
      planDate: params.planDate,
      assignmentId: existingId,
      existingProfileKey: existingProfile,
      itemCount: null,
      reason: existingProfile === params.requiredProfileKey
        ? null
        : "date_has_another_adle_assignment",
    };
  }
  const loaded = await loadDynamicPrefixProfiles(params.serviceClient, params.childId, {
    allowStagingProfiles: params.allowStagingProfiles,
  });
  const selectableFacts = params.requiredProfileKey
    ? {
        profiles: loaded.profiles.filter((profile) =>
          profile.microSkillKey === params.requiredProfileKey,
        ),
        learningItems: loaded.learningItems.filter((item) =>
          item.microSkillKey === params.requiredProfileKey,
        ),
      }
    : loaded;
  const selection = selectDynamicPrefixWordLab(selectableFacts);
  if (!selection || (params.requiredProfileKey && selection.profile.microSkillKey !== params.requiredProfileKey)) {
    return {
      status: "not_ready",
      profileKey,
      planDate: params.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: "profile_or_authentic_queue_not_ready",
    };
  }
  const compilerDecision = compileDynamicPrefixWordLabDecision(selection, {
    sourceKind: "teaching_dictionary",
  });
  if (!compilerDecision.ok) {
    emitDynamicPrefixCompilerDecision(compilerDecision);
    return {
      status: "not_ready",
      profileKey: selection.profile.microSkillKey,
      planDate: params.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: compilerDecision.blockerCode ?? "compiler_blocked",
    };
  }
  const { facts } = await loadDailyPlanFacts(params.serviceClient, {
    childId: params.childId,
    today: params.planDate,
  });
  const plan = buildDynamicPrefixAssignmentPlan({
    basePlan: composeDailyPlan(facts, params.planDate),
    facts,
    selection,
    payload: compilerDecision.payload,
  });
  const planValidation = compilerDecision.sharedLesson
    ? validateDynamicPrefixAssignmentPlanAgainstSharedLesson({
        plan,
        payload: compilerDecision.payload,
        lesson: compilerDecision.sharedLesson,
      })
    : { ok: true as const };
  const planBlockerCode = planValidation.ok ? undefined : planValidation.blockerCode;
  if (!canPersistDynamicPrefixCompilerDecision(compilerDecision, planBlockerCode)) {
    emitDynamicPrefixCompilerDecision(compilerDecision, {
      blockerCode: planBlockerCode ?? "assignment_plan_mismatch",
      parity: "mismatched",
    });
    return {
      status: "not_ready",
      profileKey: selection.profile.microSkillKey,
      planDate: params.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: planBlockerCode ?? "assignment_plan_mismatch",
    };
  }
  emitDynamicPrefixCompilerDecision(
    compilerDecision,
    planBlockerCode ? { blockerCode: planBlockerCode, parity: "mismatched" } : {},
  );
  return {
    status: "ready",
    profileKey: selection.profile.microSkillKey,
    planDate: params.planDate,
    plan,
    itemCount: plan.partTwo.sections.flatMap((section) => section.items).length,
  };
}

export async function persistPreparedDynamicPrefixAssignment(params: WriterParams & {
  prepared: Extract<PreparedDynamicPrefixAssignment, { status: "ready" }>;
}): Promise<DynamicPrefixAssignmentResult> {
  const assignmentId = await persistComposedAdleDailyPlan({
    userClient: params.userClient,
    serviceClient: params.serviceClient,
    parentUserId: params.parentUserId,
    childId: params.childId,
    planDate: params.prepared.planDate,
    plan: params.prepared.plan,
  });
  if (!assignmentId) {
    return {
      status: "not_ready",
      profileKey: params.prepared.profileKey,
      planDate: params.prepared.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: "persistence_returned_no_assignment",
    };
  }
  return {
    status: "created",
    profileKey: params.prepared.profileKey,
    planDate: params.prepared.planDate,
    assignmentId,
    existingProfileKey: null,
    itemCount: params.prepared.itemCount,
    reason: null,
  };
}

export async function createDynamicPrefixAssignment(
  params: WriterParams,
): Promise<DynamicPrefixAssignmentResult> {
  const prepared = await prepareDynamicPrefixAssignment(params);
  if (prepared.status !== "ready") return prepared;
  return persistPreparedDynamicPrefixAssignment({ ...params, prepared });
}
