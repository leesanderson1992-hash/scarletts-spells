import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildScopedPath } from "@/lib/children";
import { getLondonPracticeDate } from "@/lib/practice-date";

import {
  ADLE_ASSIGNMENT_GENERATION_SOURCE,
  ADLE_DAILY_ASSIGNMENT_TITLE,
} from "./assignment-persistence";
import { selectPartTwoSkill } from "./composer-skill-selection";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "./curriculum-readiness/route-registry";
import { composeDailyPlan } from "./daily-assignment-composer";
import { loadDailyPlanFacts } from "./loaders/composer-facts-loader";
import { persistComposedAdleDailyPlan } from "./loaders/daily-plan-surface";
import {
  generateGuardedBaseWordFamilyPilot,
} from "./loaders/base-word-family-pilot-loader";
import {
  BASE_WORD_FAMILY_ASSIGNMENT_SOURCE,
  BASE_WORD_FAMILY_ASSIGNMENT_TITLE,
} from "./morphology/base-word-family-pilot-plan";
import { isBaseWordFamilyPilotEnabledForChild } from "./morphology/base-word-family-pilot-access";
import { buildClosedCompoundAssignmentPlan } from "./morphology/closed-compound-assignment-plan";
import { loadClosedCompoundProfiles } from "./morphology/closed-compound-profile-loader";
import { isClosedCompoundRouteEnabled } from "./morphology/closed-compound-route-gate";
import { compileClosedCompoundLesson } from "./morphology/closed-compound-word-lab";
import {
  createDynamicAffixAssignment,
} from "./morphology/dynamic-affix-assignment-writer";
import {
  createDynamicPrefixAssignment,
  type DynamicPrefixQaProfileKey,
} from "./morphology/dynamic-prefix-assignment-writer";
import { isDynamicPrefixRouteEnabled } from "./morphology/dynamic-prefix-route-gate";
import { isDynamicSuffixRouteEnabled } from "./morphology/dynamic-suffix-route-gate";
import { generateGuardedCompoundWordAssignment } from "./loaders/compound-word-assignment-loader";
import { COMPOUND_WORD_MICRO_SKILL_KEYS } from "./morphology/compound-word-structure-v2";
import type { IsoDate } from "./review-scheduler";

type Client = SupabaseClient;

type RecognizedHeader = {
  id: string;
  child_id: string;
  title: string | null;
  assignment_generation_source: string | null;
};

type AssignmentItemStatus = {
  daily_assignment_id: string;
  status: string;
};

export type ParentAdleTodayState = "empty" | "ready" | "completed" | "error";

export type ParentAdleTodayStatus = {
  childId: string;
  practiceDate: string;
  state: ParentAdleTodayState;
  assignmentId: string | null;
  href: string | null;
};

export type EnsureParentAdleTodayResult =
  | { outcome: "ready"; assignmentId: string; href: string; reused: boolean }
  | { outcome: "completed"; assignmentId: string; href: string }
  | { outcome: "no_eligible"; blockerCode: string }
  | { outcome: "rejected" }
  | { outcome: "failed"; blockerCode: string };

export function isRecognizedAdleTodayHeader(row: RecognizedHeader): boolean {
  return (
    row.title === ADLE_DAILY_ASSIGNMENT_TITLE
    && row.assignment_generation_source === ADLE_ASSIGNMENT_GENERATION_SOURCE
  ) || (
    row.title === BASE_WORD_FAMILY_ASSIGNMENT_TITLE
    && row.assignment_generation_source === BASE_WORD_FAMILY_ASSIGNMENT_SOURCE
  );
}

export function resolveParentManualAdleRoute(microSkillKey: string): string | null {
  return ADLE_CURRICULUM_ROUTE_REGISTRY.find((candidate) =>
    candidate.implementationState === "registered"
    && candidate.newAssignmentCapable
    && candidate.routeId !== "generic_composer"
    && candidate.supportedMicroSkillKeys.includes(microSkillKey),
  )?.routeId ?? null;
}

export function deriveParentAdleTodayState(
  itemStatuses: readonly string[],
): "ready" | "completed" | "error" {
  if (itemStatuses.length === 0) return "error";
  return itemStatuses.every((status) => status === "completed") ? "completed" : "ready";
}

function learnerHref(childId: string): string {
  return buildScopedPath("/learn/week/adle", childId, "child");
}

function emptyStatus(childId: string, practiceDate: string): ParentAdleTodayStatus {
  return {
    childId,
    practiceDate,
    state: "empty",
    assignmentId: null,
    href: null,
  };
}

export async function loadParentAdleTodayStatuses(params: {
  userClient: Client;
  parentUserId: string;
  childIds: readonly string[];
  now?: Date;
}): Promise<ParentAdleTodayStatus[]> {
  const practiceDate = getLondonPracticeDate(params.now);
  const uniqueChildIds = [...new Set(params.childIds)];
  if (uniqueChildIds.length === 0) return [];

  const { data: headerData, error: headerError } = await params.userClient
    .from("daily_assignments")
    .select("id, child_id, title, assignment_generation_source")
    .eq("parent_user_id", params.parentUserId)
    .eq("assignment_date", practiceDate)
    .in("child_id", uniqueChildIds);
  if (headerError) {
    throw new Error(`loadParentAdleTodayStatuses:headers: ${headerError.message}`);
  }

  const recognized = ((headerData ?? []) as RecognizedHeader[]).filter(isRecognizedAdleTodayHeader);
  const headersByChild = new Map<string, RecognizedHeader[]>();
  for (const header of recognized) {
    const rows = headersByChild.get(header.child_id) ?? [];
    rows.push(header);
    headersByChild.set(header.child_id, rows);
  }

  const assignmentIds = recognized.map((row) => row.id);
  const itemsByAssignment = new Map<string, AssignmentItemStatus[]>();
  if (assignmentIds.length > 0) {
    const { data: itemData, error: itemError } = await params.userClient
      .from("assignment_items")
      .select("daily_assignment_id, status")
      .eq("parent_user_id", params.parentUserId)
      .in("daily_assignment_id", assignmentIds);
    if (itemError) {
      throw new Error(`loadParentAdleTodayStatuses:items: ${itemError.message}`);
    }
    for (const item of (itemData ?? []) as AssignmentItemStatus[]) {
      const rows = itemsByAssignment.get(item.daily_assignment_id) ?? [];
      rows.push(item);
      itemsByAssignment.set(item.daily_assignment_id, rows);
    }
  }

  return uniqueChildIds.map((childId) => {
    const headers = headersByChild.get(childId) ?? [];
    if (headers.length === 0) return emptyStatus(childId, practiceDate);
    if (headers.length > 1) {
      return {
        childId,
        practiceDate,
        state: "error",
        assignmentId: null,
        href: null,
      };
    }
    const assignmentId = headers[0].id;
    const items = itemsByAssignment.get(assignmentId) ?? [];
    if (items.length === 0) {
      return {
        childId,
        practiceDate,
        state: "error",
        assignmentId,
        href: learnerHref(childId),
      };
    }
    return {
      childId,
      practiceDate,
      state: deriveParentAdleTodayState(items.map((item) => item.status)),
      assignmentId,
      href: learnerHref(childId),
    };
  });
}

async function loadOneStatus(params: {
  userClient: Client;
  parentUserId: string;
  childId: string;
  now?: Date;
}): Promise<ParentAdleTodayStatus> {
  const [status] = await loadParentAdleTodayStatuses({
    ...params,
    childIds: [params.childId],
  });
  return status;
}

function statusResult(
  status: ParentAdleTodayStatus,
  reused: boolean,
): EnsureParentAdleTodayResult | null {
  if (!status.assignmentId || !status.href) return null;
  if (status.state === "completed") {
    return { outcome: "completed", assignmentId: status.assignmentId, href: status.href };
  }
  if (status.state === "ready") {
    return {
      outcome: "ready",
      assignmentId: status.assignmentId,
      href: status.href,
      reused,
    };
  }
  return null;
}

function emitGenerationEvent(params: {
  parentUserId: string;
  childId: string;
  practiceDate: string;
  outcome: EnsureParentAdleTodayResult["outcome"];
  routeId?: string;
  blockerCode?: string;
}): void {
  console.info(JSON.stringify({
    event: "adle_parent_manual_generation",
    parentUserId: params.parentUserId,
    childId: params.childId,
    practiceDate: params.practiceDate,
    outcome: params.outcome,
    routeId: params.routeId ?? null,
    blockerCode: params.blockerCode ?? null,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    environment: process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT
      ?? process.env.VERCEL_ENV
      ?? process.env.NODE_ENV
      ?? "unknown",
  }));
}

export async function ensureParentAdleTodayAssignment(params: {
  userClient: Client;
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  now?: Date;
}): Promise<EnsureParentAdleTodayResult> {
  const practiceDate = getLondonPracticeDate(params.now);
  const { data: child, error: childError } = await params.userClient
    .from("children")
    .select("id")
    .eq("id", params.childId)
    .eq("parent_user_id", params.parentUserId)
    .eq("is_archived", false)
    .maybeSingle();
  if (childError || !child) {
    emitGenerationEvent({
      parentUserId: params.parentUserId,
      childId: params.childId,
      practiceDate,
      outcome: "rejected",
      blockerCode: childError ? "ownership_read_failed" : "child_not_owned_or_inactive",
    });
    return { outcome: "rejected" };
  }

  const existing = statusResult(await loadOneStatus({
    userClient: params.userClient,
    parentUserId: params.parentUserId,
    childId: params.childId,
    now: params.now,
  }), true);
  if (existing) {
    emitGenerationEvent({
      parentUserId: params.parentUserId,
      childId: params.childId,
      practiceDate,
      outcome: existing.outcome,
    });
    return existing;
  }

  let routeId: string | undefined;
  try {
    const { facts } = await loadDailyPlanFacts(params.serviceClient, {
      childId: params.childId,
      today: practiceDate as IsoDate,
    });
    const selection = selectPartTwoSkill({
      learningItems: facts.learningItems.filter((item) => item.childId === params.childId),
      skillFamilyKeyBySkill: facts.skillFamilyKeyBySkill,
      prerequisiteKeysBySkill: facts.prerequisiteKeysBySkill,
      notYetSecureSkillKeys: facts.notYetSecureSkillKeys,
      frequencyBandByWordId: facts.frequencyBandByWordId,
      previousLessonFamilyKey: facts.previousLessonFamilyKey,
    });
    if (!selection.microSkillKey) {
      const result = {
        outcome: "no_eligible" as const,
        blockerCode: selection.skipReason ?? "no_selected_micro_skill",
      };
      emitGenerationEvent({
        parentUserId: params.parentUserId,
        childId: params.childId,
        practiceDate,
        outcome: result.outcome,
        blockerCode: result.blockerCode,
      });
      return result;
    }

    routeId = resolveParentManualAdleRoute(selection.microSkillKey) ?? undefined;
    if (!routeId) {
      const result = { outcome: "no_eligible" as const, blockerCode: "no_active_specialist_route" };
      emitGenerationEvent({
        parentUserId: params.parentUserId,
        childId: params.childId,
        practiceDate,
        outcome: result.outcome,
        blockerCode: result.blockerCode,
      });
      return result;
    }

    const allowStagingProfiles =
      process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging";
    let generatedAssignmentId: string | null = null;
    let blockerCode: string | null = null;
    if (routeId === "dynamic_prefix_word_lab") {
      if (!isDynamicPrefixRouteEnabled()) blockerCode = "route_disabled";
      else {
        const result = await createDynamicPrefixAssignment({
          userClient: params.userClient,
          serviceClient: params.serviceClient,
          parentUserId: params.parentUserId,
          childId: params.childId,
          planDate: practiceDate,
          requiredProfileKey: selection.microSkillKey as DynamicPrefixQaProfileKey,
          allowStagingProfiles,
          generationTrigger: "parent_manual",
        });
        generatedAssignmentId = result.assignmentId;
        blockerCode = result.status === "not_ready" || result.status === "conflict"
          ? result.reason ?? result.status
          : null;
      }
    } else if (routeId === "dynamic_affix_word_lab") {
      if (!isDynamicSuffixRouteEnabled()) blockerCode = "route_disabled";
      else {
        const result = await createDynamicAffixAssignment({
          userClient: params.userClient,
          serviceClient: params.serviceClient,
          parentUserId: params.parentUserId,
          childId: params.childId,
          planDate: practiceDate,
          requiredProfileKey: selection.microSkillKey,
          allowStagingProfiles,
          generationTrigger: "parent_manual",
        });
        generatedAssignmentId = result.assignmentId;
        blockerCode = result.status === "not_ready" || result.status === "conflict"
          ? result.reason ?? result.status
          : null;
      }
    } else if (routeId === "closed_compound_word_lab") {
      if (!isClosedCompoundRouteEnabled()) blockerCode = "route_disabled";
      else {
        const loaded = await loadClosedCompoundProfiles(
          params.serviceClient,
          params.childId,
          { allowStagingProfiles },
        );
        const profile = loaded.profiles.find(
          (candidate) => candidate.microSkillKey === selection.microSkillKey,
        );
        const payload = profile
          ? compileClosedCompoundLesson(profile, loaded.learningItems)
          : null;
        if (!payload) blockerCode = "profile_or_authentic_queue_not_ready";
        else {
          const plan = buildClosedCompoundAssignmentPlan(
            composeDailyPlan(facts, practiceDate as IsoDate),
            payload,
          );
          generatedAssignmentId = await persistComposedAdleDailyPlan({
            userClient: params.userClient,
            serviceClient: params.serviceClient,
            parentUserId: params.parentUserId,
            childId: params.childId,
            planDate: practiceDate as IsoDate,
            plan,
            generationTrigger: "parent_manual",
          });
        }
      }
    } else if (routeId === "base_word_lab") {
      if (!isBaseWordFamilyPilotEnabledForChild(params.childId)) blockerCode = "route_disabled";
      else {
        const result = await generateGuardedBaseWordFamilyPilot({
          client: params.serviceClient,
          parentUserId: params.parentUserId,
          childId: params.childId,
          planDate: practiceDate,
          requiredMicroSkillKey: selection.microSkillKey,
          generationTrigger: "parent_manual",
        });
        generatedAssignmentId = result.assignmentId;
        blockerCode = result.readinessReason;
      }
    } else if (routeId === "compound_word_lab") {
      if (!COMPOUND_WORD_MICRO_SKILL_KEYS.includes(
        selection.microSkillKey as (typeof COMPOUND_WORD_MICRO_SKILL_KEYS)[number],
      )) blockerCode = "unsupported_compound_word_micro_skill";
      else {
        const result = await generateGuardedCompoundWordAssignment({
          userClient: params.userClient,
          serviceClient: params.serviceClient,
          parentUserId: params.parentUserId,
          childId: params.childId,
          planDate: practiceDate,
          microSkillKey: selection.microSkillKey as (typeof COMPOUND_WORD_MICRO_SKILL_KEYS)[number],
          generationTrigger: "parent_manual",
        });
        generatedAssignmentId = result.assignmentId;
        blockerCode = result.readinessReason;
      }
    } else {
      blockerCode = "route_not_supported_by_parent_generator";
    }

    const status = statusResult(await loadOneStatus({
      userClient: params.userClient,
      parentUserId: params.parentUserId,
      childId: params.childId,
      now: params.now,
    }), generatedAssignmentId === null);
    if (status) {
      emitGenerationEvent({
        parentUserId: params.parentUserId,
        childId: params.childId,
        practiceDate,
        outcome: status.outcome,
        routeId,
      });
      return status;
    }
    const result = {
      outcome: "no_eligible" as const,
      blockerCode: blockerCode ?? "route_returned_no_assignment",
    };
    emitGenerationEvent({
      parentUserId: params.parentUserId,
      childId: params.childId,
      practiceDate,
      outcome: result.outcome,
      routeId,
      blockerCode: result.blockerCode,
    });
    return result;
  } catch (error) {
    // A concurrent request may have won the database uniqueness race.
    try {
      const winner = statusResult(await loadOneStatus({
        userClient: params.userClient,
        parentUserId: params.parentUserId,
        childId: params.childId,
        now: params.now,
      }), true);
      if (winner) {
        emitGenerationEvent({
          parentUserId: params.parentUserId,
          childId: params.childId,
          practiceDate,
          outcome: winner.outcome,
          routeId,
        });
        return winner;
      }
    } catch {
      // The original operational failure remains the useful signal.
    }
    const blockerCode = error instanceof Error && error.message
      ? error.message.slice(0, 240)
      : "unknown_generation_failure";
    emitGenerationEvent({
      parentUserId: params.parentUserId,
      childId: params.childId,
      practiceDate,
      outcome: "failed",
      routeId,
      blockerCode,
    });
    return { outcome: "failed", blockerCode };
  }
}
