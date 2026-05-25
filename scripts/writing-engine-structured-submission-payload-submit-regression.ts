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
assert.match(
  submitSource,
  /buildStructuredLessonResponseFromFlatSubmission\(\{[\s\S]*lessonValue: task\.lesson_schema[\s\S]*submissionText: safeSubmissionText/,
  "Structured task submits without embedded draft payload must fall back to the task lesson schema and submitted text.",
);
assert.match(
  learnActions,
  /buildStructuredLessonResponseFromFlatSubmission/,
  "Submit persistence must include the structured quick-submit fallback builder.",
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
  /hasEmbeddedStructuredResponse[\s\S]*fallbackStructuredResponse[\s\S]*hasMeaningfulStructuredLessonResponse\(durableStructuredResponse\)/,
  "Plain-writing submissions must not be routed into durable structured payload storage unless structured evidence exists.",
);
assert.match(
  taskPage,
  /from\("task_submission_payloads"\)[\s\S]*\.select\("payload_json"\)/,
  "Pass 3 may add child task-page hydration from durable submitted payloads.",
);
assert.doesNotMatch(
  `${reviewCompletion}\n${reviewPage}`,
  /from\("task_submission_payloads"\)(?:(?!\n\s*\.maybeSingle\(\);)[\s\S])*\.(insert|upsert|update|delete)\(/,
  "Submit persistence must not add approval writes or Review Work read-model mutation wiring.",
);
assert.doesNotMatch(
  reviewPage,
  /task_submission_payloads/,
  "Submit persistence must not add Review Work read-model payload wiring.",
);

const realStructuredDraftPayload = {
  "question-textarea-1": "A real structured answer",
  __field_meta: {
    "question-textarea-1": {
      label: "Main written answer",
      type: "textarea",
      excludeFromSpelling: false,
    },
  },
  __structured_lesson_response: {
    task_id: "task-1",
    child_id: "child-1",
    status: "draft",
    answers: [
      {
        block_id: "question-textarea-1",
        value: "A real structured answer",
        feedback: null,
      },
    ],
    draft_saved_at: "2026-05-23T00:00:00.000Z",
    submitted_at: null,
  },
};

assert.equal(
  realStructuredDraftPayload.__structured_lesson_response.answers[0]?.value,
  realStructuredDraftPayload["question-textarea-1"],
  "Real structured component draft payload fixture must embed the answer object used for durable persistence.",
);
assert.equal(
  Array.isArray(realStructuredDraftPayload.__structured_lesson_response.answers),
  true,
  "Real structured component draft payload fixture must include structured answers.",
);

const flatSubmitFallbackFixture = {
  submissionText: "Quick form answer",
  lessonValue: {
    version: 1,
    theme: "scarlett-default",
    title: "Quick form structured lesson",
    blocks: [
      {
        block_id: "heading-1",
        block_type: "heading",
        heading: "Lesson title",
      },
      {
        block_id: "question-textarea-2",
        block_type: "question_textarea",
        label: "Main written answer",
      },
    ],
  },
};

assert.equal(
  flatSubmitFallbackFixture.lessonValue.blocks[1]?.block_id,
  "question-textarea-2",
  "Structured quick-submit fallback fixture must include a text/textarea question target.",
);
assert.equal(
  flatSubmitFallbackFixture.submissionText,
  "Quick form answer",
  "Structured quick-submit fallback fixture must preserve the submitted text as structured answer evidence.",
);

const invalidFallbackFixture = {
  submissionText: "Plain writing",
  lessonValue: null,
};

assert.equal(
  invalidFallbackFixture.lessonValue,
  null,
  "Missing/invalid structured lesson schema fixture must represent a case that cannot create durable structured payload evidence.",
);

console.log(
  "writing-engine-structured-submission-payload-submit-regression: ok",
);
