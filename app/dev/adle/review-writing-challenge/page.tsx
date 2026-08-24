import { notFound } from "next/navigation";

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
} from "@/lib/adle/review-v3/contracts";
import { sealCompiledReviewSnapshotV3 } from "@/lib/adle/review-v3/snapshot-validator";
import { ReviewWritingChallengeDevFixture } from "./fixture";

const FIXTURE_FINGERPRINT = "a".repeat(64);

function fixtureSnapshot(): CompiledReviewSnapshotV3 {
  return sealCompiledReviewSnapshotV3({
    snapshotSchemaVersion: REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
    compilerVersion: REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
    validatorVersion: REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
    contractRegistryVersion: REVIEW_CONTRACT_REGISTRY_VERSION_V3,
    assignment: {
      assignmentId: "dev-review-writing-challenge",
      reviewItemId: "dev-review-item",
      generationSource: "adle_review_writing_challenge_v3",
    },
    targets: Array.from({ length: 3 }, (_, index) => ({
      contractVersion: 3 as const,
      encounterId: `dev-encounter-${index + 1}`,
      order: index + 1,
      canonicalWordId: `dev-word-${index + 1}`,
      canonicalSpelling: ["necessary", "Wednesday", "business"][index],
      answerAuthority: {
        referenceId: `dev-answer-${index + 1}`,
        version: "v1",
        matchingPolicy: "governed_exact_tokens_v1" as const,
      },
      audioAuthority: {
        referenceId: `dev-audio-${index + 1}`,
        version: "v1",
        kind: "speech_text" as const,
        speechText: ["necessary", "Wednesday", "business"][index],
        assetReference: null,
      },
      schedule: {
        scheduleWordId: `dev-schedule-${index + 1}`,
        sourceBundleId: "dev-bundle",
        dueKind: "scheduled_review" as const,
        dueOn: "2026-08-24",
        intervalIndex: 0,
        schedulePolicyVersion: "review_policy_v1_2026-07-04",
        wordScheduleVersion: "adle_review_per_word_schedule_v1",
      },
      routeProvenance: [{
        routeId: "dev-review-fixture",
        microSkillKey: "DEV_REVIEW",
        learningItemId: null,
      }],
      availableCue: null,
    })),
    promptCandidates: REVIEW_CHALLENGE_TYPES.map((challengeType) => ({
      contractVersion: 3 as const,
      promptVersionId: `dev-${challengeType}-v1`,
      stablePromptKey: `dev-${challengeType}`,
      challengeType,
      contentVersion: "v1",
      promptText: `Create a ${challengeType.replaceAll("_", " ")} piece of writing.`,
      instructionText: "Listen carefully to the target words as often as you need.",
      configuration: {},
      reusePolicy: challengeType === "reflection"
        ? "reusable_lru_no_immediate_repeat" as const
        : "once_per_learner" as const,
      authority: {
        releaseReference: "dev-review-writing-challenge-fixture",
        sourceFingerprint: FIXTURE_FINGERPRINT,
      },
    })),
    initialChallengeType: "stories",
    timerPolicy: REVIEW_TIMER_POLICY_V3,
    activitySequence: REVIEW_ACTIVITY_SEQUENCE_V3,
    completionContract: REVIEW_COMPLETION_CONTRACT_V3,
    contentVersions: [{
      contentRefId: "dev-review-prompt-content",
      kind: "review_prompt",
      key: "dev",
      version: "v1",
      sourceFingerprint: FIXTURE_FINGERPRINT,
    }],
    provenance: {
      sourceKind: "compiled_review_assignment",
      fingerprintAlgorithm: "sha256",
      fingerprintVersion: REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3,
    },
  });
}

export default function ReviewWritingChallengeDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReviewWritingChallengeDevFixture snapshot={fixtureSnapshot()} />;
}
