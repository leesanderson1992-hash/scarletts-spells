import {
  resolveReturnedCorrectionParentLocalRouteBridge,
  type ReturnedCorrectionRouteBridgeAttempt,
  type ReturnedCorrectionRouteBridgeCandidateMapping,
  type ReturnedCorrectionRouteBridgeCatalogEntry,
  type ReturnedCorrectionRouteBridgeIssue,
} from "./returned-correction-route-bridge";

export type ReturnedCorrectionRepairFinalClassification =
  | "checking_only"
  | "fragile_knowledge"
  | "concept_gap"
  | "transfer_failure"
  | "not_an_issue";

export type ReturnedCorrectionRepairIssue = {
  id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string | null;
  issue_status: string;
  final_classification: ReturnedCorrectionRepairFinalClassification | null;
  observed_text: string | null;
  approved_replacement: string | null;
  suggested_replacement: string | null;
  micro_skill_key: string | null;
  theme_key: string | null;
  source_misspelling_instance_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type ReturnedCorrectionRepairCatalogEntry =
  ReturnedCorrectionRouteBridgeCatalogEntry & {
    mastery_domain_key: string;
    skill_family_key: string;
    skill_cluster_key: string | null;
    practice_route: "word_practice" | "grouped_set_practice";
    display_name?: string | null;
  };

export type ReturnedCorrectionRepairLearningLink = {
  id: string;
  learning_item_id: string;
  writing_issue_id: string;
  link_role: string;
};

export type ReturnedCorrectionRepairEvidence = {
  id: string;
  learning_item_id: string;
  writing_issue_id: string | null;
  evidence_type: string;
  source_context: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ReturnedCorrectionRepairCandidateMapping =
  ReturnedCorrectionRouteBridgeCandidateMapping & {
    original_child_spelling?: string | null;
    original_correct_spelling?: string | null;
  };

export type ReturnedCorrectionRepairCatalogReviewCase = {
  id: string;
  source_misspelling_instance_id: string;
  case_status: string;
};

export type ReturnedCorrectionRepairCanonicalRecommendation = {
  id: string;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string | null;
  recommendation_status?: string | null;
};

export type ReturnedCorrectionRepairPlanInput = {
  parentUserId: string;
  issue: ReturnedCorrectionRepairIssue;
  attempts: ReturnedCorrectionRouteBridgeAttempt[];
  candidateMappings: ReturnedCorrectionRepairCandidateMapping[];
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  catalogReviewCases: ReturnedCorrectionRepairCatalogReviewCase[];
  canonicalRecommendations: ReturnedCorrectionRepairCanonicalRecommendation[];
  learningItemLinks: ReturnedCorrectionRepairLearningLink[];
  learningItemEvidence: ReturnedCorrectionRepairEvidence[];
  nowIso: string;
};

export type ReturnedCorrectionRepairBucket =
  | "no_action"
  | "repairable_durable_route"
  | "repairable_parent_local_bridge"
  | "deferred_admin_route"
  | "unsafe_manual_review"
  | "already_repaired";

export type ReturnedCorrectionRepairProposedMutation =
  | {
      type: "attach_parent_local_route";
      writingIssueId: string;
      microSkillKey: string;
      candidateMappingId: string;
    }
  | {
      type: "create_or_strengthen_learning_item";
      writingIssueId: string;
      microSkillKey: string;
      routeSource: "durable_issue" | "parent_local_promoted";
    };

export type ReturnedCorrectionRepairPlan = {
  issueId: string;
  childId: string;
  submissionId: string | null;
  returnedSubmissionIds: string[];
  observedText: string | null;
  correctionText: string | null;
  finalClassification: ReturnedCorrectionRepairFinalClassification | null;
  durableMicroSkillKey: string | null;
  parentLocalRouteStatus: string;
  adminRouteStatus: string;
  catalog: {
    microSkillKey: string | null;
    exists: boolean;
    active: boolean;
    assignable: boolean;
    practiceRoute: string | null;
  };
  existingLearningItemIds: string[];
  existingIssueLinkIds: string[];
  evidenceCount: number;
  bucket: ReturnedCorrectionRepairBucket;
  proposedAction: string;
  proposedMutations: ReturnedCorrectionRepairProposedMutation[];
  safeToApply: boolean;
  reasons: string[];
  bridgeMetadata: Record<string, unknown> | null;
};

const LEARNING_RELEVANT_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
]);

function hasMeaningfulMicroSkillKey(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function getInitialCompetencyLevel(
  finalClassification: ReturnedCorrectionRepairFinalClassification | null,
) {
  switch (finalClassification) {
    case "concept_gap":
      return 1;
    case "fragile_knowledge":
      return 2;
    case "transfer_failure":
      return 3;
    default:
      return null;
  }
}

function getCorrectionAttemptEvidenceType(input: {
  markedFixed: boolean;
  reflection: string | null;
  correctedIndependently: boolean;
}) {
  if (
    input.markedFixed &&
    input.correctedIndependently &&
    input.reflection === "easy"
  ) {
    return "corrected_independently";
  }

  if (input.markedFixed) {
    return "corrected_after_prompt";
  }

  return "incorrect_use";
}

function getMatchingParentLocalMappings(input: {
  parentUserId: string;
  issue: ReturnedCorrectionRepairIssue;
  attempts: ReturnedCorrectionRouteBridgeAttempt[];
  candidateMappings: ReturnedCorrectionRepairCandidateMapping[];
}) {
  const attemptIds = new Set(input.attempts.map((attempt) => attempt.id));
  const returnedSubmissionIds = new Set(
    input.attempts
      .map((attempt) => attempt.task_submission_id)
      .filter((value): value is string => typeof value === "string"),
  );

  return input.candidateMappings.filter((mapping) => {
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

    const correctionAttemptId = readMetadataString(
      mapping.metadata,
      "correction_attempt_id",
    );

    if (correctionAttemptId) {
      return attemptIds.has(correctionAttemptId);
    }

    return Boolean(
      mapping.task_submission_id && returnedSubmissionIds.has(mapping.task_submission_id),
    );
  });
}

export function buildReturnedCorrectionRepairPlan(
  input: ReturnedCorrectionRepairPlanInput,
): ReturnedCorrectionRepairPlan {
  const issueLinks = input.learningItemLinks.filter(
    (link) => link.writing_issue_id === input.issue.id,
  );
  const issueEvidence = input.learningItemEvidence.filter(
    (evidence) => evidence.writing_issue_id === input.issue.id,
  );
  const linkedLearningItemIds = uniqueValues(
    issueLinks.map((link) => link.learning_item_id),
  );
  const returnedSubmissionIds = uniqueValues(
    input.attempts
      .map((attempt) => attempt.task_submission_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const catalogByKey = new Map(
    input.catalogEntries.map((entry) => [entry.micro_skill_key, entry]),
  );
  const durableCatalog = hasMeaningfulMicroSkillKey(input.issue.micro_skill_key)
    ? catalogByKey.get(input.issue.micro_skill_key as string) ?? null
    : null;
  const durableRouteReady =
    Boolean(durableCatalog?.is_active) && Boolean(durableCatalog?.is_assignable);
  const learningRelevant = LEARNING_RELEVANT_CLASSIFICATIONS.has(
    input.issue.final_classification ?? "",
  );
  const adminReviewCase = input.catalogReviewCases.find(
    (reviewCase) =>
      reviewCase.source_misspelling_instance_id ===
        input.issue.source_misspelling_instance_id &&
      reviewCase.case_status === "open",
  );
  const parentRecommendations = input.canonicalRecommendations.filter(
    (recommendation) =>
      recommendation.source_misspelling_instance_id ===
      input.issue.source_misspelling_instance_id,
  );
  const matchingPromotedMappings = getMatchingParentLocalMappings({
    parentUserId: input.parentUserId,
    issue: input.issue,
    attempts: input.attempts,
    candidateMappings: input.candidateMappings,
  });
  const activeAssignablePromotedMappings = matchingPromotedMappings.filter((mapping) => {
    const entry = catalogByKey.get(mapping.micro_skill_key);

    return Boolean(entry?.is_active) && Boolean(entry?.is_assignable);
  });
  const distinctActivePromotedKeys = uniqueValues(
    activeAssignablePromotedMappings.map((mapping) => mapping.micro_skill_key),
  );
  const base = {
    issueId: input.issue.id,
    childId: input.issue.child_id,
    submissionId: input.issue.task_submission_id,
    returnedSubmissionIds,
    observedText: input.issue.observed_text,
    correctionText:
      input.issue.approved_replacement ?? input.issue.suggested_replacement ?? null,
    finalClassification: input.issue.final_classification,
    durableMicroSkillKey: input.issue.micro_skill_key,
    parentLocalRouteStatus:
      matchingPromotedMappings.length > 0
        ? `${matchingPromotedMappings.length} matching promoted mapping(s)`
        : parentRecommendations.length > 0
          ? "parent recommendation only"
          : "none",
    adminRouteStatus: adminReviewCase ? "admin_deferred_open" : "none",
    catalog: {
      microSkillKey: durableCatalog?.micro_skill_key ?? input.issue.micro_skill_key,
      exists: Boolean(durableCatalog),
      active: Boolean(durableCatalog?.is_active),
      assignable: Boolean(durableCatalog?.is_assignable),
      practiceRoute: durableCatalog?.practice_route ?? null,
    },
    existingLearningItemIds: linkedLearningItemIds,
    existingIssueLinkIds: issueLinks.map((link) => link.id),
    evidenceCount: issueEvidence.length,
    proposedMutations: [],
    bridgeMetadata: null,
  };

  const noAction = (proposedAction: string, reasons: string[]) =>
    ({
      ...base,
      bucket: "no_action",
      proposedAction,
      safeToApply: false,
      reasons,
    }) satisfies ReturnedCorrectionRepairPlan;

  const unsafe = (proposedAction: string, reasons: string[]) =>
    ({
      ...base,
      bucket: "unsafe_manual_review",
      proposedAction,
      safeToApply: false,
      reasons,
    }) satisfies ReturnedCorrectionRepairPlan;

  if (!input.issue.final_classification) {
    return noAction("none", ["No final classification is present yet."]);
  }

  if (!learningRelevant) {
    return noAction("none", [
      "Final classification is non-learning and must not create a learning item.",
    ]);
  }

  if (issueLinks.length > 0) {
    return {
      ...base,
      bucket: "already_repaired",
      proposedAction: "none",
      safeToApply: false,
      reasons: ["A learning item issue link already exists for this writing issue."],
    };
  }

  if (issueEvidence.length > 0) {
    return unsafe("manual_review", [
      "Learning item evidence exists for this issue without an issue link; manual review is required before repair.",
    ]);
  }

  if (input.attempts.length === 0) {
    return noAction("none", [
      "No child retry or returned-correction attempt evidence exists.",
    ]);
  }

  if (!input.issue.source_misspelling_instance_id) {
    return unsafe("manual_review", ["Missing source misspelling lineage."]);
  }

  if (input.issue.issue_status !== "finalised") {
    return unsafe("manual_review", [
      "Learning-relevant final classification is present, but issue state is not finalised.",
    ]);
  }

  if (durableRouteReady && durableCatalog) {
    return {
      ...base,
      bucket: "repairable_durable_route",
      proposedAction: "create_or_strengthen_learning_item",
      proposedMutations: [
        {
          type: "create_or_strengthen_learning_item",
          writingIssueId: input.issue.id,
          microSkillKey: durableCatalog.micro_skill_key,
          routeSource: "durable_issue",
        },
      ],
      safeToApply: true,
      reasons: [
        "Learning-relevant finalised row has child retry evidence and an active assignable durable route.",
      ],
    };
  }

  if (durableCatalog && (!durableCatalog.is_active || !durableCatalog.is_assignable)) {
    return unsafe("manual_review", [
      "Durable route exists but the catalog row is inactive or non-assignable.",
    ]);
  }

  if (adminReviewCase) {
    return {
      ...base,
      bucket: "deferred_admin_route",
      proposedAction: "defer",
      safeToApply: false,
      reasons: ["Route support is deferred to admin/catalog review."],
    };
  }

  if (distinctActivePromotedKeys.length > 1) {
    return unsafe("manual_review", [
      "Multiple conflicting active assignable parent-local promoted routes match this row.",
    ]);
  }

  const bridgeResolution = resolveReturnedCorrectionParentLocalRouteBridge({
    parentUserId: input.parentUserId,
    issue: input.issue satisfies ReturnedCorrectionRouteBridgeIssue,
    attempts: input.attempts,
    candidateMappings: input.candidateMappings,
    catalogEntries: input.catalogEntries,
    nowIso: input.nowIso,
  });

  if (bridgeResolution.status === "bridged") {
    const bridgeCatalog = catalogByKey.get(bridgeResolution.microSkillKey) ?? null;

    return {
      ...base,
      catalog: {
        microSkillKey: bridgeResolution.microSkillKey,
        exists: Boolean(bridgeCatalog),
        active: Boolean(bridgeCatalog?.is_active),
        assignable: Boolean(bridgeCatalog?.is_assignable),
        practiceRoute: bridgeCatalog?.practice_route ?? null,
      },
      bucket: "repairable_parent_local_bridge",
      proposedAction: "attach_parent_local_route_and_create_or_strengthen_learning_item",
      proposedMutations: [
        {
          type: "attach_parent_local_route",
          writingIssueId: input.issue.id,
          microSkillKey: bridgeResolution.microSkillKey,
          candidateMappingId: bridgeResolution.candidateMappingId,
        },
        {
          type: "create_or_strengthen_learning_item",
          writingIssueId: input.issue.id,
          microSkillKey: bridgeResolution.microSkillKey,
          routeSource: "parent_local_promoted",
        },
      ],
      bridgeMetadata: bridgeResolution.bridgeMetadata,
      safeToApply: true,
      reasons: [
        "Stage C bridge proved same parent, child, source issue, returned lineage, and active assignable catalog route.",
      ],
    };
  }

  if (parentRecommendations.length > 0) {
    return noAction("none", [
      "Parent recommendation exists, but it is route evidence only and has not been promoted.",
    ]);
  }

  if (matchingPromotedMappings.length > 0) {
    return unsafe("manual_review", [
      "Parent-local promoted route exists, but no matching active assignable catalog route is available.",
    ]);
  }

  return {
    ...base,
    bucket: "deferred_admin_route",
    proposedAction: "defer",
    safeToApply: false,
    reasons: ["No active assignable route is attached or safely bridgeable."],
  };
}

export type ReturnedCorrectionRepairSummary = {
  scanned: number;
  noAction: number;
  repairableDurableRoute: number;
  repairableParentLocalBridge: number;
  adminDeferred: number;
  unsafeManualReview: number;
  alreadyRepaired: number;
};

export function summarizeReturnedCorrectionRepairPlans(
  plans: ReturnedCorrectionRepairPlan[],
): ReturnedCorrectionRepairSummary {
  return {
    scanned: plans.length,
    noAction: plans.filter((plan) => plan.bucket === "no_action").length,
    repairableDurableRoute: plans.filter(
      (plan) => plan.bucket === "repairable_durable_route",
    ).length,
    repairableParentLocalBridge: plans.filter(
      (plan) => plan.bucket === "repairable_parent_local_bridge",
    ).length,
    adminDeferred: plans.filter((plan) => plan.bucket === "deferred_admin_route")
      .length,
    unsafeManualReview: plans.filter(
      (plan) => plan.bucket === "unsafe_manual_review",
    ).length,
    alreadyRepaired: plans.filter((plan) => plan.bucket === "already_repaired").length,
  };
}

export function getReturnedCorrectionRepairInitialCompetencyLevel(
  finalClassification: ReturnedCorrectionRepairFinalClassification | null,
) {
  return getInitialCompetencyLevel(finalClassification);
}

export function getReturnedCorrectionRepairAttemptEvidenceType(input: {
  markedFixed: boolean;
  reflection: string | null;
  correctedIndependently: boolean;
}) {
  return getCorrectionAttemptEvidenceType(input);
}
