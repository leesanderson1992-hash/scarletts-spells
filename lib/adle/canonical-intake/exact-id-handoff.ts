export const R8C_AWAITING_HANDOFF_STATE =
  "awaiting_r8c_exact_id_handoff" as const;
export const R8C_HANDED_OFF_STATE = "r8c_exact_id_handed_off" as const;

export type CanonicalIntakeHandoffState =
  | null
  | typeof R8C_AWAITING_HANDOFF_STATE
  | typeof R8C_HANDED_OFF_STATE;

export interface GovernedOccurrenceSource {
  writingIssueId: string;
  sourceMisspellingInstanceId: string;
  candidateMappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  candidateStatus: "parent_local_promoted" | "global_canonical_promoted";
  canonicalIntakeHandoffState: CanonicalIntakeHandoffState;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} requires ${key}`);
  }
  return value;
}

function requiredUuid(
  row: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = requiredString(row, key, context);
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${context} has an invalid ${key}`);
  }
  return value;
}

function uniqueKey(
  seen: Set<string>,
  value: string,
  context: string,
): void {
  if (seen.has(value)) throw new Error(`${context} contains a duplicate identity`);
  seen.add(value);
}

export function parseApprovalGovernedOccurrenceSources(
  approvalResult: unknown,
): GovernedOccurrenceSource[] {
  const approval = record(approvalResult);
  if (!approval) throw new Error("Parent approval returned no structured result");
  if (!Array.isArray(approval.governed_occurrence_sources)) {
    throw new Error("Parent approval returned no governed occurrence source set");
  }

  const candidateIds = new Set<string>();
  const occurrenceIds = new Set<string>();
  const writingIssueIds = new Set<string>();

  return approval.governed_occurrence_sources.map((value, index) => {
    const context = `Governed occurrence source ${index + 1}`;
    const row = record(value);
    if (!row) throw new Error(`${context} is malformed`);

    const writingIssueId = requiredUuid(row, "writing_issue_id", context);
    const sourceMisspellingInstanceId = requiredUuid(
      row,
      "source_misspelling_instance_id",
      context,
    );
    const candidateMappingId = requiredUuid(row, "candidate_mapping_id", context);
    const candidateStatus = requiredString(row, "candidate_status", context);
    if (
      candidateStatus !== "parent_local_promoted" &&
      candidateStatus !== "global_canonical_promoted"
    ) {
      throw new Error(`${context} is not intake-compatible`);
    }
    const handoffState = row.canonical_intake_handoff_state;
    if (
      handoffState !== null &&
      handoffState !== R8C_AWAITING_HANDOFF_STATE &&
      handoffState !== R8C_HANDED_OFF_STATE
    ) {
      throw new Error(`${context} has an invalid canonical handoff state`);
    }

    uniqueKey(candidateIds, candidateMappingId, "Governed candidate source set");
    uniqueKey(
      occurrenceIds,
      sourceMisspellingInstanceId,
      "Governed misspelling occurrence set",
    );
    uniqueKey(writingIssueIds, writingIssueId, "Governed writing issue set");

    return {
      writingIssueId,
      sourceMisspellingInstanceId,
      candidateMappingId,
      misspellingNormalized: requiredString(
        row,
        "misspelling_normalized",
        context,
      ),
      correctSpellingNormalized: requiredString(
        row,
        "correct_spelling_normalized",
        context,
      ),
      microSkillKey: requiredString(row, "micro_skill_key", context),
      candidateStatus,
      canonicalIntakeHandoffState: handoffState,
    };
  });
}

export function normalizeExactCandidateMappingIds(
  candidateMappingIds: readonly string[],
): string[] {
  if (candidateMappingIds.length === 0) {
    throw new Error("R8C exact-ID handoff requires at least one candidate ID");
  }
  const ids = new Set<string>();
  for (const candidateMappingId of candidateMappingIds) {
    if (!UUID_PATTERN.test(candidateMappingId)) {
      throw new Error("R8C exact-ID handoff received an invalid candidate ID");
    }
    uniqueKey(ids, candidateMappingId, "R8C exact-ID handoff");
  }
  return [...ids].sort();
}

export function parseAuthorizedCandidateMappingIds(
  authorizationResult: unknown,
  expectedCandidateMappingIds: readonly string[],
): string[] {
  const result = record(authorizationResult);
  if (!result || !Array.isArray(result.candidate_mapping_ids)) {
    throw new Error("R8C authorization returned no exact candidate ID set");
  }
  const authorized = normalizeExactCandidateMappingIds(
    result.candidate_mapping_ids.map((value) => {
      if (typeof value !== "string") {
        throw new Error("R8C authorization returned a malformed candidate ID");
      }
      return value;
    }),
  );
  const expected = normalizeExactCandidateMappingIds(expectedCandidateMappingIds);
  if (
    authorized.length !== expected.length ||
    authorized.some((candidateMappingId, index) => candidateMappingId !== expected[index])
  ) {
    throw new Error("R8C authorization changed the exact candidate ID set");
  }
  return authorized;
}
