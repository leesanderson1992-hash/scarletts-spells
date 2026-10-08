export const CONTEXT_RESOLVER_CONTRACT_VERSION =
  "ADLE_CONTEXT_RESOLVER_CONTRACT_V1" as const;
export const CONTEXT_REGISTRY_SCHEMA_VERSION =
  "ADLE_CONTEXT_REGISTRY_SCHEMA_V1" as const;
export const CONTEXT_OCCURRENCE_SCHEMA_VERSION =
  "ADLE_CONTEXT_OCCURRENCE_SCHEMA_V1" as const;
export const CONTEXT_DECISION_SCHEMA_VERSION =
  "ADLE_CONTEXT_DECISION_SCHEMA_V1" as const;
export const CONTEXT_CALIBRATION_POLICY_SCHEMA_VERSION =
  "ADLE_CONTEXT_CALIBRATION_POLICY_SCHEMA_V1" as const;
export const CONTEXT_SURFACE_NORMALIZATION_VERSION =
  "ADLE_CONTEXT_SURFACE_NFKC_CASEFOLD_APOSTROPHE_V1" as const;

export type ContextRequirement = "NOT_REQUIRED" | "REQUIRED";

export type ContextualUsageResult = "VALID" | "INVALID" | "UNCERTAIN";

export type ContextDecisionMethod =
  | "DETERMINISTIC_RULE"
  | "CONSTRAINED_CLASSIFIER"
  | "HUMAN_OVERRIDE";

export type ContextConfusionSetKey =
  | "THERE_THEIR_THEYRE"
  | "TO_TOO_TWO"
  | "YOUR_YOURE"
  | "ITS_ITS";

/**
 * These values describe evidence provenance only. They never assert contextual
 * validity, authenticity, independence, or downstream qualification.
 */
export type ContextSourceClass =
  | "GOVERNED_REVIEW_WRITING"
  | "INDEPENDENT_LEARNER_WRITING"
  | "PARENT_APPROVED_EXTERNAL_WRITING"
  | "PROMPTED_SCAFFOLDED_WRITING"
  | "OTHER_GOVERNED_WRITING";

export type ContextTargetSelection =
  | "LEARNER_SELECTED"
  | "SYSTEM_SELECTED"
  | "PARENT_SELECTED"
  | "UNKNOWN";

export type ContextAnswerVisibility =
  | "NOT_SHOWN"
  | "SHOWN_BEFORE_WRITING"
  | "SHOWN_DURING_WRITING"
  | "UNKNOWN";

export type ContextSupportLevel =
  | "NONE"
  | "PROMPT_ONLY"
  | "SCAFFOLDED"
  | "DIRECT_COPY_AVAILABLE"
  | "UNKNOWN";

export type ContextVerificationState =
  | "SYSTEM_GOVERNED"
  | "PARENT_VERIFIED"
  | "UNVERIFIED"
  | "UNKNOWN";

export interface ContextProvenanceDescriptor {
  sourceClass: ContextSourceClass;
  targetSelection: ContextTargetSelection;
  answerVisibility: ContextAnswerVisibility;
  supportLevel: ContextSupportLevel;
  verificationState: ContextVerificationState;
}

export interface ContextCanonicalWordIdentity {
  canonicalWordId: string;
  canonicalWordKey: string;
  normalisedWord: string;
  dialectCode: string;
}

export interface ContextWritingSourceIdentity {
  sourceClass: ContextSourceClass;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceRevision: string;
  sourceFingerprint: string;
  sourceField: string;
}

/** Offsets are zero-based UTF-16 code-unit offsets into the governed source revision. */
export interface ContextOccurrenceSpan {
  startOffset: number;
  endOffset: number;
}

export interface ContextOccurrenceIdentityFields {
  occurrenceSchemaVersion: typeof CONTEXT_OCCURRENCE_SCHEMA_VERSION;
  learnerId: string;
  source: ContextWritingSourceIdentity;
  canonicalWord: ContextCanonicalWordIdentity;
  observedSurface: string;
  normalizedObservedSurface: string;
  span: ContextOccurrenceSpan;
}

export interface ContextOccurrenceIdentity extends ContextOccurrenceIdentityFields {
  occurrenceId: string;
}

export interface ContextRequirementDecision {
  requirement: ContextRequirement;
  registryVersion: string;
  registryFingerprint: string;
  confusionSetKey: ContextConfusionSetKey | null;
  confusionSetVersion: string | null;
  microSkillKey: string | null;
}

/**
 * NOT_REQUIRED means only that the canonical identity is outside the governed
 * registry version. It is not a positive semantic judgment.
 */
export interface ContextNotRequiredDecision extends ContextRequirementDecision {
  requirement: "NOT_REQUIRED";
  confusionSetKey: null;
  confusionSetVersion: null;
  microSkillKey: null;
}

export interface ContextRequiredDecision extends ContextRequirementDecision {
  requirement: "REQUIRED";
  confusionSetKey: ContextConfusionSetKey;
  confusionSetVersion: string;
  microSkillKey: string;
}

export interface ApprovedClassifierCalibrationPolicyReference {
  schemaVersion: typeof CONTEXT_CALIBRATION_POLICY_SCHEMA_VERSION;
  policyKey: string;
  policyVersion: string;
  policyFingerprint: string;
  confusionSetKey: ContextConfusionSetKey;
  approvalState: "APPROVED";
}

/**
 * CR.1 deliberately defines no numeric classifier threshold. A classifier
 * decision is admissible only when it carries a separately approved,
 * family-specific calibration-policy reference.
 */
export interface ContextDecisionVersions {
  contractVersion: typeof CONTEXT_RESOLVER_CONTRACT_VERSION;
  registryVersion: string;
  registryFingerprint: string;
  tokenizerVersion: string;
  deterministicRuleVersion: string | null;
  classifierModelVersion: string | null;
  classifierPromptVersion: string | null;
  classifierCalibrationPolicy: ApprovedClassifierCalibrationPolicyReference | null;
}

export interface ContextDecisionConfidence {
  score: number | null;
  scale: "NOT_APPLICABLE" | "RULE_CONFIDENCE" | "CALIBRATED_PROBABILITY";
}

export interface ContextDecisionSupersession {
  supersedesDecisionId: string | null;
  rootDecisionId: string | null;
}

export interface ContextHumanOverrideReference {
  reviewEventId: string;
  reviewerId: string;
  overridePolicyVersion: string;
}

/**
 * A decision concerns one exact occurrence. It does not carry reward,
 * authentic-use, learner-choice, proficiency, or retirement qualification.
 */
export interface ContextualUsageDecision {
  decisionSchemaVersion: typeof CONTEXT_DECISION_SCHEMA_VERSION;
  decisionId: string;
  occurrence: ContextOccurrenceIdentity;
  provenance: ContextProvenanceDescriptor;
  confusionSetKey: ContextConfusionSetKey;
  confusionSetVersion: string;
  result: ContextualUsageResult;
  expectedAlternative: ContextCanonicalWordIdentity | null;
  method: ContextDecisionMethod;
  reasonCodes: readonly string[];
  confidence: ContextDecisionConfidence;
  contextFingerprint: string;
  versions: ContextDecisionVersions;
  humanOverride: ContextHumanOverrideReference | null;
  supersession: ContextDecisionSupersession;
}

export interface ContextClassifierCalibrationPolicy {
  schemaVersion: typeof CONTEXT_CALIBRATION_POLICY_SCHEMA_VERSION;
  policyKey: string;
  policyVersion: string;
  confusionSetKey: ContextConfusionSetKey;
  approvalState: "DRAFT" | "APPROVED" | "RETIRED";
  policyFingerprint: string;
  evaluationCorpusVersion: string;
  /** Concrete, family-specific admission criteria belong to CR.4. */
  admissionCriteria: Readonly<Record<string, string | number | boolean>>;
}

export function isContextDecisionContractAdmissible(
  decision: ContextualUsageDecision,
): boolean {
  if (decision.method === "DETERMINISTIC_RULE") {
    return Boolean(decision.versions.deterministicRuleVersion);
  }
  if (decision.method === "HUMAN_OVERRIDE") return Boolean(decision.humanOverride);
  const policy = decision.versions.classifierCalibrationPolicy;
  return Boolean(
    policy &&
    policy.approvalState === "APPROVED" &&
    policy.confusionSetKey === decision.confusionSetKey &&
    decision.versions.classifierModelVersion &&
    decision.versions.classifierPromptVersion,
  );
}
