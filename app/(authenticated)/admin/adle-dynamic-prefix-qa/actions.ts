"use server";

import { buildScopedPath } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  DYNAMIC_PREFIX_QA_PROFILE_ORDER,
  persistPreparedDynamicPrefixAssignment,
  prepareDynamicPrefixAssignment,
  type DynamicPrefixAssignmentResult,
  type DynamicPrefixQaProfileKey,
} from "@/lib/adle/morphology/dynamic-prefix-assignment-writer";
import { dynamicPrefixQaProfile } from "@/lib/adle/morphology/dynamic-prefix-qa-catalog";
import { requireDynamicPrefixQaUser } from "@/lib/adle/morphology/dynamic-prefix-qa-access";
import type {
  DynamicPrefixQaActionResult,
  DynamicPrefixQaActionState,
} from "./types";

function addDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function lessonUrl(childId: string, planDate: string): string {
  const base = buildScopedPath("/learn/week/adle", childId, "child");
  return `${base}&adleDate=${encodeURIComponent(planDate)}`;
}

function actionResult(
  result: DynamicPrefixAssignmentResult,
  childId: string,
): DynamicPrefixQaActionResult {
  const profile = dynamicPrefixQaProfile(result.profileKey);
  const itemCount = result.itemCount ?? profile?.expectedItemCount ?? 0;
  const openable = result.status === "created" || result.status === "existing";
  return {
    profileKey: result.profileKey,
    label: profile?.label ?? result.profileKey,
    planDate: result.planDate,
    status: result.status,
    itemCount,
    lessonUrl: openable ? lessonUrl(childId, result.planDate) : null,
    message: result.status === "created"
      ? "New assignment created through the normal writer."
      : result.status === "existing"
        ? "The matching normal-path assignment already exists."
        : result.status === "conflict"
          ? "That date already contains another ADLE assignment. Choose an additional date."
          : "This profile is not ready for the selected child’s authentic queue.",
  };
}

function isProfileKey(value: string): value is DynamicPrefixQaProfileKey {
  return DYNAMIC_PREFIX_QA_PROFILE_ORDER.some((key) => key === value);
}

export async function runDynamicPrefixQaLauncherAction(
  _previous: DynamicPrefixQaActionState,
  formData: FormData,
): Promise<DynamicPrefixQaActionState> {
  try {
    const user = await requireDynamicPrefixQaUser();
    const userClient = await createClient();
    const children = await getActiveChildrenForUser(userClient, user.id);
    const childId = String(formData.get("childId") ?? "");
    if (!children.some((child) => child.id === childId)) {
      return { message: "The selected child is not owned by this authorised account.", results: [] };
    }
    const operation = String(formData.get("operation") ?? "single");
    const requestedDate = String(formData.get("planDate") ?? "").trim() || getDateOnly();
    const serviceClient = createServiceRoleClient();
    const common = {
      userClient,
      serviceClient,
      parentUserId: user.id,
      childId,
      allowStagingProfiles: true,
    };
    if (operation === "single") {
      const profileKey = String(formData.get("profileKey") ?? "");
      if (!isProfileKey(profileKey)) {
        return { message: "Choose one of the five governed Prefix profiles.", results: [] };
      }
      const prepared = await prepareDynamicPrefixAssignment({
        ...common,
        planDate: requestedDate,
        requiredProfileKey: profileKey,
      });
      const result = prepared.status === "ready"
        ? await persistPreparedDynamicPrefixAssignment({
            ...common,
            planDate: requestedDate,
            requiredProfileKey: profileKey,
            prepared,
          })
        : prepared;
      return { message: null, results: [actionResult(result, childId)] };
    }
    if (operation !== "all-five") {
      return { message: "Unknown launcher operation.", results: [] };
    }
    const prepared = [];
    for (const [index, profileKey] of DYNAMIC_PREFIX_QA_PROFILE_ORDER.entries()) {
      prepared.push(await prepareDynamicPrefixAssignment({
        ...common,
        planDate: addDays(requestedDate, index),
        requiredProfileKey: profileKey,
      }));
    }
    const blockers = prepared.filter((entry) =>
      entry.status === "conflict" || entry.status === "not_ready",
    );
    if (blockers.length) {
      return {
        message: "No assignments were created because the five-lesson preflight found a conflict or unavailable profile.",
        results: prepared.map((entry) =>
          entry.status === "ready"
            ? actionResult({
                status: "not_ready",
                profileKey: entry.profileKey,
                planDate: entry.planDate,
                assignmentId: null,
                existingProfileKey: null,
                itemCount: entry.itemCount,
                reason: "sequence_preflight_aborted",
              }, childId)
            : actionResult(entry, childId),
        ),
      };
    }
    const results: DynamicPrefixQaActionResult[] = [];
    for (const entry of prepared) {
      if (entry.status === "existing") {
        results.push(actionResult(entry, childId));
        continue;
      }
      if (entry.status !== "ready") continue;
      const persisted = await persistPreparedDynamicPrefixAssignment({
        ...common,
        planDate: entry.planDate,
        requiredProfileKey: entry.profileKey as DynamicPrefixQaProfileKey,
        prepared: entry,
      });
      results.push(actionResult(persisted, childId));
    }
    return { message: null, results };
  } catch (error) {
    console.error("[dynamic-prefix-qa] launcher action failed", error);
    return { message: "The staging assignment could not be created. No preview payload was generated.", results: [] };
  }
}
