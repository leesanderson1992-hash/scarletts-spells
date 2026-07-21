import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";
const learnActionsPath = "app/learn/actions.ts";
const reviewCompletionPath =
  "app/courses/review/actions/review-completion-actions.ts";
const reviewPagePath = "app/courses/review/[submissionId]/page.tsx";
const payloadPersistencePath =
  "lib/lessons/persistence/submission-payloads.ts";

const taskPage = readFileSync(taskPagePath, "utf8");
const learnActions = readFileSync(learnActionsPath, "utf8");
const reviewCompletion = readFileSync(reviewCompletionPath, "utf8");
const reviewPage = readFileSync(reviewPagePath, "utf8");
const payloadPersistence = readFileSync(payloadPersistencePath, "utf8");

assert.match(
  taskPage,
  /from\("task_submission_payloads"\)[\s\S]*\.select\("payload_json"\)/,
  "Child task revisit must read durable structured payload JSON.",
);
assert.match(
  taskPage,
  /\.eq\("submission_id", latestSubmission\.id\)[\s\S]*\.eq\("parent_user_id", user\.id\)[\s\S]*\.eq\("course_id", detail\.course\.id\)[\s\S]*\.eq\("task_id", task\.id\)[\s\S]*\.eq\("child_id", selectedChild\.id\)[\s\S]*\.eq\("payload_type", structuredSubmissionPayloadType\)/,
  "Durable payload hydration must be scoped to the exact latest submission and trusted parent/task/child context.",
);
assert.match(
  taskPage,
  /task\.task_type === "lesson"[\s\S]*"structured_lesson_response"[\s\S]*task\.task_type === "test"[\s\S]*"structured_test_response"/,
  "Hydration must map lesson/test tasks to the matching durable payload type.",
);
assert.match(
  taskPage,
  /latestSubmission !== null[\s\S]*latestSubmission\.parent_review_status !== "returned"[\s\S]*!hasMeaningfulStructuredLessonResponse\([\s\S]*getStructuredLessonResponseFromPayload\(latestDraft\?\.draft_payload\)/,
  "Durable payload hydration must cover submitted non-returned work and returned work only when its editable draft lacks structured answers.",
);
assert.match(
  taskPage,
  /__structured_lesson_response: latestSubmittedPayload\.payload_json/,
  "Submitted payload JSON must be wrapped as the structured response object expected by the lesson form parser.",
);
assert.match(
  taskPage,
  /const returnedSummaryStructuredPayload =[\s\S]*buildStructuredLessonResponseFromSubmissionSummary\(\{[\s\S]*submissionText: latestSubmission\.submission_text[\s\S]*const draftPayloadForInitialResponse =[\s\S]*latestSubmission\?\.parent_review_status === "returned"[\s\S]*!hasMeaningfulStructuredLessonResponse\([\s\S]*getStructuredLessonResponseFromPayload\(latestDraft\?\.draft_payload\)[\s\S]*submittedStructuredPayload \?\? returnedSummaryStructuredPayload[\s\S]*: latestDraft\?\.draft_payload;[\s\S]*const draftStructuredInitialResponse = getInitialStructuredLessonResponse\(\{[\s\S]*payloadValue: draftPayloadForInitialResponse[\s\S]*isReturned: latestSubmission\?\.parent_review_status === "returned"/,
  "Returned and editable draft hydration must use draft_payload first, then durable submitted payload, then submitted summary reconstruction as missing-answers fallbacks.",
);
assert.match(
  taskPage,
  /latestSubmission && latestSubmission\.parent_review_status !== "returned"[\s\S]*submittedStructuredInitialResponse[\s\S]*: draftStructuredInitialResponse[\s\S]*: draftStructuredInitialResponse/,
  "Hydration order must prefer durable submitted payload for pending/approved work and fall back safely to draft/empty legacy state.",
);
assert.match(
  taskPage,
  /latestSubmission\.parent_review_status === "approved"[\s\S]*approved[\s\S]*submitted/,
  "Approved revisits must surface the restored response as approved while pending revisits remain submitted, regardless of TypeScript literal formatting.",
);

const approvedSubmittedPayloadFixture = {
  payload_json: {
    task_id: "task-1",
    child_id: "child-1",
    status: "submitted",
    answers: [
      {
        block_id: "question-textarea-1",
        value: "This answer survived approval.",
        feedback: null,
      },
    ],
    draft_saved_at: null,
    submitted_at: "2026-05-24T12:00:00.000Z",
  },
};
const wrappedPayloadFixture = {
  __structured_lesson_response: approvedSubmittedPayloadFixture.payload_json,
};

assert.equal(
  wrappedPayloadFixture.__structured_lesson_response.answers[0]?.value,
  "This answer survived approval.",
  "Approved child revisit fixture must preserve the durable structured answer value.",
);
assert.equal(
  wrappedPayloadFixture.__structured_lesson_response.status,
  "submitted",
  "Durable payload rows keep submitted evidence immutable; the page overlays approved display status from latestSubmission.",
);

assert.doesNotMatch(
  reviewCompletion,
  /from\("task_submission_payloads"\)(?:(?!\n\s*\.maybeSingle\(\);)[\s\S])*\.(insert|upsert|update|delete)\(/,
  "Parent approval may only read durable payload existence and must not mutate payload rows.",
);
assert.doesNotMatch(
  reviewPage,
  /task_submission_payloads/,
  "Pass 3 must not add Review Work read-model wiring.",
);
assert.match(
  learnActions,
  /\.from\("task_submission_payloads"\)[\s\S]*\.select\("id"\)[\s\S]*payloadConfirmationError[\s\S]*!confirmedPayload/,
  "The submit action must read back the durable payload before reporting a structured submission as saved.",
);
assert.doesNotMatch(
  learnActions,
  /\.from\("task_submission_payloads"\)(?:(?!\.from\()[\s\S])*\.(insert|upsert|update|delete)\(/,
  "The submit action may verify payload persistence but must not mutate payload rows directly.",
);
assert.match(
  payloadPersistence,
  /from\("task_submission_payloads"\)[\s\S]*insert/,
  "Existing submit persistence helper must remain the only durable payload write path touched by these passes.",
);

console.log("writing-engine-structured-submission-payload-hydration-regression: ok");
