import type { SchedulerSimulationResult } from "./contracts";

function countsByReason(result: SchedulerSimulationResult): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const decision of result.routeDecisions) {
    const key = `${decision.disposition}:${decision.reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function branchLines(branches: Record<string, number>): string {
  const entries = Object.entries(branches);
  return entries.length === 0 ? "none" : entries.map(([key, value]) => `${key} ${value}`).join("; ");
}

export function formatSchedulerSimulationReport(result: SchedulerSimulationResult, label: string): string {
  const r = result.reconciliation;
  const lines = [
    "# ADLE C2 scheduler simulation",
    "",
    `Source: ${label}`,
    `Simulation: \`${r.simulationVersion}\``,
    `Due-date scenario: \`${r.dueDateScenarioVersion}\``,
    `Source fingerprint: \`${r.sourceFingerprint}\``,
    `Controlled decision fingerprint: \`${r.controlledDecisionFingerprint}\``,
    `Route migration fingerprint: \`${r.routeMigrationFingerprint}\``,
    `Queue fingerprint: \`${r.queueFingerprint}\``,
    "",
    "## Controlled OR graduation",
    "",
    `- Attempt events: ${r.controlledAttemptCount}`,
    `- Controlled cycles: ${r.controlledCycleCount}`,
    `- Pass / both failed: ${r.controlledPassCount} / ${r.controlledNotPassedCount}`,
    `- Both correct / Cover-only correct / dictation-only correct / both wrong: ${r.controlledBothCorrectCount} / ${r.controlledCoverOnlyCorrectCount} / ${r.controlledDictationOnlyCorrectCount} / ${r.controlledBothWrongCount}`,
    `- Blocked / ambiguous cycles: ${r.controlledBlockedCount} / ${r.controlledAmbiguousCount}`,
    "",
    "## In-flight route mapping",
    "",
    `- Current schedule rows: ${r.currentRouteRowCount}`,
    `- Schedule authority: per-word ${r.currentRouteAuthorityCounts.PER_WORD_V1}; legacy bundle ${r.currentRouteAuthorityCounts.LEGACY_BUNDLE}; conflicting ${r.currentRouteAuthorityCounts.CONFLICTING}`,
    `- Current memberships: scheduled ${r.currentMembershipCounts.scheduled}; catch-up ${r.currentMembershipCounts.catch_up}; ejected ${r.currentMembershipCounts.ejected_pending_reteach}; paused ${r.currentMembershipCounts.paused_parent_review}; pre-retirement ${r.currentMembershipCounts.awaiting_pre_retirement_check}; retired ${r.currentMembershipCounts.retired}`,
    `- Admitted / blocked / policy decision / excluded: ${r.admittedRouteCount} / ${r.blockedRouteCount} / ${r.policyDecisionRouteCount} / ${r.excludedRouteCount}`,
    `- Target modes: ${branchLines(r.targetModeCounts)}`,
    `- Current due / target-mapped due: ${r.currentDueCount} / ${r.targetMappedDueCount}`,
    `- Queue cap: ${r.sessionCap}; learners with due work current/target ${r.currentDueLearnerCount}/${r.targetDueLearnerCount}`,
    `- Learners over cap current/target: ${r.currentOverCapLearnerCount}/${r.targetOverCapLearnerCount}; deferred words ${r.currentDeferredByCapCount}/${r.targetDeferredByCapCount}`,
    `- Maximum per-learner queue current/target: ${r.currentMaximumLearnerQueue}/${r.targetMaximumLearnerQueue}`,
    `- Hypothetical pass branches: ${branchLines(r.hypotheticalPassBranchCounts)}`,
    `- Hypothetical fail branches: ${branchLines(r.hypotheticalFailBranchCounts)}`,
    "",
    "## Route decision reasons",
    "",
  ];
  for (const [key, count] of countsByReason(result)) lines.push(`- ${key}: ${count}`);
  lines.push(
    "",
    "## Storage impact",
    "",
    `- Existing per-word rung usable: ${r.storageImpact.existingPerWordRungUsable ? "YES" : "NO"}`,
    `- Existing policy-version field sufficient for coexistence: ${r.storageImpact.existingPolicyVersionUsableForCoexistence ? "YES" : "NO"}`,
    `- Consecutive failure episode stored: ${r.storageImpact.consecutiveFailureStateStored ? "YES" : "NO"}`,
    `- Target event vocabulary stored: ${r.storageImpact.targetEventVocabularyStored ? "YES" : "NO"}`,
    `- Current second catch-up compatible: ${r.storageImpact.currentSecondCatchUpCompatible ? "YES" : "NO"}`,
    `- Forward migration required before implementation: ${r.storageImpact.migrationRequiredForImplementation ? "YES" : "NO"}`,
    "",
    "This report is simulation-only. It performs no scheduler transition or write.",
  );
  return lines.join("\n");
}
