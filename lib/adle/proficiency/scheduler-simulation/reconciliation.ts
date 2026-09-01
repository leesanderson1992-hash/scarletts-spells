import {
  SCHEDULER_SIMULATION_VERSION,
  type ControlledAttemptFact,
  type CurrentRouteFact,
  type SchedulerDueDateScenario,
  type SchedulerRouteState,
  type SchedulerSimulationResult,
} from "./contracts";
import {
  ROLLING_DUE_DATE_SIMULATION,
  evaluateControlledGraduation,
  mapCurrentRouteToTarget,
  simulateSchedulerEvent,
  simulationFingerprint,
} from "./simulator";

function dueOn(state: SchedulerRouteState): string | null {
  if (state.route.membership === "SCHEDULED"
    || state.route.membership === "NEXT_DAY_RECOVERY"
    || state.route.membership === "PRE_RETIREMENT_PRESERVED") {
    return state.route.dueOn;
  }
  return null;
}

function branchKey(state: SchedulerRouteState): string {
  if (state.route.membership === "SCHEDULED") return `SCHEDULED:${state.route.rung}`;
  if (state.route.membership === "NEXT_DAY_RECOVERY") return `NEXT_DAY_RECOVERY:${state.route.failedRung}`;
  return state.route.membership;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function buildSchedulerSimulation(input: {
  controlledAttempts: readonly ControlledAttemptFact[];
  currentRoutes: readonly CurrentRouteFact[];
  asOfOn: string;
  sessionCap: number;
  sourceFactsForFingerprint: unknown;
  dueDateScenario?: SchedulerDueDateScenario;
}): SchedulerSimulationResult {
  const dueDateScenario = input.dueDateScenario ?? ROLLING_DUE_DATE_SIMULATION;
  const controlledDecisions = evaluateControlledGraduation(input.controlledAttempts);
  const controlledFactsByEvent = new Map(input.controlledAttempts.map((entry) => [entry.eventId, entry]));
  let controlledBothCorrectCount = 0;
  let controlledCoverOnlyCorrectCount = 0;
  let controlledDictationOnlyCorrectCount = 0;
  let controlledBothWrongCount = 0;
  for (const decision of controlledDecisions) {
    if (decision.disposition !== "ADMITTED" || !decision.coverWriteEventId || !decision.sentenceDictationEventId) continue;
    const cover = controlledFactsByEvent.get(decision.coverWriteEventId)?.outcome;
    const dictation = controlledFactsByEvent.get(decision.sentenceDictationEventId)?.outcome;
    if (cover === "pass" && dictation === "pass") controlledBothCorrectCount += 1;
    else if (cover === "pass" && dictation === "fail") controlledCoverOnlyCorrectCount += 1;
    else if (cover === "fail" && dictation === "pass") controlledDictationOnlyCorrectCount += 1;
    else if (cover === "fail" && dictation === "fail") controlledBothWrongCount += 1;
  }
  const routeDecisions = input.currentRoutes.map(mapCurrentRouteToTarget)
    .sort((left, right) => left.scheduleWordId.localeCompare(right.scheduleWordId));
  const routeFactById = new Map(input.currentRoutes.map((entry) => [entry.scheduleWordId, entry]));
  const currentRouteAuthorityCounts = { PER_WORD_V1: 0, LEGACY_BUNDLE: 0, CONFLICTING: 0 };
  const currentMembershipCounts = {
    scheduled: 0, catch_up: 0, ejected_pending_reteach: 0,
    paused_parent_review: 0, awaiting_pre_retirement_check: 0, retired: 0,
  };
  for (const fact of input.currentRoutes) {
    currentRouteAuthorityCounts[fact.scheduleAuthority] += 1;
    currentMembershipCounts[fact.membershipStatus] += 1;
  }
  const targetModeCounts: Record<string, number> = {};
  for (const decision of routeDecisions) {
    if (decision.targetState) increment(targetModeCounts, branchKey(decision.targetState));
  }
  const passBranches: Record<string, number> = {};
  const failBranches: Record<string, number> = {};
  let currentDueCount = 0;
  let targetMappedDueCount = 0;
  const currentDueByLearner = new Map<string, number>();
  const targetDueByLearner = new Map<string, number>();
  for (const fact of input.currentRoutes) {
    const currentDueOn = fact.membershipStatus === "awaiting_pre_retirement_check"
      ? fact.preRetirementCheckDueOn : fact.effectiveDueOn;
    if (fact.rowStatus === "active" && currentDueOn && currentDueOn <= input.asOfOn
      && ["scheduled", "catch_up", "awaiting_pre_retirement_check"].includes(fact.membershipStatus)) {
      currentDueCount += 1;
      currentDueByLearner.set(fact.learnerId, (currentDueByLearner.get(fact.learnerId) ?? 0) + 1);
    }
  }
  for (const decision of routeDecisions) {
    const state = decision.targetState;
    const stateDueOn = state ? dueOn(state) : null;
    if (!state || !stateDueOn || stateDueOn > input.asOfOn) continue;
    targetMappedDueCount += 1;
    const routeFact = routeFactById.get(decision.scheduleWordId);
    if (routeFact) targetDueByLearner.set(routeFact.learnerId, (targetDueByLearner.get(routeFact.learnerId) ?? 0) + 1);
    if (state.route.membership === "SCHEDULED") {
      increment(passBranches, branchKey(simulateSchedulerEvent(state, {
        eventId: `hypothetical-pass:${decision.scheduleWordId}`,
        kind: "SCHEDULED_CHECK",
        rung: state.route.rung,
        outcome: "pass",
        occurredOn: input.asOfOn,
      }, dueDateScenario)));
      increment(failBranches, branchKey(simulateSchedulerEvent(state, {
        eventId: `hypothetical-fail:${decision.scheduleWordId}`,
        kind: "SCHEDULED_CHECK",
        rung: state.route.rung,
        outcome: "fail",
        occurredOn: input.asOfOn,
      }, dueDateScenario)));
    } else if (state.route.membership === "NEXT_DAY_RECOVERY") {
      increment(passBranches, branchKey(simulateSchedulerEvent(state, {
        eventId: `hypothetical-pass:${decision.scheduleWordId}`,
        kind: "RECOVERY_CHECK",
        failedRung: state.route.failedRung,
        outcome: "pass",
        occurredOn: input.asOfOn,
      }, dueDateScenario)));
      increment(failBranches, branchKey(simulateSchedulerEvent(state, {
        eventId: `hypothetical-fail:${decision.scheduleWordId}`,
        kind: "RECOVERY_CHECK",
        failedRung: state.route.failedRung,
        outcome: "fail",
        occurredOn: input.asOfOn,
      }, dueDateScenario)));
    }
  }
  const queueImpact = (counts: ReadonlyMap<string, number>) => ({
    learnerCount: counts.size,
    overCapLearnerCount: [...counts.values()].filter((count) => count > input.sessionCap).length,
    deferredByCapCount: [...counts.values()].reduce((total, count) => total + Math.max(0, count - input.sessionCap), 0),
    maximumLearnerQueue: Math.max(0, ...counts.values()),
    sortedQueueSizes: [...counts.values()].sort((left, right) => left - right),
  });
  const currentQueueImpact = queueImpact(currentDueByLearner);
  const targetQueueImpact = queueImpact(targetDueByLearner);
  const reconciliation = {
    simulationVersion: SCHEDULER_SIMULATION_VERSION,
    dueDateScenarioVersion: dueDateScenario.scenarioVersion,
    sourceFingerprint: simulationFingerprint({
      simulationVersion: SCHEDULER_SIMULATION_VERSION,
      asOfOn: input.asOfOn,
      sourceFacts: input.sourceFactsForFingerprint,
    }),
    controlledDecisionFingerprint: simulationFingerprint(controlledDecisions),
    routeMigrationFingerprint: simulationFingerprint(routeDecisions),
    queueFingerprint: simulationFingerprint({
      asOfOn: input.asOfOn,
      currentDueCount,
      targetMappedDueCount,
      sessionCap: input.sessionCap,
      currentQueueSizes: currentQueueImpact.sortedQueueSizes,
      targetQueueSizes: targetQueueImpact.sortedQueueSizes,
      passBranches,
      failBranches,
    }),
    controlledAttemptCount: input.controlledAttempts.length,
    controlledCycleCount: controlledDecisions.length,
    controlledPassCount: controlledDecisions.filter((entry) => entry.controlledPass === true).length,
    controlledNotPassedCount: controlledDecisions.filter((entry) => entry.controlledPass === false).length,
    controlledBothCorrectCount,
    controlledCoverOnlyCorrectCount,
    controlledDictationOnlyCorrectCount,
    controlledBothWrongCount,
    controlledBlockedCount: controlledDecisions.filter((entry) => entry.disposition === "BLOCKED").length,
    controlledAmbiguousCount: controlledDecisions.filter((entry) => entry.disposition === "AMBIGUOUS").length,
    currentRouteRowCount: input.currentRoutes.length,
    currentRouteAuthorityCounts,
    currentMembershipCounts,
    targetModeCounts: Object.fromEntries(Object.entries(targetModeCounts).sort()),
    admittedRouteCount: routeDecisions.filter((entry) => entry.disposition === "ADMITTED").length,
    blockedRouteCount: routeDecisions.filter((entry) => entry.disposition === "BLOCKED").length,
    policyDecisionRouteCount: routeDecisions.filter((entry) => entry.disposition === "REQUIRES_POLICY_DECISION").length,
    excludedRouteCount: routeDecisions.filter((entry) => entry.disposition === "EXCLUDED").length,
    currentDueCount,
    targetMappedDueCount,
    sessionCap: input.sessionCap,
    currentDueLearnerCount: currentQueueImpact.learnerCount,
    targetDueLearnerCount: targetQueueImpact.learnerCount,
    currentOverCapLearnerCount: currentQueueImpact.overCapLearnerCount,
    targetOverCapLearnerCount: targetQueueImpact.overCapLearnerCount,
    currentDeferredByCapCount: currentQueueImpact.deferredByCapCount,
    targetDeferredByCapCount: targetQueueImpact.deferredByCapCount,
    currentMaximumLearnerQueue: currentQueueImpact.maximumLearnerQueue,
    targetMaximumLearnerQueue: targetQueueImpact.maximumLearnerQueue,
    hypotheticalPassBranchCounts: Object.fromEntries(Object.entries(passBranches).sort()),
    hypotheticalFailBranchCounts: Object.fromEntries(Object.entries(failBranches).sort()),
    storageImpact: {
      existingPerWordRungUsable: true,
      existingPolicyVersionUsableForCoexistence: false,
      consecutiveFailureStateStored: false,
      targetEventVocabularyStored: false,
      currentSecondCatchUpCompatible: false,
      migrationRequiredForImplementation: true,
    },
  } as const;
  return { controlledDecisions, routeDecisions, reconciliation };
}
