import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeDailyPlan, type ComposedDailyPlan } from "../daily-assignment-composer";
import { getExistingAdleSessionPlanId, persistComposedAdleDailyPlan } from "../loaders/daily-plan-surface";
import { loadDailyPlanFacts } from "../loaders/composer-facts-loader";
import {
  buildDynamicAffixAssignmentPlan,
  validateDynamicAffixAssignmentPlanAgainstSharedLesson,
} from "./dynamic-affix-assignment-plan";
import {
  canPersistDynamicAffixCompilerDecision,
  compileDynamicAffixWordLabDecision,
  emitDynamicAffixCompilerDecision,
  type DynamicAffixCompilerDecision,
} from "./dynamic-affix-compiler-rollout";
import type { DynamicAffixLessonPayloadV3, DynamicAffixSelection } from "./affix-word-lab";
import { loadDynamicSuffixProfiles } from "./dynamic-suffix-profile-loader";
import { selectDynamicAffixWordLab } from "./affix-word-lab";

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type DynamicAffixAssignmentResult = {
  status: "created" | "existing" | "conflict" | "not_ready";
  profileKey: string;
  planDate: string;
  assignmentId: string | null;
  existingProfileKey: string | null;
  itemCount: number | null;
  reason: string | null;
};

export type PreparedDynamicAffixAssignment =
  | {
      status: "ready";
      profileKey: string;
      planDate: string;
      plan: ComposedDailyPlan;
      itemCount: number;
    }
  | Exclude<DynamicAffixAssignmentResult, { status: "created" }>;

export type DynamicAffixAssignmentPreview =
  | {
      status: "ready";
      profileKey: string;
      selection: DynamicAffixSelection;
      payload: DynamicAffixLessonPayloadV3;
      compilerDecision: Extract<DynamicAffixCompilerDecision, { ok: true }>;
    }
  | {
      status: "not_ready";
      profileKey: string;
      reason: string;
    };

type PreviewParams = {
  serviceClient: SupabaseClient;
  childId: string;
  requiredProfileKey?: string;
  allowStagingProfiles: boolean;
  purpose: "readiness_preview" | "writer";
};

type WriterParams = Omit<PreviewParams, "purpose"> & {
  userClient: SupabaseClient;
  parentUserId: string;
  planDate: string;
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
  if (error) throw new Error(`dynamicAffixAssignmentWriter:existingProfile: ${error.message}`);
  const metadata = data?.metadata;
  return metadata && typeof metadata === "object" && typeof metadata.microSkillKey === "string"
    ? metadata.microSkillKey
    : null;
}

export async function previewDynamicAffixAssignment(
  params: PreviewParams,
): Promise<DynamicAffixAssignmentPreview> {
  const loaded = await loadDynamicSuffixProfiles(params.serviceClient, params.childId, {
    allowStagingProfiles: params.allowStagingProfiles,
  });
  const selectable = params.requiredProfileKey
    ? {
        profiles: loaded.profiles.filter((profile) => profile.microSkillKey === params.requiredProfileKey),
        learningItems: loaded.learningItems.filter((item) => item.microSkillKey === params.requiredProfileKey),
      }
    : loaded;
  const selection = selectDynamicAffixWordLab(selectable);
  const fallbackProfileKey = params.requiredProfileKey ?? "dynamic_selector";
  if (!selection) {
    return {
      status: "not_ready",
      profileKey: fallbackProfileKey,
      reason: "profile_or_authentic_queue_not_ready",
    };
  }
  const compilerDecision = compileDynamicAffixWordLabDecision(selection, {
    sourceKind: "teaching_dictionary",
    purpose: params.purpose,
  });
  if (!compilerDecision.ok) {
    emitDynamicAffixCompilerDecision(compilerDecision, { purpose: params.purpose });
    return {
      status: "not_ready",
      profileKey: selection.profile.microSkillKey,
      reason: compilerDecision.blockerCode ?? "compiler_blocked",
    };
  }
  return {
    status: "ready",
    profileKey: selection.profile.microSkillKey,
    selection,
    payload: compilerDecision.payload,
    compilerDecision,
  };
}

export async function prepareDynamicAffixAssignment(
  params: WriterParams,
): Promise<PreparedDynamicAffixAssignment> {
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
      status: !params.requiredProfileKey || existingProfile === params.requiredProfileKey
        ? "existing"
        : "conflict",
      profileKey,
      planDate: params.planDate,
      assignmentId: existingId,
      existingProfileKey: existingProfile,
      itemCount: null,
      reason: !params.requiredProfileKey || existingProfile === params.requiredProfileKey
        ? null
        : "date_has_another_adle_assignment",
    };
  }
  const preview = await previewDynamicAffixAssignment({ ...params, purpose: "writer" });
  if (preview.status !== "ready") {
    return {
      status: "not_ready",
      profileKey: preview.profileKey,
      planDate: params.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: preview.reason,
    };
  }
  const { facts } = await loadDailyPlanFacts(params.serviceClient, {
    childId: params.childId,
    today: params.planDate,
  });
  const plan = buildDynamicAffixAssignmentPlan({
    basePlan: composeDailyPlan(facts, params.planDate),
    selection: preview.selection,
    payload: preview.payload,
  });
  const planValidation = preview.compilerDecision.sharedLesson
    ? validateDynamicAffixAssignmentPlanAgainstSharedLesson({
        plan,
        payload: preview.payload,
        lesson: preview.compilerDecision.sharedLesson,
      })
    : { ok: true as const };
  const planBlockerCode = planValidation.ok ? undefined : planValidation.blockerCode;
  if (!canPersistDynamicAffixCompilerDecision(preview.compilerDecision, planBlockerCode)) {
    emitDynamicAffixCompilerDecision(preview.compilerDecision, {
      purpose: "writer",
      blockerCode: planBlockerCode ?? "assignment_plan_mismatch",
      parity: "mismatched",
    });
    return {
      status: "not_ready",
      profileKey: preview.profileKey,
      planDate: params.planDate,
      assignmentId: null,
      existingProfileKey: null,
      itemCount: null,
      reason: planBlockerCode ?? "assignment_plan_mismatch",
    };
  }
  emitDynamicAffixCompilerDecision(preview.compilerDecision, {
    purpose: "writer",
    ...(planBlockerCode ? { blockerCode: planBlockerCode, parity: "mismatched" as const } : {}),
  });
  return {
    status: "ready",
    profileKey: preview.profileKey,
    planDate: params.planDate,
    plan,
    itemCount: plan.partTwo.sections.flatMap((section) => section.items).length,
  };
}

export async function persistPreparedDynamicAffixAssignment(params: WriterParams & {
  prepared: Extract<PreparedDynamicAffixAssignment, { status: "ready" }>;
}): Promise<DynamicAffixAssignmentResult> {
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

export async function createDynamicAffixAssignment(
  params: WriterParams,
): Promise<DynamicAffixAssignmentResult> {
  const prepared = await prepareDynamicAffixAssignment(params);
  if (prepared.status !== "ready") return prepared;
  return persistPreparedDynamicAffixAssignment({ ...params, prepared });
}
