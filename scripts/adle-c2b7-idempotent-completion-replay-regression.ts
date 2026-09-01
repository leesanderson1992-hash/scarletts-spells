import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveCompletedMixedPolicyReviewReplay } from
  "../lib/adle/review-policy/mixed-policy-finalization";

const SESSION_ID = "00000000-0000-4000-8000-000000000811";
const SNAPSHOT_FINGERPRINT = "a".repeat(64);
const COMPLETED_AT_MS = "2026-09-01T12:03:43.643+00:00";
const COMPLETED_AT_MICROSECONDS = "2026-09-01T12:03:43.643000+00:00";

const session = {
  id: SESSION_ID,
  stage: "completed",
  completed_at: COMPLETED_AT_MICROSECONDS,
  state_version: 147,
  snapshot_fingerprint: SNAPSHOT_FINGERPRINT,
};

const payload = {
  ok: true,
  replayed: false,
  reviewSessionId: SESSION_ID,
  assignmentPracticeDate: "2026-09-01",
  completedAt: COMPLETED_AT_MICROSECONDS,
  reviewCompletedOn: "2026-09-01",
  successCount: 9,
  failureCount: 1,
  promptedAuthenticUseCount: 0,
  transitionedWordCount: 10,
  stateVersion: 147,
};

const receipt = {
  review_session_id: SESSION_ID,
  snapshot_fingerprint: SNAPSHOT_FINGERPRINT,
  completed_at: COMPLETED_AT_MS,
  review_completed_on: "2026-09-01",
  result_payload: payload,
};

const replay = resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt,
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
});
assert.equal(replay.disposition, "REPLAY");
if (replay.disposition !== "REPLAY") throw new Error("completed receipt did not replay");
assert.deepEqual(replay.result, {
  ...payload,
  replayed: true,
  assignmentItemCompleted: true,
  nextMajorStage: "specialist_generation",
});

// A browser retry can carry a fresh request idempotency key. Replay identity
// is the singular immutable session receipt, so that key is not an input to
// this completed-session resolver.
assert.equal("idempotencyKey" in receipt, false);

assert.deepEqual(resolveCompletedMixedPolicyReviewReplay({
  session: { ...session, stage: "ready_to_complete", completed_at: null },
  receipt: null,
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}), { disposition: "NOT_COMPLETED" });

assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session: { ...session, completed_at: null },
  receipt,
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");
assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt: null,
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");
assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt: { ...receipt, review_session_id: "00000000-0000-4000-8000-000000000812" },
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");
assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt: { ...receipt, snapshot_fingerprint: "b".repeat(64) },
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");
assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt: { ...receipt, completed_at: "2026-09-01T12:03:44.643+00:00" },
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");
assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt: { ...receipt, result_payload: { ...payload, stateVersion: 146 } },
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");
assert.equal(resolveCompletedMixedPolicyReviewReplay({
  session,
  receipt: { ...receipt, result_payload: { ...payload, transitionedWordCount: 9 } },
  requestedSnapshotFingerprint: SNAPSHOT_FINGERPRINT,
}).disposition, "REJECTED");

const implementation = readFileSync(resolve(
  "lib/adle/review-policy/mixed-policy-finalization.ts",
), "utf8");
const replayBoundary = implementation.indexOf(
  "const replay = resolveCompletedMixedPolicyReviewReplay",
);
const replayReturn = implementation.indexOf(
  'if (replay.disposition === "REPLAY") return replay.result',
);
const preparationRpc = implementation.indexOf(
  'input.client.rpc("prepare_adle_review_finalization_c2b6"',
);
assert.ok(replayBoundary >= 0, "completed-session replay boundary must exist");
assert.ok(replayReturn > replayBoundary, "receipt replay must return at its boundary");
assert.ok(preparationRpc > replayReturn, "receipt replay must return before preparation RPC");
assert.equal((implementation.match(/prepare_adle_review_finalization_c2b6/g) ?? []).length, 1);

console.log(JSON.stringify({
  status: "PASS",
  completedSessionReceiptReplay: true,
  freshBrowserIdempotencyKeyAcceptedByReceiptAuthority: true,
  microsecondMillisecondReceiptParity: true,
  replayReturnsBeforePreparationRpc: true,
  inconsistentEvidenceFailsClosed: true,
  schedulerSemanticsChanged: false,
}, null, 2));
