import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("app/learn/actions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260717153000_add_idempotent_course_task_submission.sql",
  "utf8",
);
const processor = readFileSync("lib/courses/submission-processing.ts", "utf8");
const controls = readFileSync("components/lesson-submission-controls.tsx", "utf8");
const taskPage = readFileSync("app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx", "utf8");
const reviewPage = readFileSync("app/courses/review/page.tsx", "utf8");

const submitStart = actions.indexOf("export async function submitTaskResponse");
const saveDraftStart = actions.indexOf("export async function saveTaskDraft");
assert.ok(submitStart >= 0 && saveDraftStart > submitStart, "Fast submit action must exist.");
const submitSource = actions.slice(submitStart, saveDraftStart);

assert.match(submitSource, /submission_request_id/, "Submit requires a client request id.");
assert.match(submitSource, /submit_course_task_response_once/, "Submit uses the atomic RPC.");
assert.match(submitSource, /after\(async \(\) =>[\s\S]*processTaskSubmission/, "Auxiliary work runs after the response boundary.");
assert.doesNotMatch(submitSource, /from\("task_submissions"\)\.insert/, "The action cannot directly insert submissions.");
assert.doesNotMatch(submitSource, /writing_samples|misspelling_instances|detectAndStoreFreeWritingEvidenceCandidates/, "The child wait path excludes analysis and evidence.");

assert.match(migration, /add column if not exists submission_request_id uuid/);
assert.match(migration, /task_submissions_request_idempotency_idx/);
assert.match(migration, /pg_advisory_xact_lock/, "Different request ids are serialized per child/task.");
assert.match(
  migration,
  /from public\.courses[\s\S]*id = p_course_id[\s\S]*child_id = p_child_id[\s\S]*parent_user_id = p_parent_user_id/,
  "The atomic boundary must validate the exact course-child-parent relationship.",
);
assert.match(migration, /parent_review_status in \('pending', 'approved'\)/, "Active workflow submissions block resubmission.");
assert.match(migration, /task_submission_payloads[\s\S]*task_completions[\s\S]*task_submission_processing_jobs/, "Payload, completion, and outbox are in the same transaction.");
assert.match(migration, /'outcome', 'duplicate'/);
assert.match(migration, /'outcome', 'already_submitted'/);
assert.match(migration, /'outcome', 'created'/);

assert.match(processor, /status: "processing"/);
assert.match(processor, /status: "completed"/);
assert.match(processor, /status: "failed"/);
assert.match(processor, /replaceAnalysisForSample/);
assert.match(processor, /detectAndStoreFreeWritingEvidenceCandidates/);
assert.match(processor, /maybeAwardDailyCheckInCoins/);
assert.match(processor, /recoverTaskSubmissionJobs/);

assert.match(controls, /useFormStatus/);
assert.match(controls, /disabled=\{!canSubmit\}/);
assert.match(controls, /Submitting your lesson…/);
assert.match(controls, /Your work is safe\. Please wait\./);
assert.match(controls, /crypto\.randomUUID\(\)/);
assert.match(controls, /sessionStorage\.setItem/, "Completed form data is preserved locally before submit.");
assert.match(controls, /restoreForm\(form\)/, "A genuine pre-save error restores preserved form data.");
assert.match(taskPage, /latestSubmission\.parent_review_status === "returned"/, "Returned work is the only existing submission reopened for editing.");
assert.match(taskPage, /readOnly/, "Submitted structured answers are displayed read-only.");
assert.match(reviewPage, /Preparing spelling review…/);

console.log("Structured submission atomic fast-path regression passed.");
