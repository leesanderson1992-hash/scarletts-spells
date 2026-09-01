export const REVIEW_SNAPSHOT_SCHEMA_VERSION_V3 = "review_snapshot_v3" as const;
export const REVIEW_SNAPSHOT_COMPILER_VERSION_V3 =
  "adle_review_snapshot_compiler_v3" as const;
export const REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3 =
  "adle_review_snapshot_validator_v3" as const;
export const REVIEW_CONTRACT_REGISTRY_VERSION_V3 =
  "adle_review_contracts_v1" as const;
export const REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3 = 1 as const;

export const REVIEW_CHALLENGE_TYPES = [
  "conundrums",
  "reflection",
  "stories",
  "fortunately_unfortunately",
  "persuasion",
] as const;

export type ReviewChallengeType = (typeof REVIEW_CHALLENGE_TYPES)[number];

export const REVIEW_TIMER_POLICY_V3 = {
  writingDurationSeconds: 600,
  extensionOptionsSeconds: [300, 600, 900],
  maximumExtensions: 1,
  parentReauthenticationRequired: true,
  scope: "creative_writing_only",
} as const;

export type ReviewWritingDisposition =
  | "correct_in_writing"
  | "attributable_misspelling"
  | "unaccounted_for";

export type ReviewOriginalOutcome = "pending" | "success" | "failure";

export type ReviewOriginalOutcomeSource =
  | "writing"
  | "audio_retrieval_check"
  | null;

export type ReviewRepairState =
  | "not_required"
  | "required"
  | "in_progress"
  | "completed_correct"
  | "attempted_not_secured";

export type ReviewPromptReusePolicy =
  | "once_per_learner"
  | "reusable_lru_no_immediate_repeat";

export type ReviewSnapshotJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ReviewSnapshotJsonValue[]
  | { readonly [key: string]: ReviewSnapshotJsonValue };

export interface ReviewPromptCandidateSnapshotV3 {
  contractVersion: 3;
  promptVersionId: string;
  stablePromptKey: string;
  challengeType: ReviewChallengeType;
  contentVersion: string;
  promptText: string;
  instructionText: string;
  configuration: Readonly<Record<string, ReviewSnapshotJsonValue>>;
  reusePolicy: ReviewPromptReusePolicy;
  authority: {
    releaseReference: string;
    sourceFingerprint: string;
  };
}

export interface ReviewRouteProvenanceSnapshotV3 {
  routeId: string;
  microSkillKey: string;
  learningItemId: string | null;
}

export interface ReviewCueSnapshotV3 {
  cueVersionId: string;
  canonicalAuthorityVersion: string;
  trickyStart: number;
  trickyEnd: number;
  trickyText: string;
  cueText: string;
  sourceReviewEncounterId: string;
}

export type ReviewDueKindV3 =
  | "scheduled_review"
  | "catch_up_retest"
  | "next_day_recovery"
  | "pre_retirement_check";

export interface ReviewTargetSnapshotV3 {
  contractVersion: 3;
  encounterId: string;
  order: number;
  canonicalWordId: string;
  canonicalSpelling: string;
  answerAuthority: {
    referenceId: string;
    version: string;
    matchingPolicy: "governed_exact_tokens_v1";
  };
  audioAuthority: {
    referenceId: string;
    version: string;
    kind: "speech_text" | "audio_asset";
    speechText: string | null;
    assetReference: string | null;
  };
  schedule: {
    scheduleWordId: string;
    sourceBundleId: string | null;
    dueKind: ReviewDueKindV3;
    dueOn: string;
    intervalIndex: number;
    schedulePolicyVersion: string;
    wordScheduleVersion: string;
  };
  routeProvenance: readonly ReviewRouteProvenanceSnapshotV3[];
  availableCue: ReviewCueSnapshotV3 | null;
}

export const REVIEW_ACTIVITY_SEQUENCE_V3 = [
  {
    activityKey: "challenge_selection",
    order: 1,
    requiredForCompletion: true,
    evidenceRole: "none",
  },
  {
    activityKey: "creative_writing",
    order: 2,
    requiredForCompletion: true,
    evidenceRole: "writing_disposition",
  },
  {
    activityKey: "unused_target_retrieval",
    order: 3,
    requiredForCompletion: true,
    evidenceRole: "original_scheduled_outcome",
  },
  {
    activityKey: "word_reflection_repair",
    order: 4,
    requiredForCompletion: true,
    evidenceRole: "repair_evidence",
  },
  {
    activityKey: "review_completion",
    order: 5,
    requiredForCompletion: true,
    evidenceRole: "completion_boundary",
  },
] as const;

export type ReviewActivitySnapshotV3 =
  (typeof REVIEW_ACTIVITY_SEQUENCE_V3)[number];

export const REVIEW_COMPLETION_CONTRACT_V3 = {
  targetProgressRole: "challenge_progress_only",
  perfectProgressRole: "achievement_only",
  requireOriginalOutcomeForEveryTarget: true,
  requireTerminalRepairForEveryFailure: true,
} as const;

export interface ReviewContentVersionSnapshotV3 {
  contentRefId: string;
  kind: "review_prompt" | "schedule_policy" | "answer_authority" | "audio_authority";
  key: string;
  version: string;
  sourceFingerprint: string;
}

export interface CompiledReviewSnapshotV3 {
  snapshotSchemaVersion: typeof REVIEW_SNAPSHOT_SCHEMA_VERSION_V3;
  compilerVersion: typeof REVIEW_SNAPSHOT_COMPILER_VERSION_V3;
  validatorVersion: typeof REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3;
  contractRegistryVersion: typeof REVIEW_CONTRACT_REGISTRY_VERSION_V3;
  assignment: {
    assignmentId: string;
    reviewItemId: string;
    generationSource: "adle_review_writing_challenge_v3";
  };
  targets: readonly ReviewTargetSnapshotV3[];
  promptCandidates: readonly ReviewPromptCandidateSnapshotV3[];
  initialChallengeType: ReviewChallengeType;
  timerPolicy: typeof REVIEW_TIMER_POLICY_V3;
  activitySequence: readonly ReviewActivitySnapshotV3[];
  completionContract: typeof REVIEW_COMPLETION_CONTRACT_V3;
  contentVersions: readonly ReviewContentVersionSnapshotV3[];
  provenance: {
    sourceKind: "compiled_review_assignment";
    fingerprintAlgorithm: "sha256";
    fingerprintVersion: typeof REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3;
    sourceFingerprint: string;
  };
}

export interface ReviewRuntimeEncounterStateV1 {
  encounterId: string;
  writingDisposition: ReviewWritingDisposition | null;
  originalOutcome: ReviewOriginalOutcome;
  originalOutcomeSource: ReviewOriginalOutcomeSource;
  attributionAlgorithmVersion: string | null;
  attributionProvenance: Readonly<Record<string, ReviewSnapshotJsonValue>> | null;
  repairState: ReviewRepairState;
}
