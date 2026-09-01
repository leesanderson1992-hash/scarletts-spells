import { createHash } from "node:crypto";

import { decideControlledGraduationV1 } from "../../review-policy/controlled-graduation-v1";
import { ADLE_REVIEW_DUE_ANCHOR_V1 } from "../../review-policy/contracts";
import {
  TARGET_REVIEW_POLICY_CONFIG,
  requireAppliedTargetTransition,
  targetNoFailureLineage,
} from "../../review-policy/target-regression-v1";
import {
  CONTROLLED_GRADUATION_POLICY_VERSION,
  REVIEW_RUNGS,
  SCHEDULER_SIMULATION_VERSION,
  type ControlledAttemptFact,
  type ControlledGraduationDecision,
  type CurrentRouteFact,
  type ReviewRung,
  type RouteMigrationDecision,
  type SchedulerDueDateScenario,
  type SchedulerRouteState,
  type SchedulerSimulationEvent,
} from "./contracts";

export const ROLLING_DUE_DATE_SIMULATION: SchedulerDueDateScenario = {
  scenarioVersion: ADLE_REVIEW_DUE_ANCHOR_V1,
  nextScheduledDueOn: TARGET_REVIEW_POLICY_CONFIG.dueDates.nextScheduledDueOn,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function simulationFingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function decisionId(cycleId: string, learnerId: string, canonicalWordId: string): string {
  return `controlled:${simulationFingerprint({
    policy: CONTROLLED_GRADUATION_POLICY_VERSION,
    cycleId,
    learnerId,
    canonicalWordId,
  })}`;
}

export function evaluateControlledGraduation(
  facts: readonly ControlledAttemptFact[],
): ControlledGraduationDecision[] {
  const groups = new Map<string, ControlledAttemptFact[]>();
  for (const fact of facts) {
    const key = [fact.controlledCycleId, fact.learnerId, fact.canonicalWordId].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  const decisions: ControlledGraduationDecision[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.eventId.localeCompare(right.eventId));
    const first = ordered[0];
    if (ordered.some((fact) => fact.learnerId !== first.learnerId
      || fact.canonicalWordId !== first.canonicalWordId
      || fact.controlledCycleId !== first.controlledCycleId)) {
      decisions.push({
        decisionId: decisionId(first.controlledCycleId, first.learnerId, first.canonicalWordId),
        learnerId: first.learnerId,
        canonicalWordId: first.canonicalWordId,
        controlledCycleId: first.controlledCycleId,
        disposition: "AMBIGUOUS",
        reason: "CONTROLLED_FACT_CONFLICT",
        controlledPass: null,
        coverWriteEventId: null,
        sentenceDictationEventId: null,
        completedOn: null,
      });
      continue;
    }
    const cover = ordered.filter((fact) => fact.opportunity === "COVER_WRITE");
    const dictation = ordered.filter((fact) => fact.opportunity === "SENTENCE_DICTATION");
    if (cover.length > 1 || dictation.length > 1) {
      decisions.push({
        decisionId: decisionId(first.controlledCycleId, first.learnerId, first.canonicalWordId),
        learnerId: first.learnerId,
        canonicalWordId: first.canonicalWordId,
        controlledCycleId: first.controlledCycleId,
        disposition: "AMBIGUOUS",
        reason: "CONTROLLED_OPPORTUNITY_DUPLICATED",
        controlledPass: null,
        coverWriteEventId: cover[0]?.eventId ?? null,
        sentenceDictationEventId: dictation[0]?.eventId ?? null,
        completedOn: null,
      });
      continue;
    }
    if (cover.length !== 1 || dictation.length !== 1) {
      decisions.push({
        decisionId: decisionId(first.controlledCycleId, first.learnerId, first.canonicalWordId),
        learnerId: first.learnerId,
        canonicalWordId: first.canonicalWordId,
        controlledCycleId: first.controlledCycleId,
        disposition: "BLOCKED",
        reason: "CONTROLLED_OPPORTUNITY_MISSING",
        controlledPass: null,
        coverWriteEventId: cover[0]?.eventId ?? null,
        sentenceDictationEventId: dictation[0]?.eventId ?? null,
        completedOn: null,
      });
      continue;
    }
    const governed = decideControlledGraduationV1({
      coverWrite: { eventId: cover[0].eventId, outcome: cover[0].outcome },
      sentenceDictation: { eventId: dictation[0].eventId, outcome: dictation[0].outcome },
    });
    decisions.push({
      decisionId: decisionId(first.controlledCycleId, first.learnerId, first.canonicalWordId),
      learnerId: first.learnerId,
      canonicalWordId: first.canonicalWordId,
      controlledCycleId: first.controlledCycleId,
      disposition: "ADMITTED",
      reason: governed.reason,
      controlledPass: governed.decision === "PASS",
      coverWriteEventId: cover[0].eventId,
      sentenceDictationEventId: dictation[0].eventId,
      completedOn: [cover[0].occurredOn, dictation[0].occurredOn].sort().at(-1)!,
    });
  }
  return decisions.sort((left, right) => left.decisionId.localeCompare(right.decisionId));
}

export function simulateSchedulerEvent(
  state: SchedulerRouteState,
  event: SchedulerSimulationEvent,
  dueDateScenario: SchedulerDueDateScenario = ROLLING_DUE_DATE_SIMULATION,
): SchedulerRouteState {
  return requireAppliedTargetTransition(state, event, {
    ...TARGET_REVIEW_POLICY_CONFIG,
    dueDates: {
      dueAnchorVersion: dueDateScenario.scenarioVersion,
      dueAnchorKind: dueDateScenario.scenarioVersion,
      nextScheduledDueOn: dueDateScenario.nextScheduledDueOn,
    },
  }).nextState;
}

function rungAt(index: number | null): ReviewRung | null {
  return index !== null && index >= 0 && index < REVIEW_RUNGS.length ? REVIEW_RUNGS[index] : null;
}

export function mapCurrentRouteToTarget(fact: CurrentRouteFact): RouteMigrationDecision {
  if (fact.rowStatus !== "active") {
    return { scheduleWordId: fact.scheduleWordId, disposition: "EXCLUDED", reason: "INACTIVE_ROW", targetState: null };
  }
  if (fact.scheduleAuthority === "CONFLICTING") {
    return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "SCHEDULE_AUTHORITY_CONFLICT", targetState: null };
  }
  if (!fact.currentPolicyLadderCompatible) {
    return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "CURRENT_POLICY_LADDER_UNSUPPORTED", targetState: null };
  }
  const rung = rungAt(fact.effectiveIntervalIndex);
  if (!rung) return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "RUNG_INDEX_UNSUPPORTED", targetState: null };
  const failures = fact.reconstructedConsecutiveFailures;
  if (fact.membershipStatus === "scheduled") {
    if (!fact.effectiveDueOn) return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "SCHEDULE_AUTHORITY_CONFLICT", targetState: null };
    return {
      scheduleWordId: fact.scheduleWordId,
      disposition: "ADMITTED",
      reason: "DIRECT_RUNG_MAPPING",
      targetState: {
        route: { membership: "SCHEDULED", rung, dueOn: fact.effectiveDueOn, regressionOrigin: null },
        failureLineage: (failures ?? 0) > 0
          ? { resolution: "UNRESOLVED", episodeId: `legacy:${fact.scheduleWordId}`, consecutiveIndependentFailures: failures! }
          : targetNoFailureLineage(),
        appliedEventIds: [],
      },
    };
  }
  if (fact.membershipStatus === "catch_up") {
    if (fact.catchUpStage === 2) {
      return { scheduleWordId: fact.scheduleWordId, disposition: "REQUIRES_POLICY_DECISION", reason: "SECOND_CATCH_UP_HAS_NO_TARGET_EQUIVALENT", targetState: null };
    }
    if (rung === "DAY_1") {
      return {
        scheduleWordId: fact.scheduleWordId,
        disposition: "ADMITTED",
        reason: "DAY_1_CATCH_UP_MAPS_TO_CONTROLLED_REACQUISITION",
        targetState: {
          route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: (failures ?? 1) >= 3 ? "THIRD_CONSECUTIVE_FAILURE" : "DAY_1_FAILURE" },
          failureLineage: { resolution: "UNRESOLVED", episodeId: `legacy:${fact.scheduleWordId}`, consecutiveIndependentFailures: failures ?? 1 },
          appliedEventIds: [],
        },
      };
    }
    if (!fact.effectiveDueOn) {
      return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "SCHEDULE_AUTHORITY_CONFLICT", targetState: null };
    }
    if (failures === null) {
      return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "FAILURE_EPISODE_UNRECONSTRUCTABLE", targetState: null };
    }
    return {
      scheduleWordId: fact.scheduleWordId,
      disposition: "ADMITTED",
      reason: "FIRST_CATCH_UP_MAPS_TO_RECOVERY",
      targetState: {
        route: { membership: "NEXT_DAY_RECOVERY", failedRung: rung, dueOn: fact.effectiveDueOn },
        failureLineage: { resolution: "UNRESOLVED", episodeId: `legacy:${fact.scheduleWordId}`, consecutiveIndependentFailures: failures },
        appliedEventIds: [],
      },
    };
  }
  if (fact.membershipStatus === "ejected_pending_reteach") {
    return {
      scheduleWordId: fact.scheduleWordId,
      disposition: "ADMITTED",
      reason: "EJECTED_MAPS_TO_CONTROLLED_REACQUISITION",
      targetState: {
        route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: (failures ?? 0) >= 3 ? "THIRD_CONSECUTIVE_FAILURE" : "NOT_YET_PASSED" },
        failureLineage: (failures ?? 0) > 0
          ? { resolution: "UNRESOLVED", episodeId: `legacy:${fact.scheduleWordId}`, consecutiveIndependentFailures: failures! }
          : targetNoFailureLineage(),
        appliedEventIds: [],
      },
    };
  }
  if (fact.membershipStatus === "paused_parent_review") {
    return { scheduleWordId: fact.scheduleWordId, disposition: "REQUIRES_POLICY_DECISION", reason: "PAUSED_PARENT_REQUIRES_RELEASE_DECISION", targetState: null };
  }
  if (fact.membershipStatus === "awaiting_pre_retirement_check") {
    if (!fact.preRetirementCheckDueOn) return { scheduleWordId: fact.scheduleWordId, disposition: "BLOCKED", reason: "SCHEDULE_AUTHORITY_CONFLICT", targetState: null };
    return {
      scheduleWordId: fact.scheduleWordId,
      disposition: "ADMITTED",
      reason: "PRE_RETIREMENT_PRESERVED_SEPARATELY",
      targetState: {
        route: { membership: "PRE_RETIREMENT_PRESERVED", dueOn: fact.preRetirementCheckDueOn },
        failureLineage: targetNoFailureLineage(), appliedEventIds: [],
      },
    };
  }
  return {
    scheduleWordId: fact.scheduleWordId,
    disposition: "ADMITTED",
    reason: "RETIRED_PRESERVED_SEPARATELY",
    targetState: {
      route: { membership: "RETIRED_PRESERVED" },
      failureLineage: targetNoFailureLineage(), appliedEventIds: [],
    },
  };
}

export function simulationSourceVersion(): string {
  return SCHEDULER_SIMULATION_VERSION;
}
