import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reviewCompletionPath =
  "app/courses/review/actions/review-completion-actions.ts";
const learnActionsPath = "app/learn/actions.ts";
const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";
const reviewPagePath = "app/courses/review/[submissionId]/page.tsx";

const reviewCompletion = readFileSync(reviewCompletionPath, "utf8");
const learnActions = readFileSync(learnActionsPath, "utf8");
const taskPage = readFileSync(taskPagePath, "utf8");
const reviewPage = readFileSync(reviewPagePath, "utf8");

const approveStart = reviewCompletion.indexOf(
  "export async function approveSubmissionReviewImpl",
);
assert.ok(approveStart >= 0, "Expected approveSubmissionReviewImpl to exist.");

const approveSource = reviewCompletion.slice(approveStart);
const returnStart = reviewCompletion.indexOf(
  "export async function returnSubmissionToChildImpl",
);
const returnEnd = approveStart;
assert.ok(returnStart >= 0, "Expected returnSubmissionToChildImpl to exist.");
assert.ok(returnStart < returnEnd, "Expected return flow to precede approval flow.");
const returnSource = reviewCompletion.slice(returnStart, returnEnd);

assert.match(
  reviewCompletion,
  /function getStructuredSubmissionPayloadTypeForReview\(task: \{[\s\S]*lesson_schema\?: unknown[\s\S]*hasStructuredLessonSchema[\s\S]*task\.task_type === "lesson"[\s\S]*"structured_lesson_response"[\s\S]*task\.task_type === "test"[\s\S]*"structured_test_response"/,
  "Approval cleanup safety must classify only structured lesson/test tasks for durable payload checks.",
);
assert.match(
  reviewCompletion,
  /if \(!hasStructuredLessonSchema\) \{[\s\S]*return null;[\s\S]*\}/,
  "Non-structured lesson/test and plain-writing tasks must not enter the protective durable-payload gate.",
);
assert.match(
  approveSource,
  /\.from\("course_tasks"\)[\s\S]*\.select\("id, title, task_type, lesson_schema, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount"\)/,
  "Approval must load lesson_schema so only structured lesson/test submissions receive guarded draft cleanup.",
);

const approvalUpdateIndex = approveSource.indexOf('parent_review_status: "approved"');
const payloadCheckIndex = approveSource.indexOf('from("task_submission_payloads")');
const draftDeleteIndex = approveSource.indexOf('from("task_submission_drafts")');
assert.ok(approvalUpdateIndex >= 0, "Approval must still mark the submission approved.");
assert.ok(payloadCheckIndex > approvalUpdateIndex, "Durable payload lookup must not block the approval status update.");
assert.ok(draftDeleteIndex > payloadCheckIndex, "Draft deletion must happen only after the durable payload existence decision.");

assert.match(
  approveSource,
  /const structuredPayloadType = getStructuredSubmissionPayloadTypeForReview\(task\);[\s\S]*let shouldDeleteDraft = true;/,
  "Plain-writing approval behaviour must default to the existing draft cleanup path.",
);
assert.match(
  approveSource,
  /if \(structuredPayloadType\) \{[\s\S]*from\("task_submission_payloads"\)[\s\S]*\.select\("id"\)[\s\S]*\.eq\("submission_id", submission\.id\)[\s\S]*\.eq\("parent_user_id", user\.id\)[\s\S]*\.eq\("course_id", submission\.course_id\)[\s\S]*\.eq\("task_id", submission\.task_id\)[\s\S]*\.eq\("child_id", submission\.child_id\)[\s\S]*\.eq\("payload_type", structuredPayloadType\)[\s\S]*\.maybeSingle\(\);[\s\S]*shouldDeleteDraft = Boolean\(durablePayload\);[\s\S]*\}/,
  "Structured approval must check for a durable payload row scoped to the approved submission before deleting drafts.",
);
assert.match(
  approveSource,
  /if \(shouldDeleteDraft\) \{[\s\S]*from\("task_submission_drafts"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("task_id", submission\.task_id\)[\s\S]*\.eq\("child_id", submission\.child_id\)[\s\S]*\.eq\("parent_user_id", user\.id\)/,
  "Approved structured submissions with durable payloads must still allow existing draft cleanup.",
);
assert.match(
  approveSource,
  /shouldDeleteDraft = Boolean\(durablePayload\);/,
  "Approved structured submissions without durable payload rows must skip draft deletion.",
);
assert.doesNotMatch(
  approveSource,
  /from\("task_submission_payloads"\)(?:(?!\n\s*\.maybeSingle\(\);)[\s\S])*\.(insert|upsert|update|delete)\(/,
  "Approval must never delete, overwrite, or mutate task_submission_payloads.",
);

assert.match(
  returnSource,
  /parent_review_status: "returned"[\s\S]*from\("task_submission_drafts"\)[\s\S]*\.upsert\([\s\S]*draft_payload: mergedDraftPayload/,
  "Returned/send-back must remain draft-first and editable with merged draft feedback.",
);
assert.match(
  returnSource,
  /!hasMeaningfulStructuredLessonResponse\([\s\S]*getStructuredLessonResponseFromPayload\(existingDraft\?\.draft_payload\)[\s\S]*from\("task_submission_payloads"\)[\s\S]*\.select\("payload_json"\)/,
  "Returned/send-back must fall back to durable submitted payload only when the editable draft lacks structured answers.",
);
assert.match(
  returnSource,
  /buildStructuredLessonResponseFromSubmissionSummary\(\{[\s\S]*submissionText: submission\.submission_text[\s\S]*getStructuredDraftPayloadSeed\(\{[\s\S]*existingDraftPayload: existingDraft\?\.draft_payload,[\s\S]*durablePayloadJson: durableReturnedPayload\?\.payload_json,[\s\S]*summaryResponse: summaryReturnedResponse/,
  "Returned/send-back must seed the editable draft from existing draft first, then durable payload, then submitted summary fallback.",
);
assert.doesNotMatch(
  returnSource,
  /from\("task_submission_payloads"\)(?:(?!\n\s*\.maybeSingle\(\);)[\s\S])*\.(insert|upsert|update|delete)\(/,
  "Returned/send-back must never mutate durable payload rows.",
);

assert.match(
  taskPage,
  /latestSubmission && latestSubmission\.parent_review_status !== "returned"[\s\S]*submittedStructuredInitialResponse[\s\S]*: draftStructuredInitialResponse[\s\S]*: draftStructuredInitialResponse/,
  "Child hydration order must remain unchanged: returned work stays draft-first, submitted/approved may use durable payload.",
);
assert.match(
  learnActions,
  /persistStructuredSubmissionPayload\(/,
  "Submit persistence must remain in the existing submit path.",
);
assert.doesNotMatch(
  learnActions,
  /getStructuredSubmissionPayloadTypeForApproval|shouldDeleteDraft/,
  "Approval draft-deletion safety must not alter submit persistence.",
);
assert.doesNotMatch(
  reviewPage,
  /task_submission_payloads/,
  "Pass 4 must not add Review Work read-model payload wiring.",
);

console.log(
  "writing-engine-structured-submission-approval-draft-safety-regression: ok",
);
