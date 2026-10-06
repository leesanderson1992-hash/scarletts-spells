export const SEED_IMPORT_REVIEW_DECISIONS = [
  "keep_pending",
  "reject",
  "mark_duplicate",
  "mark_conflict_blocked",
  "nominate_for_canonical_adoption",
  "supersede",
] as const;

export type SeedImportReviewDecision =
  (typeof SEED_IMPORT_REVIEW_DECISIONS)[number];

export type SeedImportReviewRowStatus =
  | "pending_candidate_review"
  | "manual_review_required"
  | "kept_pending"
  | "rejected"
  | "duplicate"
  | "conflict_blocked"
  | "nominated_for_canonical_adoption"
  | "adopted_hidden_canonical"
  | "superseded";

export type SeedImportReviewDecisionRow = {
  id: string;
  row_status: SeedImportReviewRowStatus;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  dialect_code: string;
};

export type SeedImportReviewDecisionInput = {
  decision: SeedImportReviewDecision;
  rowId: string;
  statusReason: string | null;
  reviewNote: string | null;
  duplicateOfSeedImportRowId: string | null;
};

export type SeedImportReviewValidationResult =
  | {
      ok: true;
      rowStatus: Exclude<SeedImportReviewRowStatus, "adopted_hidden_canonical">;
      duplicateOfSeedImportRowId: string | null;
    }
  | {
      ok: false;
      message: string;
    };

const NON_ADOPTED_STATUSES: SeedImportReviewRowStatus[] = [
  "pending_candidate_review",
  "manual_review_required",
  "kept_pending",
  "rejected",
  "duplicate",
  "conflict_blocked",
  "nominated_for_canonical_adoption",
  "superseded",
];

const DECISION_TARGET_STATUS = {
  keep_pending: "kept_pending",
  reject: "rejected",
  mark_duplicate: "duplicate",
  mark_conflict_blocked: "conflict_blocked",
  nominate_for_canonical_adoption: "nominated_for_canonical_adoption",
  supersede: "superseded",
} as const satisfies Record<
  SeedImportReviewDecision,
  Exclude<SeedImportReviewRowStatus, "adopted_hidden_canonical">
>;

const ALLOWED_STARTING_STATUSES = {
  keep_pending: NON_ADOPTED_STATUSES,
  reject: NON_ADOPTED_STATUSES,
  mark_duplicate: NON_ADOPTED_STATUSES,
  mark_conflict_blocked: [
    "pending_candidate_review",
    "kept_pending",
    "nominated_for_canonical_adoption",
  ],
  nominate_for_canonical_adoption: [
    "pending_candidate_review",
    "kept_pending",
    "conflict_blocked",
  ],
  supersede: NON_ADOPTED_STATUSES,
} as const satisfies Record<
  SeedImportReviewDecision,
  readonly SeedImportReviewRowStatus[]
>;

export function normaliseSeedImportReviewDecision(
  value: string,
): SeedImportReviewDecision | null {
  return SEED_IMPORT_REVIEW_DECISIONS.includes(
    value as SeedImportReviewDecision,
  )
    ? (value as SeedImportReviewDecision)
    : null;
}

export function getAllowedSeedImportReviewStartingStatuses(
  decision: SeedImportReviewDecision,
) {
  return [...ALLOWED_STARTING_STATUSES[decision]];
}

function hasReasonOrNote(input: SeedImportReviewDecisionInput) {
  return Boolean(input.statusReason?.trim() || input.reviewNote?.trim());
}

function isSameDuplicateReviewScope(
  row: SeedImportReviewDecisionRow,
  duplicateTarget: SeedImportReviewDecisionRow,
) {
  return (
    row.misspelling_normalized === duplicateTarget.misspelling_normalized &&
    row.correct_spelling_normalized ===
      duplicateTarget.correct_spelling_normalized &&
    row.dialect_code === duplicateTarget.dialect_code
  );
}

export function validateSeedImportReviewDecision(input: {
  decisionInput: SeedImportReviewDecisionInput;
  row: SeedImportReviewDecisionRow | null;
  duplicateTarget: SeedImportReviewDecisionRow | null;
}): SeedImportReviewValidationResult {
  const { decisionInput, duplicateTarget, row } = input;

  if (!row) {
    return { ok: false, message: "Seed import row was not found." };
  }

  const allowedStartingStatuses = ALLOWED_STARTING_STATUSES[
    decisionInput.decision
  ] as readonly SeedImportReviewRowStatus[];

  if (!allowedStartingStatuses.includes(row.row_status)) {
    return {
      ok: false,
      message: `Cannot apply ${decisionInput.decision} from ${row.row_status}.`,
    };
  }

  if (decisionInput.decision === "keep_pending") {
    return {
      ok: true,
      duplicateOfSeedImportRowId: null,
      rowStatus: DECISION_TARGET_STATUS[decisionInput.decision],
    };
  }

  if (decisionInput.decision === "nominate_for_canonical_adoption") {
    if (!decisionInput.reviewNote?.trim()) {
      return {
        ok: false,
        message:
          "Nomination requires a review note explaining why later adoption review is warranted.",
      };
    }

    return {
      ok: true,
      duplicateOfSeedImportRowId: null,
      rowStatus: DECISION_TARGET_STATUS[decisionInput.decision],
    };
  }

  if (!hasReasonOrNote(decisionInput)) {
    return {
      ok: false,
      message: "This decision requires a status reason or review note.",
    };
  }

  if (decisionInput.decision !== "mark_duplicate") {
    return {
      ok: true,
      duplicateOfSeedImportRowId: null,
      rowStatus: DECISION_TARGET_STATUS[decisionInput.decision],
    };
  }

  if (!decisionInput.duplicateOfSeedImportRowId) {
    return {
      ok: false,
      message: "Duplicate decisions require another seed import row id.",
    };
  }

  if (decisionInput.duplicateOfSeedImportRowId === row.id) {
    return {
      ok: false,
      message: "A seed import row cannot be marked as a duplicate of itself.",
    };
  }

  if (!duplicateTarget) {
    return {
      ok: false,
      message: "Duplicate target seed import row was not found.",
    };
  }

  if (!isSameDuplicateReviewScope(row, duplicateTarget)) {
    return {
      ok: false,
      message:
        "Duplicate target must share the same normalized misspelling, correction, and dialect.",
    };
  }

  return {
    ok: true,
    duplicateOfSeedImportRowId: duplicateTarget.id,
    rowStatus: DECISION_TARGET_STATUS[decisionInput.decision],
  };
}
