import {
  WORD_LAB_RESUME_SCHEMA_VERSION,
  type CompiledWordLabSnapshotV1,
  type WordLabBlocker,
  type WordLabResumeEnvelopeV1,
} from "./contracts";

export function wordLabResumeKey(assignmentId: string): string {
  return `adle:common-word-lab:${assignmentId}:${WORD_LAB_RESUME_SCHEMA_VERSION}`;
}

export function validateWordLabResumeEnvelope(
  value: unknown,
  snapshot: CompiledWordLabSnapshotV1,
): { ok: true; resume: WordLabResumeEnvelopeV1 } | { ok: false; blockers: readonly WordLabBlocker[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, blockers: [{ code: "resume_schema_mismatch" }] };
  }
  const resume = value as WordLabResumeEnvelopeV1;
  if (resume.schemaVersion !== WORD_LAB_RESUME_SCHEMA_VERSION) {
    return { ok: false, blockers: [{ code: "resume_schema_mismatch" }] };
  }
  if (resume.assignmentId !== snapshot.assignmentId) {
    return { ok: false, blockers: [{ code: "resume_assignment_mismatch" }] };
  }
  if (resume.snapshotFingerprint !== snapshot.fingerprint) {
    return { ok: false, blockers: [{ code: "resume_fingerprint_mismatch" }] };
  }
  if (
    typeof resume.currentActivityId !== "string" ||
    !Array.isArray(resume.completedActivityIds) ||
    !Array.isArray(resume.activityResults) ||
    resume.activityResults.some((result) =>
      typeof result !== "object" || result === null ||
      typeof result.activityId !== "string" ||
      !Number.isInteger(result.contractVersion) ||
      result.completed !== true ||
      typeof result.response !== "object" || result.response === null
    ) ||
    resume.completedActivityIds.length !== resume.activityResults.length ||
    resume.completedActivityIds.some((id) => !resume.activityResults.some((result) => result.activityId === id)) ||
    typeof resume.activityState !== "object" || resume.activityState === null ||
    typeof resume.reflection !== "string" || typeof resume.muted !== "boolean"
  ) return { ok: false, blockers: [{ code: "resume_schema_mismatch" }] };
  return { ok: true, resume };
}
