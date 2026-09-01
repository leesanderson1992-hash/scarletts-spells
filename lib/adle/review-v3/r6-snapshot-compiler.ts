import { createHash } from "node:crypto";

import {
  REVIEW_ACTIVITY_SEQUENCE_V3,
  REVIEW_CHALLENGE_TYPES,
  REVIEW_COMPLETION_CONTRACT_V3,
  REVIEW_CONTRACT_REGISTRY_VERSION_V3,
  REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
  REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3,
  REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
  REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
  REVIEW_TIMER_POLICY_V3,
  type CompiledReviewSnapshotV3,
  type ReviewChallengeType,
  type ReviewCueSnapshotV3,
  type ReviewDueKindV3,
  type ReviewPromptCandidateSnapshotV3,
  type ReviewRouteProvenanceSnapshotV3,
} from "./contracts";
import {
  sealCompiledReviewSnapshotV3,
  validateCompiledReviewSnapshotV3,
} from "./snapshot-validator";

export const REVIEW_R6_WHEEL_SEED_VERSION = "adle_review_wheel_seed_v1" as const;

export interface ReviewR6DueWordFact {
  scheduleWordId: string;
  canonicalWordId: string;
  canonicalSpelling: string;
  sourceBundleId: string | null;
  dueKind: ReviewDueKindV3;
  dueOn: string;
  intervalIndex: number;
  schedulePolicyVersion: string;
  wordScheduleVersion: string;
  taughtOn: string;
  answerAuthorityReferenceId: string;
  answerAuthorityVersion: string;
  answerAuthorityFingerprint: string;
  audioAuthorityReferenceId: string;
  audioAuthorityVersion: string;
  audioAuthorityFingerprint: string;
  audioKind: "speech_text" | "audio_asset";
  speechText: string | null;
  assetReference: string | null;
  routeProvenance: readonly ReviewRouteProvenanceSnapshotV3[];
  availableCue: ReviewCueSnapshotV3 | null;
}

export interface ReviewR6PromptFact extends ReviewPromptCandidateSnapshotV3 {
  lastCompletedAt: string | null;
}

export interface CompileReviewR6Input {
  assignmentId: string;
  reviewItemId: string;
  childId: string;
  assignmentDate: string;
  dueWords: readonly ReviewR6DueWordFact[];
  prompts: readonly ReviewR6PromptFact[];
  createEncounterId?: (word: ReviewR6DueWordFact, index: number) => string;
}

export type CompileReviewR6Result =
  | { ok: true; snapshot: CompiledReviewSnapshotV3 }
  | { ok: false; blockerCode: string };

function validFingerprint(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/** Stable RFC-4122-shaped identifier for immutable compiler-owned rows. */
export function deterministicReviewR6Uuid(...parts: readonly string[]): string {
  const bytes = Buffer.from(createHash("sha256").update(JSON.stringify(parts)).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function selectInitialReviewChallengeR6(input: {
  childId: string;
  assignmentDate: string;
  scheduleWordIds: readonly string[];
  promptVersionIds: readonly string[];
}): ReviewChallengeType {
  const canonicalSeed = JSON.stringify({
    version: REVIEW_R6_WHEEL_SEED_VERSION,
    childId: input.childId,
    assignmentDate: input.assignmentDate,
    scheduleWordIds: input.scheduleWordIds,
    promptVersionIds: input.promptVersionIds,
  });
  const digest = createHash("sha256").update(canonicalSeed).digest();
  return REVIEW_CHALLENGE_TYPES[digest.readUInt32BE(0) % REVIEW_CHALLENGE_TYPES.length];
}

export function compileReviewSnapshotR6(
  input: CompileReviewR6Input,
): CompileReviewR6Result {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.assignmentDate)) {
    return { ok: false, blockerCode: "review_r6_invalid_assignment_date" };
  }
  if (input.dueWords.length < 1 || input.dueWords.length > 10) {
    return { ok: false, blockerCode: "review_r6_target_count_invalid" };
  }
  const scheduleIds = input.dueWords.map((word) => word.scheduleWordId);
  const canonicalIds = input.dueWords.map((word) => word.canonicalWordId);
  if (new Set(scheduleIds).size !== scheduleIds.length || new Set(canonicalIds).size !== canonicalIds.length) {
    return { ok: false, blockerCode: "review_r6_target_identity_ambiguous" };
  }
  const promptByType = new Map(input.prompts.map((prompt) => [prompt.challengeType, prompt]));
  if (
    input.prompts.length !== REVIEW_CHALLENGE_TYPES.length ||
    REVIEW_CHALLENGE_TYPES.some((type) => !promptByType.has(type))
  ) {
    return { ok: false, blockerCode: "review_r6_prompt_package_incomplete" };
  }
  if (input.dueWords.some((word) =>
    !validFingerprint(word.answerAuthorityFingerprint) ||
    !validFingerprint(word.audioAuthorityFingerprint) ||
    (word.audioKind === "speech_text" && !word.speechText) ||
    (word.audioKind === "audio_asset" && !word.assetReference)
  )) {
    return { ok: false, blockerCode: "review_r6_word_authority_incomplete" };
  }

  const prompts = REVIEW_CHALLENGE_TYPES.map((type) => promptByType.get(type) as ReviewR6PromptFact);
  const createEncounterId = input.createEncounterId ?? ((word: ReviewR6DueWordFact, index: number) =>
    deterministicReviewR6Uuid(
      "adle_review_r6_encounter_v1",
      input.assignmentId,
      word.scheduleWordId,
      String(index + 1),
    ));
  const snapshot = sealCompiledReviewSnapshotV3({
    snapshotSchemaVersion: REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
    compilerVersion: REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
    validatorVersion: REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
    contractRegistryVersion: REVIEW_CONTRACT_REGISTRY_VERSION_V3,
    assignment: {
      assignmentId: input.assignmentId,
      reviewItemId: input.reviewItemId,
      generationSource: "adle_review_writing_challenge_v3",
    },
    targets: input.dueWords.map((word, index) => ({
      contractVersion: 3 as const,
      encounterId: createEncounterId(word, index),
      order: index + 1,
      canonicalWordId: word.canonicalWordId,
      canonicalSpelling: word.canonicalSpelling,
      answerAuthority: {
        referenceId: word.answerAuthorityReferenceId,
        version: word.answerAuthorityVersion,
        matchingPolicy: "governed_exact_tokens_v1" as const,
      },
      audioAuthority: {
        referenceId: word.audioAuthorityReferenceId,
        version: word.audioAuthorityVersion,
        kind: word.audioKind,
        speechText: word.speechText,
        assetReference: word.assetReference,
      },
      schedule: {
        scheduleWordId: word.scheduleWordId,
        sourceBundleId: word.sourceBundleId,
        dueKind: word.dueKind,
        dueOn: word.dueOn,
        intervalIndex: word.intervalIndex,
        schedulePolicyVersion: word.schedulePolicyVersion,
        wordScheduleVersion: word.wordScheduleVersion,
      },
      routeProvenance: word.routeProvenance,
      availableCue: word.availableCue,
    })),
    promptCandidates: prompts.map((prompt) => ({
      contractVersion: prompt.contractVersion,
      promptVersionId: prompt.promptVersionId,
      stablePromptKey: prompt.stablePromptKey,
      challengeType: prompt.challengeType,
      contentVersion: prompt.contentVersion,
      promptText: prompt.promptText,
      instructionText: prompt.instructionText,
      configuration: prompt.configuration,
      reusePolicy: prompt.reusePolicy,
      authority: prompt.authority,
    })),
    initialChallengeType: selectInitialReviewChallengeR6({
      childId: input.childId,
      assignmentDate: input.assignmentDate,
      scheduleWordIds: scheduleIds,
      promptVersionIds: prompts.map((prompt) => prompt.promptVersionId),
    }),
    timerPolicy: REVIEW_TIMER_POLICY_V3,
    activitySequence: REVIEW_ACTIVITY_SEQUENCE_V3,
    completionContract: REVIEW_COMPLETION_CONTRACT_V3,
    contentVersions: [
      ...prompts.map((prompt) => ({
        contentRefId: prompt.promptVersionId,
        kind: "review_prompt" as const,
        key: prompt.stablePromptKey,
        version: prompt.contentVersion,
        sourceFingerprint: prompt.authority.sourceFingerprint,
      })),
      ...input.dueWords.flatMap((word) => ([
        {
          contentRefId: `answer:${word.answerAuthorityReferenceId}`,
          kind: "answer_authority" as const,
          key: word.canonicalWordId,
          version: word.answerAuthorityVersion,
          sourceFingerprint: word.answerAuthorityFingerprint,
        },
        {
          contentRefId: `audio:${word.audioAuthorityReferenceId}`,
          kind: "audio_authority" as const,
          key: word.canonicalWordId,
          version: word.audioAuthorityVersion,
          sourceFingerprint: word.audioAuthorityFingerprint,
        },
      ])),
      ...[...new Set(input.dueWords.map((word) => word.schedulePolicyVersion))]
        .sort()
        .map((policyVersion) => ({
          contentRefId: `schedule-policy:${policyVersion}`,
          kind: "schedule_policy" as const,
          key: policyVersion,
          version: policyVersion,
          sourceFingerprint: createHash("sha256")
            .update(`schedule-policy:${policyVersion}`)
            .digest("hex"),
        })),
    ],
    provenance: {
      sourceKind: "compiled_review_assignment",
      fingerprintAlgorithm: "sha256",
      fingerprintVersion: REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3,
    },
  });
  const validation = validateCompiledReviewSnapshotV3(snapshot);
  return validation.ok
    ? { ok: true, snapshot: validation.snapshot }
    : {
        ok: false,
        blockerCode: validation.blockers.map((blocker) => blocker.code).join(","),
      };
}
