import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const learnActionsPath = "app/learn/actions.ts";
const payloadPersistencePath =
  "lib/lessons/persistence/submission-payloads.ts";
const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";
const reviewCompletionPath =
  "app/courses/review/actions/review-completion-actions.ts";
const reviewPagePath = "app/courses/review/[submissionId]/page.tsx";

const learnActions = readFileSync(learnActionsPath, "utf8");
const payloadPersistence = readFileSync(payloadPersistencePath, "utf8");
const taskPage = readFileSync(taskPagePath, "utf8");
const reviewCompletion = readFileSync(reviewCompletionPath, "utf8");
const reviewPage = readFileSync(reviewPagePath, "utf8");

const submitStart = learnActions.indexOf("export async function submitTaskResponse");
assert.ok(submitStart >= 0, "Expected submitTaskResponse to exist.");

const submitSource = learnActions.slice(submitStart);
const submissionInsertIndex = submitSource.indexOf('from("task_submissions").insert');
const payloadPersistIndex = submitSource.indexOf("persistStructuredSubmissionPayload({");
const completionUpsertIndex = submitSource.indexOf('from("task_completions").upsert');
const writingSampleIndex = submitSource.indexOf('from("writing_samples")');
const draftUpsertIndex = submitSource.indexOf('from("task_submission_drafts").upsert');
const dailyCoinsIndex = submitSource.indexOf("maybeAwardDailyCheckInCoins");

assert.match(
  learnActions,
  /import \{ persistStructuredSubmissionPayload \} from "@\/lib\/lessons\/persistence\/submission-payloads";/,
  "Submit action must delegate durable payload persistence to the server-only helper.",
);
assert.doesNotMatch(
  learnActions,
  /createServiceRoleClient|from\("task_submission_payloads"\)/,
  "Submit action must not own service-role setup or direct durable payload inserts.",
);
assert.match(
  payloadPersistence,
  /import "server-only";/,
  "Durable payload persistence helper must be server-only.",
);
assert.match(
  payloadPersistence,
  /taskType === "lesson"[\s\S]*structured_lesson_response[\s\S]*taskType === "test"[\s\S]*structured_test_response/,
  "Payload helper must map lessons and tests to durable payload types.",
);
assert.match(
  payloadPersistence,
  /createServiceRoleClient[\s\S]*from\("task_submission_payloads"\)[\s\S]*insert/,
  "Payload helper must use service-role storage for immutable submitted payload writes.",
);
assert.match(
  submitSource,
  /\.from\("children"\)[\s\S]*\.eq\("id", childId\)[\s\S]*\.eq\("parent_user_id", user\.id\)/,
  "Submit flow must validate the child from trusted server-side parent context.",
);
assert.match(
  submitSource,
  /taskId: task\.id[\s\S]*childId: child\.id[\s\S]*status: "submitted"[\s\S]*payloadValue: safeDraftPayload/,
  "Persisted structured payload must be rebuilt with trusted task and child ids.",
);
assert.ok(
  submissionInsertIndex >= 0,
  "Structured submit must preserve task_submissions insertion.",
);
assert.ok(
  payloadPersistIndex > submissionInsertIndex,
  "Durable structured payload helper must be called immediately after task_submissions.",
);
assert.ok(
  payloadPersistIndex < completionUpsertIndex &&
    payloadPersistIndex < writingSampleIndex &&
    payloadPersistIndex < draftUpsertIndex &&
    payloadPersistIndex < dailyCoinsIndex,
  "Payload persistence must happen before completion, writing samples, drafts, rewards, and other success side effects.",
);
assert.match(
  payloadPersistence,
  /payload_json: structuredResponse/,
  "Durable payload row must store the StructuredLessonResponse object.",
);
assert.doesNotMatch(
  payloadPersistence,
  /payload_json: (safeSubmissionText|combinedSubmissionText|persistedDraftPayload|safeDraftPayload|latestDraftPayload)/,
  "Durable payload row must not store flattened text or the whole draft payload.",
);
assert.match(
  submitSource,
  /if \(!payloadResult\.ok\) \{[\s\S]*\.from\("task_submissions"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id", insertedSubmission\.id\)[\s\S]*redirect\(/,
  "Payload insert failure must roll back the just-created task_submissions row and return a visible error.",
);
assert.match(
  submitSource,
  /hasEmbeddedStructuredResponse[\s\S]*getStructuredLessonResponseFromPayload\(safeDraftPayload\)[\s\S]*hasMeaningfulStructuredLessonResponse\(structuredResponse\)/,
  "Plain-writing submissions must not be routed into durable structured payload storage.",
);
assert.doesNotMatch(
  `${taskPage}\n${reviewCompletion}\n${reviewPage}`,
  /task_submission_payloads/,
  "Pass 2 must not add hydration, approval, or Review Work read-model wiring.",
);

console.log(
  "writing-engine-structured-submission-payload-submit-regression: ok",
);
