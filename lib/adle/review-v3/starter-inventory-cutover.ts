import { createHash } from "node:crypto";

import { PER_WORD_REVIEW_SCHEDULE_VERSION_V1 } from "./per-word-scheduler";

export type StarterInventoryClassification =
  | "eligible_starter"
  | "already_reviewed"
  | "ambiguous"
  | "excluded";

export interface StarterInventoryCandidateV1 {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  bundleId: string;
  canonicalActive: boolean;
  scheduleActive: boolean;
  bundleActive: boolean;
  membershipStatus: string;
  catchUpStage: number;
  nextRetestDueOn: string | null;
  failedReviewOn: string | null;
  preRetirementCheckDueOn: string | null;
  taughtHistoryCount: number;
  sourceLineageCount: number;
  bundleIntervalIndex: number;
  bundleNextDueOn: string;
  bundlePolicyVersion: string;
  matchingCompletedOutcomeCount: number;
  mismatchedCompletedOutcomeCount: number;
  orphanScheduledAttemptCount: number;
  incompleteEncounterCount: number;
  wordScheduleVersion: string | null;
  wordIntervalIndex: number | null;
  wordNextDueOn: string | null;
  wordSchedulePolicyVersion: string | null;
}

export interface StarterInventoryAuditRowV1 {
  scheduleWordId: string;
  childId: string;
  classification: StarterInventoryClassification;
  reasonCodes: readonly string[];
}

export interface StarterInventoryAuditV1 {
  rows: readonly StarterInventoryAuditRowV1[];
  counts: Record<StarterInventoryClassification, number>;
  fingerprint: string;
}

function classifyCandidate(candidate: StarterInventoryCandidateV1): StarterInventoryAuditRowV1 {
  const reasons: string[] = [];
  const inactive = !candidate.canonicalActive || !candidate.scheduleActive || !candidate.bundleActive;
  const contradictoryHistory = candidate.matchingCompletedOutcomeCount > 0 ||
    candidate.mismatchedCompletedOutcomeCount > 0 ||
    candidate.orphanScheduledAttemptCount > 0 ||
    candidate.incompleteEncounterCount > 0 ||
    candidate.wordScheduleVersion !== null;
  if (inactive) {
    if (!candidate.canonicalActive) reasons.push("canonical_inactive");
    if (!candidate.scheduleActive) reasons.push("schedule_inactive");
    if (!candidate.bundleActive) reasons.push("bundle_inactive");
    if (contradictoryHistory) reasons.push("inactive_with_schedule_history");
    return {
      scheduleWordId: candidate.scheduleWordId,
      childId: candidate.childId,
      classification: contradictoryHistory ? "ambiguous" : "excluded",
      reasonCodes: reasons.sort(),
    };
  }

  if (candidate.matchingCompletedOutcomeCount > 0) {
    if (candidate.matchingCompletedOutcomeCount !== 1) reasons.push("duplicate_completed_outcomes");
    if (candidate.mismatchedCompletedOutcomeCount > 0) reasons.push("mismatched_completed_outcome");
    if (candidate.incompleteEncounterCount > 0) reasons.push("outcome_with_incomplete_encounter");
    return {
      scheduleWordId: candidate.scheduleWordId,
      childId: candidate.childId,
      classification: reasons.length === 0 ? "already_reviewed" : "ambiguous",
      reasonCodes: reasons.length === 0 ? ["matching_completed_outcome"] : reasons.sort(),
    };
  }

  if (candidate.membershipStatus !== "scheduled") reasons.push("not_initial_scheduled_membership");
  if (candidate.catchUpStage !== 0 || candidate.nextRetestDueOn !== null || candidate.failedReviewOn !== null) {
    reasons.push("failure_or_catch_up_history");
  }
  if (candidate.preRetirementCheckDueOn !== null) reasons.push("pre_retirement_history");
  if (candidate.taughtHistoryCount < 1) reasons.push("missing_taught_history");
  if (candidate.sourceLineageCount < 1) reasons.push("missing_source_lineage");
  if (candidate.bundleIntervalIndex !== 0) reasons.push("unexplained_interval_advancement");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.bundleNextDueOn)) reasons.push("invalid_existing_due_date");
  if (candidate.bundlePolicyVersion.trim() === "") reasons.push("invalid_policy_version");
  if (candidate.mismatchedCompletedOutcomeCount > 0) reasons.push("mismatched_completed_outcome");
  if (candidate.orphanScheduledAttemptCount > 0) reasons.push("orphan_scheduled_attempt");
  if (candidate.incompleteEncounterCount > 0) reasons.push("incomplete_review_encounter");

  const allWordFieldsNull = candidate.wordScheduleVersion === null &&
    candidate.wordIntervalIndex === null && candidate.wordNextDueOn === null &&
    candidate.wordSchedulePolicyVersion === null;
  const exactWordAuthority = candidate.wordScheduleVersion === PER_WORD_REVIEW_SCHEDULE_VERSION_V1 &&
    candidate.wordIntervalIndex === candidate.bundleIntervalIndex &&
    candidate.wordNextDueOn === candidate.bundleNextDueOn &&
    candidate.wordSchedulePolicyVersion === candidate.bundlePolicyVersion;
  if (!allWordFieldsNull && !exactWordAuthority) reasons.push("conflicting_per_word_authority");

  return {
    scheduleWordId: candidate.scheduleWordId,
    childId: candidate.childId,
    classification: reasons.length === 0 ? "eligible_starter" : "ambiguous",
    reasonCodes: reasons.length === 0 ? ["never_reviewed_pending_word"] : reasons.sort(),
  };
}

export function auditStarterInventoryV1(
  candidates: readonly StarterInventoryCandidateV1[],
  childScope?: readonly string[],
): StarterInventoryAuditV1 {
  const scope = childScope === undefined ? null : new Set(childScope);
  const rows = candidates
    .filter((candidate) => scope === null || scope.has(candidate.childId))
    .map(classifyCandidate)
    .sort((left, right) => left.childId.localeCompare(right.childId) ||
      left.scheduleWordId.localeCompare(right.scheduleWordId));
  const counts: StarterInventoryAuditV1["counts"] = {
    eligible_starter: 0,
    already_reviewed: 0,
    ambiguous: 0,
    excluded: 0,
  };
  for (const row of rows) counts[row.classification] += 1;
  const fingerprint = createHash("sha256").update(JSON.stringify({ rows, counts })).digest("hex");
  return { rows, counts, fingerprint };
}

export function applyScopedStarterCutoverV1(input: {
  candidates: readonly StarterInventoryCandidateV1[];
  childScope: readonly string[];
  approvedFingerprint: string;
}): StarterInventoryCandidateV1[] {
  const sortedScope = [...new Set(input.childScope)].sort();
  if (sortedScope.length === 0 || sortedScope.length !== input.childScope.length) {
    throw new Error("invalid_explicit_child_scope");
  }
  const audit = auditStarterInventoryV1(input.candidates, sortedScope);
  if (audit.fingerprint !== input.approvedFingerprint) throw new Error("starter_audit_fingerprint_drift");
  if (audit.counts.ambiguous > 0) throw new Error("ambiguous_starter_inventory");
  const eligibleIds = new Set(audit.rows
    .filter((row) => row.classification === "eligible_starter")
    .map((row) => row.scheduleWordId));
  return input.candidates.map((candidate) => eligibleIds.has(candidate.scheduleWordId)
    ? {
        ...candidate,
        wordScheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
        wordIntervalIndex: candidate.bundleIntervalIndex,
        wordNextDueOn: candidate.bundleNextDueOn,
        wordSchedulePolicyVersion: candidate.bundlePolicyVersion,
      }
    : candidate);
}
