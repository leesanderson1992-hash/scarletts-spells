import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
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
  type ReviewPromptCandidateSnapshotV3,
  type ReviewSnapshotJsonValue,
  type ReviewTargetSnapshotV3,
} from "./contracts";

export const REVIEW_SNAPSHOT_V3_BLOCKER_CODES = [
  "malformed_review_snapshot_v3",
  "review_snapshot_version_mismatch",
  "review_snapshot_assignment_mismatch",
  "review_snapshot_target_count_invalid",
  "review_snapshot_target_identity_invalid",
  "review_snapshot_prompt_set_invalid",
  "review_snapshot_prompt_governance_invalid",
  "review_snapshot_initial_challenge_invalid",
  "review_snapshot_timer_policy_invalid",
  "review_snapshot_activity_sequence_invalid",
  "review_snapshot_completion_contract_invalid",
  "review_snapshot_content_provenance_invalid",
  "review_snapshot_fingerprint_invalid",
] as const;

export type ReviewSnapshotV3BlockerCode =
  (typeof REVIEW_SNAPSHOT_V3_BLOCKER_CODES)[number];

export interface ReviewSnapshotV3Blocker {
  code: ReviewSnapshotV3BlockerCode;
  detail?: string;
}

export type ReviewSnapshotV3ValidationResult =
  | { ok: true; snapshot: CompiledReviewSnapshotV3 }
  | { ok: false; blockers: readonly ReviewSnapshotV3Blocker[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value);
}

function jsonValue(value: unknown): value is ReviewSnapshotJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return record(value) && Object.values(value).every(
    (entry) => entry !== undefined && jsonValue(entry),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return fingerprintSnapshotValue(left) === fingerprintSnapshotValue(right);
}

function validRouteProvenance(value: unknown): boolean {
  return record(value) &&
    exactKeys(value, ["routeId", "microSkillKey", "learningItemId"]) &&
    nonEmptyString(value.routeId) &&
    nonEmptyString(value.microSkillKey) &&
    nullableString(value.learningItemId);
}

function validCue(value: unknown): boolean {
  if (value === null) return true;
  return record(value) &&
    exactKeys(value, [
      "cueVersionId",
      "canonicalAuthorityVersion",
      "trickyStart",
      "trickyEnd",
      "trickyText",
      "cueText",
      "sourceReviewEncounterId",
    ]) &&
    nonEmptyString(value.cueVersionId) &&
    nonEmptyString(value.canonicalAuthorityVersion) &&
    Number.isInteger(value.trickyStart) &&
    Number.isInteger(value.trickyEnd) &&
    (value.trickyStart as number) >= 0 &&
    (value.trickyEnd as number) > (value.trickyStart as number) &&
    nonEmptyString(value.trickyText) &&
    nonEmptyString(value.cueText) &&
    nonEmptyString(value.sourceReviewEncounterId);
}

function validTarget(value: unknown): value is ReviewTargetSnapshotV3 {
  if (!record(value) || !exactKeys(value, [
    "contractVersion",
    "encounterId",
    "order",
    "canonicalWordId",
    "canonicalSpelling",
    "answerAuthority",
    "audioAuthority",
    "schedule",
    "routeProvenance",
    "availableCue",
  ])) return false;
  if (
    value.contractVersion !== 3 ||
    !nonEmptyString(value.encounterId) ||
    !Number.isInteger(value.order) ||
    (value.order as number) < 1 ||
    !nonEmptyString(value.canonicalWordId) ||
    !nonEmptyString(value.canonicalSpelling) ||
    !Array.isArray(value.routeProvenance) ||
    !value.routeProvenance.every(validRouteProvenance) ||
    !validCue(value.availableCue)
  ) return false;

  const answer = value.answerAuthority;
  const audio = value.audioAuthority;
  const schedule = value.schedule;
  return record(answer) &&
    exactKeys(answer, ["referenceId", "version", "matchingPolicy"]) &&
    nonEmptyString(answer.referenceId) &&
    nonEmptyString(answer.version) &&
    answer.matchingPolicy === "governed_exact_tokens_v1" &&
    record(audio) &&
    exactKeys(audio, [
      "referenceId",
      "version",
      "kind",
      "speechText",
      "assetReference",
    ]) &&
    nonEmptyString(audio.referenceId) &&
    nonEmptyString(audio.version) &&
    (audio.kind === "speech_text" || audio.kind === "audio_asset") &&
    nullableString(audio.speechText) &&
    nullableString(audio.assetReference) &&
    (audio.kind !== "speech_text" || nonEmptyString(audio.speechText)) &&
    (audio.kind !== "audio_asset" || nonEmptyString(audio.assetReference)) &&
    record(schedule) &&
    exactKeys(schedule, [
      "scheduleWordId",
      "sourceBundleId",
      "dueKind",
      "dueOn",
      "intervalIndex",
      "schedulePolicyVersion",
      "wordScheduleVersion",
    ]) &&
    nonEmptyString(schedule.scheduleWordId) &&
    nullableString(schedule.sourceBundleId) &&
    ["scheduled_review", "catch_up_retest", "pre_retirement_check"].includes(
      String(schedule.dueKind),
    ) &&
    typeof schedule.dueOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(schedule.dueOn) &&
    Number.isInteger(schedule.intervalIndex) &&
    (schedule.intervalIndex as number) >= 0 &&
    nonEmptyString(schedule.schedulePolicyVersion) &&
    nonEmptyString(schedule.wordScheduleVersion);
}

function validPrompt(value: unknown): value is ReviewPromptCandidateSnapshotV3 {
  if (!record(value) || !exactKeys(value, [
    "contractVersion",
    "promptVersionId",
    "stablePromptKey",
    "challengeType",
    "contentVersion",
    "promptText",
    "instructionText",
    "configuration",
    "reusePolicy",
    "authority",
  ])) return false;
  return value.contractVersion === 3 &&
    nonEmptyString(value.promptVersionId) &&
    nonEmptyString(value.stablePromptKey) &&
    REVIEW_CHALLENGE_TYPES.includes(value.challengeType as ReviewChallengeType) &&
    nonEmptyString(value.contentVersion) &&
    nonEmptyString(value.promptText) &&
    nonEmptyString(value.instructionText) &&
    record(value.configuration) &&
    jsonValue(value.configuration) &&
    (value.reusePolicy === "once_per_learner" ||
      value.reusePolicy === "reusable_lru_no_immediate_repeat") &&
    record(value.authority) &&
    exactKeys(value.authority, ["releaseReference", "sourceFingerprint"]) &&
    nonEmptyString(value.authority.releaseReference) &&
    typeof value.authority.sourceFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(value.authority.sourceFingerprint);
}

function validContentVersion(value: unknown): boolean {
  return record(value) &&
    exactKeys(value, [
      "contentRefId",
      "kind",
      "key",
      "version",
      "sourceFingerprint",
    ]) &&
    nonEmptyString(value.contentRefId) &&
    [
      "review_prompt",
      "schedule_policy",
      "answer_authority",
      "audio_authority",
    ].includes(String(value.kind)) &&
    nonEmptyString(value.key) &&
    nonEmptyString(value.version) &&
    typeof value.sourceFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(value.sourceFingerprint);
}

function parseShape(value: unknown): CompiledReviewSnapshotV3 | null {
  if (!record(value) || !exactKeys(value, [
    "snapshotSchemaVersion",
    "compilerVersion",
    "validatorVersion",
    "contractRegistryVersion",
    "assignment",
    "targets",
    "promptCandidates",
    "initialChallengeType",
    "timerPolicy",
    "activitySequence",
    "completionContract",
    "contentVersions",
    "provenance",
  ])) return null;
  if (
    !record(value.assignment) ||
    !exactKeys(value.assignment, ["assignmentId", "reviewItemId", "generationSource"]) ||
    !nonEmptyString(value.assignment.assignmentId) ||
    !nonEmptyString(value.assignment.reviewItemId) ||
    value.assignment.generationSource !== "adle_review_writing_challenge_v3" ||
    !Array.isArray(value.targets) ||
    !value.targets.every(validTarget) ||
    !Array.isArray(value.promptCandidates) ||
    !value.promptCandidates.every(validPrompt) ||
    !Array.isArray(value.activitySequence) ||
    !Array.isArray(value.contentVersions) ||
    !value.contentVersions.every(validContentVersion) ||
    !record(value.timerPolicy) ||
    !record(value.completionContract) ||
    !record(value.provenance) ||
    !exactKeys(value.provenance, [
      "sourceKind",
      "fingerprintAlgorithm",
      "fingerprintVersion",
      "sourceFingerprint",
    ])
  ) return null;
  return value as unknown as CompiledReviewSnapshotV3;
}

export function fingerprintCompiledReviewSnapshotV3(
  snapshot: Omit<CompiledReviewSnapshotV3, "provenance"> & {
    provenance: Omit<CompiledReviewSnapshotV3["provenance"], "sourceFingerprint">;
  },
): string {
  return fingerprintSnapshotValue(snapshot);
}

export function sealCompiledReviewSnapshotV3(
  snapshot: Omit<CompiledReviewSnapshotV3, "provenance"> & {
    provenance: Omit<CompiledReviewSnapshotV3["provenance"], "sourceFingerprint">;
  },
): CompiledReviewSnapshotV3 {
  return {
    ...snapshot,
    provenance: {
      ...snapshot.provenance,
      sourceFingerprint: fingerprintCompiledReviewSnapshotV3(snapshot),
    },
  };
}

export function validateCompiledReviewSnapshotV3(
  value: unknown,
): ReviewSnapshotV3ValidationResult {
  const snapshot = parseShape(value);
  if (snapshot === null) {
    return { ok: false, blockers: [{ code: "malformed_review_snapshot_v3" }] };
  }
  const blockers: ReviewSnapshotV3Blocker[] = [];
  if (
    snapshot.snapshotSchemaVersion !== REVIEW_SNAPSHOT_SCHEMA_VERSION_V3 ||
    snapshot.compilerVersion !== REVIEW_SNAPSHOT_COMPILER_VERSION_V3 ||
    snapshot.validatorVersion !== REVIEW_SNAPSHOT_VALIDATOR_VERSION_V3 ||
    snapshot.contractRegistryVersion !== REVIEW_CONTRACT_REGISTRY_VERSION_V3
  ) blockers.push({ code: "review_snapshot_version_mismatch" });

  if (snapshot.targets.length < 1 || snapshot.targets.length > 10) {
    blockers.push({ code: "review_snapshot_target_count_invalid" });
  }
  const encounterIds = snapshot.targets.map((target) => target.encounterId);
  const wordIds = snapshot.targets.map((target) => target.canonicalWordId);
  const scheduleWordIds = snapshot.targets.map(
    (target) => target.schedule.scheduleWordId,
  );
  if (
    new Set(encounterIds).size !== encounterIds.length ||
    new Set(wordIds).size !== wordIds.length ||
    new Set(scheduleWordIds).size !== scheduleWordIds.length ||
    snapshot.targets.some((target, index) => target.order !== index + 1)
  ) blockers.push({ code: "review_snapshot_target_identity_invalid" });

  const challengeTypes = snapshot.promptCandidates.map(
    (prompt) => prompt.challengeType,
  );
  if (
    snapshot.promptCandidates.length !== REVIEW_CHALLENGE_TYPES.length ||
    new Set(challengeTypes).size !== REVIEW_CHALLENGE_TYPES.length ||
    REVIEW_CHALLENGE_TYPES.some((type) => !challengeTypes.includes(type))
  ) blockers.push({ code: "review_snapshot_prompt_set_invalid" });
  for (const prompt of snapshot.promptCandidates) {
    const expected = prompt.challengeType === "reflection"
      ? "reusable_lru_no_immediate_repeat"
      : "once_per_learner";
    if (prompt.reusePolicy !== expected) {
      blockers.push({
        code: "review_snapshot_prompt_governance_invalid",
        detail: prompt.stablePromptKey,
      });
    }
  }
  if (!challengeTypes.includes(snapshot.initialChallengeType)) {
    blockers.push({ code: "review_snapshot_initial_challenge_invalid" });
  }
  if (!sameJson(snapshot.timerPolicy, REVIEW_TIMER_POLICY_V3)) {
    blockers.push({ code: "review_snapshot_timer_policy_invalid" });
  }
  if (!sameJson(snapshot.activitySequence, REVIEW_ACTIVITY_SEQUENCE_V3)) {
    blockers.push({ code: "review_snapshot_activity_sequence_invalid" });
  }
  if (!sameJson(snapshot.completionContract, REVIEW_COMPLETION_CONTRACT_V3)) {
    blockers.push({ code: "review_snapshot_completion_contract_invalid" });
  }
  const contentIds = snapshot.contentVersions.map((entry) => entry.contentRefId);
  if (new Set(contentIds).size !== contentIds.length) {
    blockers.push({ code: "review_snapshot_content_provenance_invalid" });
  }
  const { sourceFingerprint, ...provenance } = snapshot.provenance;
  if (
    snapshot.provenance.sourceKind !== "compiled_review_assignment" ||
    snapshot.provenance.fingerprintAlgorithm !== "sha256" ||
    snapshot.provenance.fingerprintVersion !== REVIEW_SNAPSHOT_FINGERPRINT_VERSION_V3 ||
    !/^[a-f0-9]{64}$/.test(sourceFingerprint) ||
    fingerprintCompiledReviewSnapshotV3({ ...snapshot, provenance }) !== sourceFingerprint
  ) blockers.push({ code: "review_snapshot_fingerprint_invalid" });

  return blockers.length === 0
    ? { ok: true, snapshot }
    : { ok: false, blockers };
}
