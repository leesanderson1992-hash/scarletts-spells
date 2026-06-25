import type {
  ReturnedCorrectionRepairCatalogEntry,
  ReturnedCorrectionRepairEvidence,
  ReturnedCorrectionRepairFinalClassification,
  ReturnedCorrectionRepairIssue,
  ReturnedCorrectionRepairLearningLink,
} from "./returned-correction-repair";
import type { ReturnedCorrectionRouteBridgeAttempt } from "./returned-correction-route-bridge";

export type ReturnedCorrectionDeferredRouteReplayCanonicalMapping = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string;
  source_case_id: string | null;
};

export type ReturnedCorrectionDeferredRouteReplayAdminDecision = {
  id: string;
  case_id: string;
  decision_type: string;
  new_status: string;
  linked_micro_skill_key: string | null;
  canonical_mapping_id: string | null;
};

export type ReturnedCorrectionDeferredRouteReplayCatalogReviewCase = {
  id: string;
  source_misspelling_instance_id: string;
  case_status: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
};

export type ReturnedCorrectionDeferredRouteReplayPlanInput = {
  issue: ReturnedCorrectionRepairIssue;
  attempts: ReturnedCorrectionRouteBridgeAttempt[];
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  catalogReviewCases: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  canonicalMappings: ReturnedCorrectionDeferredRouteReplayCanonicalMapping[];
  adminDecisions: ReturnedCorrectionDeferredRouteReplayAdminDecision[];
  learningItemLinks: ReturnedCorrectionRepairLearningLink[];
  learningItemEvidence: ReturnedCorrectionRepairEvidence[];
};

export type ReturnedCorrectionDeferredRouteReplayBucket =
  | "already_linked"
  | "replayable_canonical_mapping"
  | "replayable_admin_decision"
  | "replayable_durable_route"
  | "waiting_for_route"
  | "unsafe_manual_review"
  | "skipped_non_learning_outcome";

export type ReturnedCorrectionDeferredRouteReplayRouteSource =
  | "canonical_mapping"
  | "admin_decision"
  | "durable_issue";

export type ReturnedCorrectionDeferredRouteReplayProposedMutation =
  | {
      type: "attach_verified_route";
      writingIssueId: string;
      microSkillKey: string;
      routeSource: ReturnedCorrectionDeferredRouteReplayRouteSource;
      canonicalMappingId?: string | null;
      adminDecisionId?: string | null;
      adminCaseId?: string | null;
    }
  | {
      type: "create_or_strengthen_learning_item";
      writingIssueId: string;
      microSkillKey: string;
      routeSource: ReturnedCorrectionDeferredRouteReplayRouteSource;
      canonicalMappingId?: string | null;
      adminDecisionId?: string | null;
      adminCaseId?: string | null;
    };

export type ReturnedCorrectionDeferredRouteReplayPlan = {
  issueId: string;
  childId: string;
  submissionId: string | null;
  returnedSubmissionIds: string[];
  sourceMisspellingInstanceId: string | null;
  observedText: string | null;
  correctionText: string | null;
  normalizedMisspelling: string | null;
  normalizedCorrection: string | null;
  finalClassification: ReturnedCorrectionRepairFinalClassification | null;
  durableMicroSkillKey: string | null;
  existingLearningItemIds: string[];
  existingIssueLinkIds: string[];
  evidenceCount: number;
  routeSupport: {
    source: ReturnedCorrectionDeferredRouteReplayRouteSource | null;
    microSkillKey: string | null;
    canonicalMappingId: string | null;
    adminDecisionId: string | null;
    adminCaseId: string | null;
  };
  catalog: {
    microSkillKey: string | null;
    exists: boolean;
    active: boolean;
    assignable: boolean;
    practiceRoute: string | null;
  };
  bucket: ReturnedCorrectionDeferredRouteReplayBucket;
  proposedAction: string;
  proposedMutations: ReturnedCorrectionDeferredRouteReplayProposedMutation[];
  safeToApply: boolean;
  reasons: string[];
};

export type ReturnedCorrectionDeferredRouteReplaySummary = {
  scanned: number;
  alreadyLinked: number;
  waitingForRoute: number;
  replayableViaCanonicalMapping: number;
  replayableViaAdminDecision: number;
  replayableViaDurableRoute: number;
  unsafeManualReview: number;
  skippedNonLearningOutcome: number;
};

const LEARNING_RELEVANT_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
]);

function normalizeSpelling(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function hasMeaningfulMicroSkillKey(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function buildEmptyRouteSupport() {
  return {
    source: null,
    microSkillKey: null,
    canonicalMappingId: null,
    adminDecisionId: null,
    adminCaseId: null,
  } satisfies ReturnedCorrectionDeferredRouteReplayPlan["routeSupport"];
}

function getCatalogState(input: {
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  microSkillKey: string | null;
}): ReturnedCorrectionDeferredRouteReplayPlan["catalog"] {
  const catalog = input.microSkillKey
    ? input.catalogEntries.find(
        (entry) => entry.micro_skill_key === input.microSkillKey,
      ) ?? null
    : null;

  return {
    microSkillKey: input.microSkillKey,
    exists: Boolean(catalog),
    active: Boolean(catalog?.is_active),
    assignable: Boolean(catalog?.is_assignable),
    practiceRoute: catalog?.practice_route ?? null,
  };
}

function isRouteActiveAssignable(input: {
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  microSkillKey: string | null;
}) {
  const catalog = input.microSkillKey
    ? input.catalogEntries.find(
        (entry) => entry.micro_skill_key === input.microSkillKey,
      ) ?? null
    : null;

  return Boolean(catalog?.is_active) && Boolean(catalog?.is_assignable);
}

function getRouteCandidate(input: {
  issue: ReturnedCorrectionRepairIssue;
  catalogReviewCases: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  canonicalMappings: ReturnedCorrectionDeferredRouteReplayCanonicalMapping[];
  adminDecisions: ReturnedCorrectionDeferredRouteReplayAdminDecision[];
}) {
  const normalizedMisspelling = normalizeSpelling(input.issue.observed_text);
  const normalizedCorrection = normalizeSpelling(
    input.issue.approved_replacement ?? input.issue.suggested_replacement,
  );
  const matchingCase = input.catalogReviewCases.find(
    (reviewCase) =>
      reviewCase.source_misspelling_instance_id ===
      input.issue.source_misspelling_instance_id,
  );
  const pairMisspelling =
    matchingCase?.misspelling_normalized ?? normalizedMisspelling;
  const pairCorrection =
    matchingCase?.correct_spelling_normalized ?? normalizedCorrection;
  const activeCanonicalMappings = input.canonicalMappings.filter(
    (mapping) =>
      mapping.mapping_status === "active" &&
      mapping.misspelling_normalized === pairMisspelling &&
      mapping.correct_spelling_normalized === pairCorrection,
  );
  const explicitAdminDecisions = input.adminDecisions.filter((decision) => {
    if (!matchingCase || decision.case_id !== matchingCase.id) {
      return false;
    }

    if (
      decision.decision_type === "linked_existing_skill" &&
      hasMeaningfulMicroSkillKey(decision.linked_micro_skill_key)
    ) {
      return true;
    }

    if (
      decision.decision_type === "add_canonical_mapping" &&
      hasMeaningfulMicroSkillKey(decision.linked_micro_skill_key)
    ) {
      return true;
    }

    return Boolean(
      decision.canonical_mapping_id &&
        activeCanonicalMappings.some(
          (mapping) => mapping.id === decision.canonical_mapping_id,
        ),
    );
  });

  return {
    normalizedMisspelling: pairMisspelling,
    normalizedCorrection: pairCorrection,
    matchingCase: matchingCase ?? null,
    activeCanonicalMappings,
    explicitAdminDecisions,
  };
}

export function buildReturnedCorrectionDeferredRouteReplayPlan(
  input: ReturnedCorrectionDeferredRouteReplayPlanInput,
): ReturnedCorrectionDeferredRouteReplayPlan {
  const issueLinks = input.learningItemLinks.filter(
    (link) => link.writing_issue_id === input.issue.id,
  );
  const issueEvidence = input.learningItemEvidence.filter(
    (evidence) => evidence.writing_issue_id === input.issue.id,
  );
  const existingLearningItemIds = uniqueValues(
    issueLinks.map((link) => link.learning_item_id),
  );
  const returnedSubmissionIds = uniqueValues(
    input.attempts
      .map((attempt) => attempt.task_submission_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const routeCandidate = getRouteCandidate({
    issue: input.issue,
    catalogReviewCases: input.catalogReviewCases,
    canonicalMappings: input.canonicalMappings,
    adminDecisions: input.adminDecisions,
  });
  const base = {
    issueId: input.issue.id,
    childId: input.issue.child_id,
    submissionId: input.issue.task_submission_id,
    returnedSubmissionIds,
    sourceMisspellingInstanceId: input.issue.source_misspelling_instance_id,
    observedText: input.issue.observed_text,
    correctionText:
      input.issue.approved_replacement ?? input.issue.suggested_replacement ?? null,
    normalizedMisspelling: routeCandidate.normalizedMisspelling,
    normalizedCorrection: routeCandidate.normalizedCorrection,
    finalClassification: input.issue.final_classification,
    durableMicroSkillKey: input.issue.micro_skill_key,
    existingLearningItemIds,
    existingIssueLinkIds: issueLinks.map((link) => link.id),
    evidenceCount: issueEvidence.length,
  };
  const noMutation = (inputPlan: {
    bucket: ReturnedCorrectionDeferredRouteReplayBucket;
    proposedAction: string;
    reasons: string[];
    routeSupport?: ReturnedCorrectionDeferredRouteReplayPlan["routeSupport"];
    catalogMicroSkillKey?: string | null;
  }) =>
    ({
      ...base,
      routeSupport: inputPlan.routeSupport ?? buildEmptyRouteSupport(),
      catalog: getCatalogState({
        catalogEntries: input.catalogEntries,
        microSkillKey: inputPlan.catalogMicroSkillKey ?? null,
      }),
      bucket: inputPlan.bucket,
      proposedAction: inputPlan.proposedAction,
      proposedMutations: [],
      safeToApply: false,
      reasons: inputPlan.reasons,
    }) satisfies ReturnedCorrectionDeferredRouteReplayPlan;

  const learningRelevant = LEARNING_RELEVANT_CLASSIFICATIONS.has(
    input.issue.final_classification ?? "",
  );

  if (!input.issue.final_classification) {
    return noMutation({
      bucket: "waiting_for_route",
      proposedAction: "none",
      reasons: ["No final classification is present yet."],
    });
  }

  if (!learningRelevant) {
    return noMutation({
      bucket: "skipped_non_learning_outcome",
      proposedAction: "none",
      reasons: [
        "Final classification is non-learning and must not create a learning item.",
      ],
    });
  }

  if (issueLinks.length > 0) {
    return noMutation({
      bucket: "already_linked",
      proposedAction: "none",
      reasons: ["A learning item issue link already exists for this writing issue."],
    });
  }

  if (issueEvidence.length > 0) {
    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      reasons: [
        "Learning item evidence exists for this issue without an issue link; manual review is required before replay.",
      ],
    });
  }

  if (input.attempts.length === 0) {
    return noMutation({
      bucket: "waiting_for_route",
      proposedAction: "none",
      reasons: ["No child retry or returned-correction attempt evidence exists."],
    });
  }

  if (!input.issue.source_misspelling_instance_id) {
    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      reasons: ["Missing source misspelling lineage."],
    });
  }

  if (input.issue.issue_status !== "finalised") {
    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      reasons: [
        "Learning-relevant final classification is present, but issue state is not finalised.",
      ],
    });
  }

  if (!routeCandidate.normalizedMisspelling || !routeCandidate.normalizedCorrection) {
    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      reasons: ["Missing normalized spelling/correction pair."],
    });
  }

  const durableKey = hasMeaningfulMicroSkillKey(input.issue.micro_skill_key)
    ? input.issue.micro_skill_key
    : null;
  if (durableKey) {
    const routeSupport = {
      source: "durable_issue",
      microSkillKey: durableKey,
      canonicalMappingId: null,
      adminDecisionId: null,
      adminCaseId: routeCandidate.matchingCase?.id ?? null,
    } satisfies ReturnedCorrectionDeferredRouteReplayPlan["routeSupport"];

    if (
      isRouteActiveAssignable({
        catalogEntries: input.catalogEntries,
        microSkillKey: durableKey,
      })
    ) {
      return {
        ...base,
        routeSupport,
        catalog: getCatalogState({
          catalogEntries: input.catalogEntries,
          microSkillKey: durableKey,
        }),
        bucket: "replayable_durable_route",
        proposedAction: "create_or_strengthen_learning_item",
        proposedMutations: [
          {
            type: "create_or_strengthen_learning_item",
            writingIssueId: input.issue.id,
            microSkillKey: durableKey,
            routeSource: "durable_issue",
            adminCaseId: routeCandidate.matchingCase?.id ?? null,
          },
        ],
        safeToApply: true,
        reasons: [
          "Learning-relevant finalised row already has an active assignable durable route.",
        ],
      };
    }

    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      routeSupport,
      catalogMicroSkillKey: durableKey,
      reasons: [
        "Durable route exists but the catalog row is inactive or non-assignable.",
      ],
    });
  }

  const activeCanonicalMappings = routeCandidate.activeCanonicalMappings;
  const canonicalKeys = uniqueValues(
    activeCanonicalMappings.map((mapping) => mapping.micro_skill_key),
  );
  if (canonicalKeys.length > 1 || activeCanonicalMappings.length > 1) {
    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      reasons: ["Multiple active canonical mappings match this deferred row."],
    });
  }

  const adminDecisions = routeCandidate.explicitAdminDecisions;
  const adminDecisionKeys = uniqueValues(
    adminDecisions
      .map((decision) => {
        if (hasMeaningfulMicroSkillKey(decision.linked_micro_skill_key)) {
          return decision.linked_micro_skill_key;
        }

        const mapping = activeCanonicalMappings.find(
          (candidate) => candidate.id === decision.canonical_mapping_id,
        );
        return mapping?.micro_skill_key ?? null;
      })
      .filter((value): value is string => typeof value === "string"),
  );
  if (adminDecisionKeys.length > 1 || adminDecisions.length > 1) {
    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      reasons: ["Multiple conflicting admin route decisions match this deferred row."],
    });
  }

  const adminDecision = adminDecisions[0] ?? null;
  if (adminDecision) {
    const canonicalFromDecision = activeCanonicalMappings.find(
      (mapping) => mapping.id === adminDecision.canonical_mapping_id,
    );
    const microSkillKey =
      adminDecision.linked_micro_skill_key ?? canonicalFromDecision?.micro_skill_key ?? null;
    const routeSupport = {
      source: "admin_decision",
      microSkillKey,
      canonicalMappingId: adminDecision.canonical_mapping_id,
      adminDecisionId: adminDecision.id,
      adminCaseId: adminDecision.case_id,
    } satisfies ReturnedCorrectionDeferredRouteReplayPlan["routeSupport"];

    if (
      isRouteActiveAssignable({
        catalogEntries: input.catalogEntries,
        microSkillKey,
      })
    ) {
      return {
        ...base,
        routeSupport,
        catalog: getCatalogState({
          catalogEntries: input.catalogEntries,
          microSkillKey,
        }),
        bucket: "replayable_admin_decision",
        proposedAction: "attach_verified_route_and_create_or_strengthen_learning_item",
        proposedMutations: [
          {
            type: "attach_verified_route",
            writingIssueId: input.issue.id,
            microSkillKey: microSkillKey as string,
            routeSource: "admin_decision",
            canonicalMappingId: adminDecision.canonical_mapping_id,
            adminDecisionId: adminDecision.id,
            adminCaseId: adminDecision.case_id,
          },
          {
            type: "create_or_strengthen_learning_item",
            writingIssueId: input.issue.id,
            microSkillKey: microSkillKey as string,
            routeSource: "admin_decision",
            canonicalMappingId: adminDecision.canonical_mapping_id,
            adminDecisionId: adminDecision.id,
            adminCaseId: adminDecision.case_id,
          },
        ],
        safeToApply: true,
        reasons: [
          "Explicit admin decision supplies an active assignable route for this deferred finalised row.",
        ],
      };
    }

    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      routeSupport,
      catalogMicroSkillKey: microSkillKey,
      reasons: [
        "Admin decision route exists but the catalog row is inactive or non-assignable.",
      ],
    });
  }

  const canonicalMapping = activeCanonicalMappings[0] ?? null;
  if (canonicalMapping) {
    const routeSupport = {
      source: "canonical_mapping",
      microSkillKey: canonicalMapping.micro_skill_key,
      canonicalMappingId: canonicalMapping.id,
      adminDecisionId: null,
      adminCaseId: canonicalMapping.source_case_id ?? routeCandidate.matchingCase?.id ?? null,
    } satisfies ReturnedCorrectionDeferredRouteReplayPlan["routeSupport"];

    if (
      isRouteActiveAssignable({
        catalogEntries: input.catalogEntries,
        microSkillKey: canonicalMapping.micro_skill_key,
      })
    ) {
      return {
        ...base,
        routeSupport,
        catalog: getCatalogState({
          catalogEntries: input.catalogEntries,
          microSkillKey: canonicalMapping.micro_skill_key,
        }),
        bucket: "replayable_canonical_mapping",
        proposedAction: "attach_verified_route_and_create_or_strengthen_learning_item",
        proposedMutations: [
          {
            type: "attach_verified_route",
            writingIssueId: input.issue.id,
            microSkillKey: canonicalMapping.micro_skill_key,
            routeSource: "canonical_mapping",
            canonicalMappingId: canonicalMapping.id,
            adminCaseId:
              canonicalMapping.source_case_id ?? routeCandidate.matchingCase?.id ?? null,
          },
          {
            type: "create_or_strengthen_learning_item",
            writingIssueId: input.issue.id,
            microSkillKey: canonicalMapping.micro_skill_key,
            routeSource: "canonical_mapping",
            canonicalMappingId: canonicalMapping.id,
            adminCaseId:
              canonicalMapping.source_case_id ?? routeCandidate.matchingCase?.id ?? null,
          },
        ],
        safeToApply: true,
        reasons: [
          "Active canonical mapping supplies an active assignable route for this deferred finalised row.",
        ],
      };
    }

    return noMutation({
      bucket: "unsafe_manual_review",
      proposedAction: "manual_review",
      routeSupport,
      catalogMicroSkillKey: canonicalMapping.micro_skill_key,
      reasons: [
        "Canonical mapping route exists but the catalog row is inactive or non-assignable.",
      ],
    });
  }

  return noMutation({
    bucket: "waiting_for_route",
    proposedAction: "defer",
    routeSupport: {
      ...buildEmptyRouteSupport(),
      adminCaseId: routeCandidate.matchingCase?.id ?? null,
    },
    reasons: [
      routeCandidate.matchingCase
        ? "Admin review case is still waiting for active assignable route support."
        : "No active canonical/admin route support is available for this deferred row.",
    ],
  });
}

export function summarizeReturnedCorrectionDeferredRouteReplayPlans(
  plans: ReturnedCorrectionDeferredRouteReplayPlan[],
): ReturnedCorrectionDeferredRouteReplaySummary {
  return {
    scanned: plans.length,
    alreadyLinked: plans.filter((plan) => plan.bucket === "already_linked").length,
    waitingForRoute: plans.filter((plan) => plan.bucket === "waiting_for_route")
      .length,
    replayableViaCanonicalMapping: plans.filter(
      (plan) => plan.bucket === "replayable_canonical_mapping",
    ).length,
    replayableViaAdminDecision: plans.filter(
      (plan) => plan.bucket === "replayable_admin_decision",
    ).length,
    replayableViaDurableRoute: plans.filter(
      (plan) => plan.bucket === "replayable_durable_route",
    ).length,
    unsafeManualReview: plans.filter(
      (plan) => plan.bucket === "unsafe_manual_review",
    ).length,
    skippedNonLearningOutcome: plans.filter(
      (plan) => plan.bucket === "skipped_non_learning_outcome",
    ).length,
  };
}
