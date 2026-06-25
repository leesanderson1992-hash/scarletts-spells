export type ReturnedCorrectionRouteBridgeIssue = {
  id: string;
  child_id: string;
  source_misspelling_instance_id: string | null;
};

export type ReturnedCorrectionRouteBridgeAttempt = {
  id: string;
  task_submission_id: string | null;
};

export type ReturnedCorrectionRouteBridgeCandidateMapping = {
  id: string;
  parent_user_id: string;
  child_id: string;
  task_submission_id: string | null;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string;
  candidate_status: string;
  promotion_scope: string;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

export type ReturnedCorrectionRouteBridgeCatalogEntry = {
  micro_skill_key: string;
  is_active: boolean;
  is_assignable: boolean;
};

export type ReturnedCorrectionRouteBridgeResolution =
  | {
      status: "bridged";
      microSkillKey: string;
      candidateMappingId: string;
      routeSource: "parent_local_promoted";
      bridgeMetadata: Record<string, unknown>;
    }
  | {
      status: "not_found";
      reason:
        | "no_source_misspelling"
        | "no_matching_promoted_mapping"
        | "no_active_assignable_catalog_route";
    };

function readMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function hasReturnedAttemptOrSubmissionMatch(input: {
  mapping: ReturnedCorrectionRouteBridgeCandidateMapping;
  attempts: ReturnedCorrectionRouteBridgeAttempt[];
}) {
  const mappedCorrectionAttemptId = readMetadataString(
    input.mapping.metadata,
    "correction_attempt_id",
  );

  if (mappedCorrectionAttemptId) {
    return input.attempts.some((attempt) => attempt.id === mappedCorrectionAttemptId);
  }

  if (input.mapping.task_submission_id) {
    return input.attempts.some(
      (attempt) => attempt.task_submission_id === input.mapping.task_submission_id,
    );
  }

  return false;
}

function compareUpdatedAtDescending(
  left: ReturnedCorrectionRouteBridgeCandidateMapping,
  right: ReturnedCorrectionRouteBridgeCandidateMapping,
) {
  return right.updated_at.localeCompare(left.updated_at);
}

export function resolveReturnedCorrectionParentLocalRouteBridge(input: {
  parentUserId: string;
  issue: ReturnedCorrectionRouteBridgeIssue;
  attempts: ReturnedCorrectionRouteBridgeAttempt[];
  candidateMappings: ReturnedCorrectionRouteBridgeCandidateMapping[];
  catalogEntries: ReturnedCorrectionRouteBridgeCatalogEntry[];
  nowIso: string;
}): ReturnedCorrectionRouteBridgeResolution {
  if (!input.issue.source_misspelling_instance_id) {
    return { status: "not_found", reason: "no_source_misspelling" };
  }

  const catalogByMicroSkill = new Map(
    input.catalogEntries.map((entry) => [entry.micro_skill_key, entry]),
  );
  const matchingMappings = input.candidateMappings
    .filter((mapping) => {
      if (
        mapping.parent_user_id !== input.parentUserId ||
        mapping.child_id !== input.issue.child_id ||
        mapping.candidate_status !== "parent_local_promoted" ||
        mapping.promotion_scope !== "parent_local" ||
        mapping.source_misspelling_instance_id !==
          input.issue.source_misspelling_instance_id
      ) {
        return false;
      }

      if (readMetadataString(mapping.metadata, "source_route") !== "returned_correction") {
        return false;
      }

      if (
        readMetadataString(mapping.metadata, "original_writing_issue_id") !==
        input.issue.id
      ) {
        return false;
      }

      return hasReturnedAttemptOrSubmissionMatch({
        mapping,
        attempts: input.attempts,
      });
    })
    .sort(compareUpdatedAtDescending);

  if (matchingMappings.length === 0) {
    return { status: "not_found", reason: "no_matching_promoted_mapping" };
  }

  const route = matchingMappings.find((mapping) => {
    const catalogEntry = catalogByMicroSkill.get(mapping.micro_skill_key);

    return Boolean(catalogEntry?.is_active) && Boolean(catalogEntry?.is_assignable);
  });

  if (!route) {
    return {
      status: "not_found",
      reason: "no_active_assignable_catalog_route",
    };
  }

  return {
    status: "bridged",
    microSkillKey: route.micro_skill_key,
    candidateMappingId: route.id,
    routeSource: "parent_local_promoted",
    bridgeMetadata: {
      source: "returned_correction_parent_local_route_bridge",
      route_source: "parent_local_promoted",
      candidate_mapping_id: route.id,
      micro_skill_key: route.micro_skill_key,
      original_writing_issue_id: input.issue.id,
      source_misspelling_instance_id: input.issue.source_misspelling_instance_id,
      correction_attempt_ids: input.attempts.map((attempt) => attempt.id),
      returned_task_submission_ids: [
        ...new Set(
          input.attempts
            .map((attempt) => attempt.task_submission_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      ],
      bridged_at: input.nowIso,
    },
  };
}
