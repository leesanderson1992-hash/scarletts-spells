import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCanonicalIntakeEnabled } from "@/lib/adle/canonical-intake";
import { continueResolvedHistoricalOccurrence } from "@/lib/adle/canonical-intake/governed-source-continuation";
import {
  applyReturnedCorrectionDeferredRouteReplayPlan,
  loadReturnedCorrectionDeferredRouteReplay,
} from "@/lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply";

export function hasAppliedGovernedUnknownErrorReplay(issue: {
  metadata?: Record<string, unknown> | null;
  source_misspelling_instance_id?: string | null;
}) {
  const replay = issue.metadata?.returned_correction_stage_f_replay;
  return Boolean(
    issue.source_misspelling_instance_id &&
    replay &&
    typeof replay === "object" &&
    !Array.isArray(replay) &&
    (replay as Record<string, unknown>).action === "attached_verified_route" &&
    (replay as Record<string, unknown>).route_source === "admin_decision" &&
    (replay as Record<string, unknown>).dry_run_first === true,
  );
}

type ContinuationDependencies = {
  enabled: () => boolean;
  load: typeof loadReturnedCorrectionDeferredRouteReplay;
  apply: typeof applyReturnedCorrectionDeferredRouteReplayPlan;
  continueOccurrence: typeof continueResolvedHistoricalOccurrence;
};

const defaultDependencies: ContinuationDependencies = {
  enabled: isCanonicalIntakeEnabled,
  load: loadReturnedCorrectionDeferredRouteReplay,
  apply: applyReturnedCorrectionDeferredRouteReplayPlan,
  continueOccurrence: continueResolvedHistoricalOccurrence,
};

/**
 * Continues one explicit admin catalog decision through the released Stage-F
 * repair and canonical-intake authorities. Unsafe or incomplete plans remain
 * visible as blocked work; this function never guesses a route.
 */
export async function continueUnknownErrorAfterAdminDecision(input: {
  serviceClient: SupabaseClient;
  adminCaseId: string;
  nowIso?: string;
  dependencies?: Partial<ContinuationDependencies>;
}) {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  if (!dependencies.enabled()) {
    return {
      status: "disabled" as const,
      appliedIssueIds: [],
      blockedIssueIds: [],
      canonicalIntakeCandidateIds: [],
    };
  }

  const loaded = await dependencies.load({
    supabase: input.serviceClient,
    scope: { adminCaseId: input.adminCaseId, limit: 100 },
  });
  const appliedIssueIds: string[] = [];
  const blockedIssueIds: string[] = [];
  const canonicalIntakeCandidateIds: string[] = [];
  const nowIso = input.nowIso ?? new Date().toISOString();

  for (const plan of loaded.plans) {
    const issue = loaded.issues.find((row) => row.id === plan.issueId);
    if (!issue || !issue.source_misspelling_instance_id) {
      blockedIssueIds.push(plan.issueId);
      continue;
    }

    if (hasAppliedGovernedUnknownErrorReplay(issue)) {
      const continuation = await dependencies.continueOccurrence({
        serviceClient: input.serviceClient,
        occurrenceId: issue.source_misspelling_instance_id,
        parentUserId: issue.parent_user_id,
        childId: issue.child_id,
      });
      canonicalIntakeCandidateIds.push(continuation.canonicalIntakeCandidateId);
      appliedIssueIds.push(issue.id);
      continue;
    }

    if (!plan.safeToApply || plan.routeSupport.source !== "admin_decision") {
      blockedIssueIds.push(plan.issueId);
      continue;
    }

    const result = await dependencies.apply({
      supabase: input.serviceClient,
      issue,
      attempts: loaded.attempts.filter(
        (attempt) => attempt.writing_issue_id === issue.id,
      ),
      plan,
      catalogEntries: loaded.catalogEntries,
      nowIso,
    });
    if (!result.repaired) {
      blockedIssueIds.push(plan.issueId);
      continue;
    }

    const continuation = await dependencies.continueOccurrence({
      serviceClient: input.serviceClient,
      occurrenceId: issue.source_misspelling_instance_id,
      parentUserId: issue.parent_user_id,
      childId: issue.child_id,
    });
    canonicalIntakeCandidateIds.push(continuation.canonicalIntakeCandidateId);
    appliedIssueIds.push(issue.id);
  }

  return {
    status:
      blockedIssueIds.length > 0
        ? ("partially_blocked" as const)
        : ("processed" as const),
    appliedIssueIds: [...new Set(appliedIssueIds)].sort(),
    blockedIssueIds: [...new Set(blockedIssueIds)].sort(),
    canonicalIntakeCandidateIds: [
      ...new Set(canonicalIntakeCandidateIds),
    ].sort(),
  };
}
