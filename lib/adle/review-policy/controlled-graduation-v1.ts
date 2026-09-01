import { CONTROLLED_GRADUATION_POLICY_VERSION, type SchedulerCheckOutcome } from "./contracts";

export type ControlledOpportunityResult = {
  eventId: string;
  outcome: SchedulerCheckOutcome;
};

export type ControlledGraduationV1Decision = {
  policyVersion: typeof CONTROLLED_GRADUATION_POLICY_VERSION;
  decisionKind: "GOVERNED_OR_PAIR";
  coverWrite: ControlledOpportunityResult;
  sentenceDictation: ControlledOpportunityResult;
  decision: "PASS" | "NOT_PASSED";
  reason: "CONTROLLED_OR_PASS" | "CONTROLLED_BOTH_FAILED";
};

export type LaterCleanControlledProductionDecision = {
  policyVersion: typeof CONTROLLED_GRADUATION_POLICY_VERSION;
  decisionKind: "LATER_CLEAN_CONTROLLED_PRODUCTION";
  source: ControlledOpportunityResult;
  decision: "PASS" | "NOT_PASSED";
  reason: "LATER_CLEAN_CONTROLLED_PASS" | "LATER_CONTROLLED_PRODUCTION_FAILED";
};

/**
 * Only the two governed, independently identified opportunities vote. Repair
 * is intentionally absent from this input contract and therefore cannot
 * graduate a word or overwrite either source result.
 */
export function decideControlledGraduationV1(input: {
  coverWrite: ControlledOpportunityResult;
  sentenceDictation: ControlledOpportunityResult;
}): ControlledGraduationV1Decision {
  const passed = input.coverWrite.outcome === "pass" || input.sentenceDictation.outcome === "pass";
  return {
    policyVersion: CONTROLLED_GRADUATION_POLICY_VERSION,
    decisionKind: "GOVERNED_OR_PAIR",
    coverWrite: { ...input.coverWrite },
    sentenceDictation: { ...input.sentenceDictation },
    decision: passed ? "PASS" : "NOT_PASSED",
    reason: passed ? "CONTROLLED_OR_PASS" : "CONTROLLED_BOTH_FAILED",
  };
}
/** A later clean controlled production is a new decision, never a rewrite of
 * the original Cover-Write/dictation pair. Eligibility is validated by the
 * future source adapter; this pure helper only preserves its singular result. */
export function decideLaterCleanControlledProductionV1(
  source: ControlledOpportunityResult,
): LaterCleanControlledProductionDecision {
  const passed = source.outcome === "pass";
  return {
    policyVersion: CONTROLLED_GRADUATION_POLICY_VERSION,
    decisionKind: "LATER_CLEAN_CONTROLLED_PRODUCTION",
    source: { ...source },
    decision: passed ? "PASS" : "NOT_PASSED",
    reason: passed ? "LATER_CLEAN_CONTROLLED_PASS" : "LATER_CONTROLLED_PRODUCTION_FAILED",
  };
}
