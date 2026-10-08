import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ReviewR6GatewayRequest } from "../app/learn/week/adle/review-r6-actions";
import { createReviewDevelopmentStore } from "../lib/adle/review-v3/dev-store";
import { REVIEW_R6_QA_SCENARIOS, reviewR6QaEnabled } from "../lib/adle/review-v3/dev-r6-scenarios";
import { applyReviewR6QaRequest, completeReviewR6QaSpecialist, createReviewR6QaState, saveReviewR6QaSpecialistCheckpoint } from "../lib/adle/review-v3/dev-r6-store";
import type { ReviewR6WritingSessionView } from "../lib/adle/review-v3/r6-session-contracts";

const now = new Date("2026-08-26T12:00:00Z").getTime();
const fixtures = new Map(REVIEW_R6_QA_SCENARIOS.map((scenario) => [scenario.id, createReviewR6QaState(scenario.id, `qa-test-${scenario.id}`, now)]));
const base = (state: ReturnType<typeof createReviewR6QaState>) => ({
  assignmentId: state.snapshot.assignment.assignmentId, reviewSessionId: `dev-r6-session-${state.run}`,
  snapshotFingerprint: state.snapshot.provenance.sourceFingerprint,
});
for (const fixture of fixtures.values()) {
  assert.equal(fixture.snapshot.promptCandidates.length, 5);
  const restored = JSON.parse(JSON.stringify(fixture));
  assert.deepEqual(applyReviewR6QaRequest(restored, { ...base(restored), action: "hydrate_r4" }, now),
    applyReviewR6QaRequest(fixture, { ...base(fixture), action: "hydrate_r4" }, now));
}
assert.equal(fixtures.get("ten-targets")!.snapshot.targets.length, 10);
assert.equal(fixtures.get("five-targets")!.snapshot.targets.length, 5);
assert.equal(fixtures.get("one-target")!.snapshot.targets.length, 1);
assert.equal(fixtures.get("nothing-due")!.stage, "empty");
assert.equal(fixtures.get("lesson-only")!.stage, "specialist_lesson");
assert.equal(fixtures.get("retry-second-success")!.review.r4.repairs[0].attempts.length, 1);
assert.equal(fixtures.get("retry-second-success")!.review.r4.repairs[0].stage, "look");
assert.equal(fixtures.get("retry-second-failure")!.review.r4.repairs[0].terminalOutcome, "repair_attempted_not_secured");
assert.equal(fixtures.get("resume-cover")!.review.r4.repairs[0].stage, "cover");
assert.equal(fixtures.get("resume-try")!.review.r4.repairs[0].stage, "try_again");
assert.equal(fixtures.get("resume-cue")!.review.r4.repairs[0].stage, "memory_cue");
const existing = fixtures.get("existing-cue")!;
assert.equal(existing.review.r4.repairs.length, 0, "Existing cue must not skip cold retrieval");
assert.equal(existing.review.r4.cueVersions.length, 1);
assert.equal(createReviewDevelopmentStore(existing.snapshot, existing.review).hydrateReviewR4DevSession().activeRepair, null);

for (const seconds of [300, 600, 900] as const) {
  const state = createReviewR6QaState("timer-expired", `qa-extension-${seconds}`, now);
  const beforeDraft = state.writing.draftText;
  const request = { ...base(state), action: "extend_writing" as const, extensionSeconds: seconds, expectedStateVersion: state.writingVersion, password: "qa-parent", idempotencyKey: "qa-extension" };
  const view = applyReviewR6QaRequest(state, request, now) as ReviewR6WritingSessionView;
  assert.equal(new Date(view.writingDeadlineAt!).getTime(), now + seconds * 1000);
  assert.equal(state.writing.draftText, beforeDraft);
  assert.throws(() => applyReviewR6QaRequest(state, { ...request, expectedStateVersion: state.writingVersion }, now + seconds * 1000 + 1));
  assert.doesNotMatch(JSON.stringify(state), /qa-parent/, "No password in local durable state");
}
for (const scenario of ["review-only", "review-lesson"] as const) {
  const state = createReviewR6QaState(scenario, `qa-complete-${scenario}`, now);
  const envelope = base(state);
  assert.throws(() => applyReviewR6QaRequest(state, { ...envelope, action: "finalize", idempotencyKey: "early" }, now));
  applyReviewR6QaRequest(state, { ...envelope, action: "start_writing", challengeType: "reflection", expectedStateVersion: 0, idempotencyKey: "start" }, now);
  applyReviewR6QaRequest(state, { ...envelope, action: "save_draft", draftText: "Necessary business on Wednesday.", expectedStateVersion: 1, idempotencyKey: "draft" }, now);
  const submitted = applyReviewR6QaRequest(state, { ...envelope, action: "submit_writing", finalWriting: state.writing.draftText, idempotencyKey: "submit" }, now) as { ok: boolean };
  assert.equal(submitted.ok, true);
  assert.throws(() => applyReviewR6QaRequest(state, { ...envelope, action: "save_draft", draftText: "replacement", expectedStateVersion: 2, idempotencyKey: "replace" }, now));
  const first = applyReviewR6QaRequest(state, { ...envelope, action: "finalize", idempotencyKey: "finish" }, now);
  assert.deepEqual(applyReviewR6QaRequest(state, { ...envelope, action: "finalize", idempotencyKey: "finish" }, now), first);
  assert.equal(state.stage, scenario === "review-only" ? "session_complete" : "specialist_lesson");
  assert.equal(state.completionReceipts, scenario === "review-only" ? 1 : 0);
  assert.throws(() => applyReviewR6QaRequest(state, { ...envelope, assignmentId: "not-a-fixture", action: "hydrate_writing" }, now));
}
const lesson = fixtures.get("lesson-reflection")!;
const checkpoint = { ...(lesson.specialistCheckpoint as Record<string, unknown>), reflectionText: "The base stayed the same." };
saveReviewR6QaSpecialistCheckpoint(lesson, checkpoint);
completeReviewR6QaSpecialist(lesson);
completeReviewR6QaSpecialist(lesson);
assert.equal(lesson.completionReceipts, 1);
assert.equal(lesson.stage, "session_complete");
const unknown = fixtures.get("review-only")!;
assert.throws(() => applyReviewR6QaRequest(unknown, { ...base(unknown), action: "unknown", expectedStateVersion: 0 } as unknown as ReviewR6GatewayRequest));

for (const env of [{ NODE_ENV: "production", ADLE_REVIEW_R6_QA: "1" }, { NODE_ENV: "development" }, { NODE_ENV: "test", ADLE_REVIEW_R6_QA: "1" }]) {
  assert.equal(reviewR6QaEnabled(env, "127.0.0.1:3217"), false);
}
assert.equal(reviewR6QaEnabled({ NODE_ENV: "development", ADLE_REVIEW_R6_QA: "1" }, "127.0.0.1:3217"), true);
assert.equal(reviewR6QaEnabled({ NODE_ENV: "development", ADLE_REVIEW_R6_QA: "1" }, "example.com"), false);
for (const file of ["dev-r6-store.ts", "dev-r6-files.ts", "dev-r6-snapshot.ts", "dev-store.ts"]) {
  assert.doesNotMatch(readFileSync(`lib/adle/review-v3/${file}`, "utf8"), /createServiceRoleClient|createClient\(|\.rpc\(|fetch\(/);
}
const fixture = readFileSync("app/dev/adle/review-r6/fixture.tsx", "utf8");
assert.match(fixture, /<ReviewR6Session/);
assert.match(fixture, /<BaseWordFamilyGuidedLesson/);
assert.match(fixture, /<AdleSessionCelebration/);
assert.doesNotMatch(fixture, /<ReviewFreeWritingActivity|<WordLabScene|<svg/);
assert.match(readFileSync("components/adle/review/review-r6-session.tsx", "utf8"), /props.gateway \?\? reviewR6GatewayAction/);
console.log(`PASS: ${fixtures.size} R6 QA scenarios; shared state engines; frozen results; local resume; one completion; production/host guards; no database adapters.`);
