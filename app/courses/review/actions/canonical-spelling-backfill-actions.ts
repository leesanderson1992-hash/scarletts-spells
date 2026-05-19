export {
  backfillPendingSubmissionSuggestionCanonicalMicroSkill,
  resolveScopedMicroSkillForSubmissionSuggestion,
  type MisspellingSuggestionLookupRow,
} from "../canonical-submission-spelling-actions";
export { hasCanonicalMicroSkillKey } from "../canonical-submission-spelling";

export type ExistingParentVerificationLookupRow = {
  id: string;
  decision:
    | "accepted"
    | "overridden"
    | "false_positive"
    | "not_a_learning_issue";
  suggested_micro_skill_key: string | null;
  verified_micro_skill_key: string | null;
};

export function normaliseExistingParentVerificationLookupRow(
  value: unknown,
): ExistingParentVerificationLookupRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ExistingParentVerificationLookupRow>;

  if (typeof candidate.id !== "string") {
    return null;
  }

  if (
    candidate.decision !== "accepted" &&
    candidate.decision !== "overridden" &&
    candidate.decision !== "false_positive" &&
    candidate.decision !== "not_a_learning_issue"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    decision: candidate.decision,
    suggested_micro_skill_key:
      typeof candidate.suggested_micro_skill_key === "string"
        ? candidate.suggested_micro_skill_key
        : null,
    verified_micro_skill_key:
      typeof candidate.verified_micro_skill_key === "string"
        ? candidate.verified_micro_skill_key
        : null,
  };
}
