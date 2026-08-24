import assert from "node:assert/strict";

import {
  REVIEW_ACTIVITY_SEQUENCE_V3,
  REVIEW_CHALLENGE_TYPES,
  REVIEW_COMPLETION_CONTRACT_V3,
  REVIEW_CONTRACT_REGISTRY_VERSION_V3,
  REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
  REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
  REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
  REVIEW_TIMER_POLICY_V3,
  type CompiledReviewSnapshotV3,
  type ReviewChallengeType,
  type ReviewPromptCandidateSnapshotV3,
} from "../lib/adle/review-v3/contracts";
import {
  createPendingReviewEncounterState,
  isReviewCompletionReady,
  setRepairState,
  submitAudioRetrievalCheck,
  submitWritingDisposition,
  targetWordChallengeProgress,
} from "../lib/adle/review-v3/outcome-state";
import {
  PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  scheduleEffectForOriginalOutcomeV1,
  selectDuePerWordReviewsV1,
  type PerWordReviewScheduleFactV1,
} from "../lib/adle/review-v3/per-word-scheduler";
import { selectLeastRecentlyUsedReflectionPrompt } from "../lib/adle/review-v3/prompt-selection";
import {
  sealCompiledReviewSnapshotV3,
  validateCompiledReviewSnapshotV3,
} from "../lib/adle/review-v3/snapshot-validator";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function prompt(challengeType: ReviewChallengeType): ReviewPromptCandidateSnapshotV3 {
  return {
    contractVersion: 3,
    promptVersionId: `prompt-version:${challengeType}:1`,
    stablePromptKey: `prompt:${challengeType}:1`,
    challengeType,
    contentVersion: "1",
    promptText: `Write for ${challengeType}.`,
    instructionText: "Use your Target Words where they fit.",
    configuration: {},
    reusePolicy: challengeType === "reflection"
      ? "reusable_lru_no_immediate_repeat"
      : "once_per_learner",
    authority: {
      releaseReference: `review-prompt-release:${challengeType}:1`,
      sourceFingerprint: SHA_A,
    },
  };
}

function snapshot(): CompiledReviewSnapshotV3 {
  return sealCompiledReviewSnapshotV3({
    snapshotSchemaVersion: REVIEW_SNAPSHOT_SCHEMA_VERSION_V3,
    compilerVersion: REVIEW_SNAPSHOT_COMPILER_VERSION_V3,
    validatorVersion: REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3,
    contractRegistryVersion: REVIEW_CONTRACT_REGISTRY_VERSION_V3,
    assignment: {
      assignmentId: "assignment-1",
      reviewItemId: "review-item-1",
      generationSource: "adle_review_writing_challenge_v3",
    },
    targets: [
      {
        contractVersion: 3,
        encounterId: "encounter-1",
        order: 1,
        canonicalWordId: "word-1",
        canonicalSpelling: "necessary",
        answerAuthority: {
          referenceId: "canonical-word:word-1",
          version: "dictionary-v1",
          matchingPolicy: "governed_exact_tokens_v1",
        },
        audioAuthority: {
          referenceId: "pronunciation:word-1",
          version: "dictionary-v1",
          kind: "speech_text",
          speechText: "necessary",
          assetReference: null,
        },
        schedule: {
          scheduleWordId: "schedule-word-1",
          sourceBundleId: "legacy-bundle-1",
          dueKind: "scheduled_review",
          dueOn: "2026-08-24",
          intervalIndex: 2,
          schedulePolicyVersion: "review_policy_v1_2026-07-04",
          wordScheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
        },
        routeProvenance: [
          {
            routeId: "dynamic_prefix_word_lab",
            microSkillKey: "D4_MOR_PREFIXES_RE_PRE",
            learningItemId: "learning-item-1",
          },
        ],
        availableCue: {
          cueVersionId: "cue-version-1",
          canonicalAuthorityVersion: "dictionary-v1",
          trickyStart: 2,
          trickyEnd: 4,
          trickyText: "ce",
          cueText: "One collar and two sleeves.",
          sourceReviewEncounterId: "earlier-encounter-1",
        },
      },
    ],
    promptCandidates: REVIEW_CHALLENGE_TYPES.map(prompt),
    initialChallengeType: "stories",
    timerPolicy: REVIEW_TIMER_POLICY_V3,
    activitySequence: REVIEW_ACTIVITY_SEQUENCE_V3,
    completionContract: REVIEW_COMPLETION_CONTRACT_V3,
    contentVersions: [
      {
        contentRefId: "schedule_policy:review_policy_v1_2026-07-04",
        kind: "schedule_policy",
        key: "review_policy_v1_2026-07-04",
        version: "review_policy_v1_2026-07-04",
        sourceFingerprint: SHA_B,
      },
    ],
    provenance: {
      sourceKind: "compiled_review_assignment",
      fingerprintAlgorithm: "sha256",
      fingerprintVersion: 1,
    },
  });
}

function resign(value: CompiledReviewSnapshotV3): CompiledReviewSnapshotV3 {
  const provenance = {
    sourceKind: value.provenance.sourceKind,
    fingerprintAlgorithm: value.provenance.fingerprintAlgorithm,
    fingerprintVersion: value.provenance.fingerprintVersion,
  };
  return sealCompiledReviewSnapshotV3({ ...value, provenance });
}

const valid = snapshot();
assert.equal(validateCompiledReviewSnapshotV3(valid).ok, true);
assert.deepEqual(valid.timerPolicy, {
  writingDurationSeconds: 600,
  extensionOptionsSeconds: [300, 600, 900],
  maximumExtensions: 1,
  parentReauthenticationRequired: true,
  scope: "creative_writing_only",
});
assert.equal(valid.promptCandidates.length, 5);
assert.equal(
  valid.promptCandidates.find((entry) => entry.challengeType === "reflection")?.reusePolicy,
  "reusable_lru_no_immediate_repeat",
);
assert(valid.promptCandidates.filter((entry) => entry.challengeType !== "reflection")
  .every((entry) => entry.reusePolicy === "once_per_learner"));

const wrongTimer = structuredClone(valid);
(wrongTimer.timerPolicy as { writingDurationSeconds: number }).writingDurationSeconds = 601;
const wrongTimerResult = validateCompiledReviewSnapshotV3(resign(wrongTimer));
assert(wrongTimerResult.ok === false && wrongTimerResult.blockers.some(
  (entry) => entry.code === "review_snapshot_timer_policy_invalid",
));

const wrongReflection = structuredClone(valid);
const reflection = wrongReflection.promptCandidates.find(
  (entry) => entry.challengeType === "reflection",
);
assert(reflection);
reflection.reusePolicy = "once_per_learner";
const wrongReflectionResult = validateCompiledReviewSnapshotV3(resign(wrongReflection));
assert(wrongReflectionResult.ok === false && wrongReflectionResult.blockers.some(
  (entry) => entry.code === "review_snapshot_prompt_governance_invalid",
));

const tampered = structuredClone(valid);
tampered.targets[0].canonicalSpelling = "changed";
const tamperedResult = validateCompiledReviewSnapshotV3(tampered);
assert(tamperedResult.ok === false && tamperedResult.blockers.some(
  (entry) => entry.code === "review_snapshot_fingerprint_invalid",
));

const pending = createPendingReviewEncounterState("encounter-1");
const correctWriting = submitWritingDisposition(pending, {
  disposition: "correct_in_writing",
});
assert(correctWriting.ok && correctWriting.state.originalOutcome === "success");
assert(correctWriting.ok && correctWriting.state.originalOutcomeSource === "writing");
assert(correctWriting.ok && !submitAudioRetrievalCheck(correctWriting.state, true).ok,
  "a writing result cannot be overwritten by an audio result");

const knownMisspelling = submitWritingDisposition(pending, {
  disposition: "attributable_misspelling",
  attributionAlgorithmVersion: "r3-not-selected-fixture",
  attributionProvenance: { fixture: true },
});
assert(knownMisspelling.ok && knownMisspelling.state.originalOutcome === "failure");
assert(knownMisspelling.ok && knownMisspelling.state.repairState === "required");
assert(knownMisspelling.ok && !submitAudioRetrievalCheck(knownMisspelling.state, true).ok,
  "a known writing failure never receives an audio escape hatch");
assert(knownMisspelling.ok);
const repairStarted = setRepairState(knownMisspelling.state, "in_progress");
assert(repairStarted.ok);
const repairComplete = repairStarted.ok
  ? setRepairState(repairStarted.state, "completed_correct")
  : repairStarted;
assert(repairComplete.ok && repairComplete.state.originalOutcome === "failure",
  "successful repair preserves the original scheduled failure");

const unaccounted = submitWritingDisposition(pending, {
  disposition: "unaccounted_for",
});
assert(unaccounted.ok && unaccounted.state.originalOutcome === "pending");
const audioSuccess = unaccounted.ok
  ? submitAudioRetrievalCheck(unaccounted.state, true)
  : unaccounted;
assert(audioSuccess.ok && audioSuccess.state.originalOutcome === "success");
assert(audioSuccess.ok && audioSuccess.state.originalOutcomeSource === "audio_retrieval_check");

const audioFailure = unaccounted.ok
  ? submitAudioRetrievalCheck(unaccounted.state, false)
  : unaccounted;
assert(audioFailure.ok && audioFailure.state.originalOutcome === "failure");
assert(audioFailure.ok && audioFailure.state.repairState === "required");

assert.equal(isReviewCompletionReady([pending]), false);
assert.equal(
  isReviewCompletionReady([
    correctWriting.ok ? correctWriting.state : pending,
    repairComplete.ok ? repairComplete.state : pending,
  ]),
  true,
);
const perfectProgress = targetWordChallengeProgress({
  totalTargets: 1,
  correctlyPresentTargetIds: new Set(["encounter-1"]),
});
assert.deepEqual(perfectProgress, {
  count: 1,
  total: 1,
  role: "challenge_progress_only",
});
assert.equal(isReviewCompletionReady([pending]), false,
  "perfect challenge progress is not the Review completion boundary");

const reflectionChoice = selectLeastRecentlyUsedReflectionPrompt([
  {
    promptVersionId: "reflection-1-v1",
    stablePromptKey: "reflection-1",
    challengeType: "reflection",
    lastCompletedAt: "2026-08-20T10:00:00Z",
  },
  {
    promptVersionId: "reflection-2-v1",
    stablePromptKey: "reflection-2",
    challengeType: "reflection",
    lastCompletedAt: "2026-06-01T10:00:00Z",
  },
], "reflection-2");
assert.equal(reflectionChoice?.stablePromptKey, "reflection-1",
  "immediate Reflection repetition is avoided even when it is least recently used");
assert.equal(selectLeastRecentlyUsedReflectionPrompt([
  {
    promptVersionId: "reflection-only-v1",
    stablePromptKey: "reflection-only",
    challengeType: "reflection",
    lastCompletedAt: "2026-08-24T10:00:00Z",
  },
], "reflection-only")?.stablePromptKey, "reflection-only",
"Reflection remains reusable when it is the only eligible prompt");

const scheduleWords: PerWordReviewScheduleFactV1[] = Array.from(
  { length: 11 },
  (_, index) => ({
    scheduleWordId: `schedule-${String(index + 1).padStart(2, "0")}`,
    childId: "child-1",
    canonicalWordId: `word-${String(index + 1).padStart(2, "0")}`,
    sourceBundleId: "one-legacy-bundle",
    scheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
    schedulePolicyVersion: "review_policy_v1_2026-07-04",
    intervalIndex: 2,
    nextDueOn: `2026-08-${String(index + 1).padStart(2, "0")}`,
    membershipStatus: "scheduled",
    catchUpStage: 0,
    nextRetestDueOn: null,
    preRetirementCheckDueOn: null,
    taughtOn: "2026-07-01",
    rowStatus: "active",
  }),
);
const due = selectDuePerWordReviewsV1({
  policyVersion: "review_policy_v1_2026-07-04",
  sessionCap: 10,
  today: "2026-08-24",
  words: scheduleWords,
});
assert.equal(due.length, 10);
assert.equal(due[0].canonicalWordId, "word-01");
assert.equal(due[9].canonicalWordId, "word-10");
assert.equal(scheduleWords[10].nextDueOn, "2026-08-11",
  "the eleventh due word remains independently due and untouched");
assert.equal(scheduleEffectForOriginalOutcomeV1("success"), "advance_from_cold_retrieval");
assert.equal(scheduleEffectForOriginalOutcomeV1("failure"), "enter_catch_up_without_interval_advance");
assert.equal(scheduleEffectForOriginalOutcomeV1("pending"), "none_pending_original_outcome");

console.log("PASS: ADLE Review R1 contracts, snapshot, durable outcome semantics, Reflection LRU, and shadow per-word queue");
