import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("app/learn/actions.ts", "utf8");
const reviewPage = readFileSync("app/courses/review/page.tsx", "utf8");
const reviewUtils = readFileSync("app/courses/review/review-utils.ts", "utf8");
const childQueries = readFileSync("lib/courses/queries.ts", "utf8");
const returnedResubmissionMigration = readFileSync(
  "supabase/migrations/20260721110000_allow_returned_task_resubmission_after_historical_pending.sql",
  "utf8",
);

const submitStart = actions.indexOf("export async function submitTaskResponse");
const draftStart = actions.indexOf("export async function saveTaskDraft");
assert.ok(submitStart >= 0 && draftStart > submitStart);
const submitAction = actions.slice(submitStart, draftStart);

assert.match(
  submitAction,
  /result\.outcome === "already_submitted"[\s\S]*already waiting for review/,
  "An existing pending submission must not be presented as a newly sent-back lesson.",
);
assert.match(
  submitAction,
  /from\("task_submissions"\)[\s\S]*parent_review_status !== "pending"/,
  "The action must confirm the saved submission is a new pending review item.",
);
assert.match(
  submitAction,
  /from\("task_submission_payloads"\)[\s\S]*payload_type[\s\S]*!confirmedPayload/,
  "Structured resubmission must confirm its durable answer payload before showing success.",
);
assert.match(
  submitAction,
  /revalidatePath\("\/courses\/review"\)[\s\S]*revalidatePath\(`\/courses\/review\/\$\{result\.submissionId\}`\)/,
  "The parent queue and new review detail must refresh after a confirmed submission.",
);

assert.match(
  reviewPage,
  /const returnedTaskIds = new Set\([\s\S]*parent_review_status === "returned"/,
  "Review Work must retain returned-thread context for the later pending submission.",
);
assert.match(
  reviewPage,
  /hasReturnedSubmissionHistory: returnedTaskIds\.has\(submission\.task_id\)/,
  "Each review row must receive its thread's returned-history signal.",
);
assert.match(
  reviewUtils,
  /parent_review_status === "returned"[\s\S]*sent_back_to_child[\s\S]*hasReturnedSubmissionHistory[\s\S]*child_resubmitted/,
  "A returned row stays sent back, while its later pending row becomes Child resubmitted.",
);
assert.match(
  reviewUtils,
  /right\.created_at\.localeCompare\(left\.created_at\)/,
  "Equal submission timestamps must have a deterministic newest-row tie-breaker.",
);
assert.match(
  childQueries,
  /submitted_at, created_at, parent_review_status[\s\S]*\.order\("submitted_at", \{ ascending: false \}\)[\s\S]*\.order\("created_at", \{ ascending: false \}\)/,
  "Child lesson queries must use the same deterministic latest-submission ordering.",
);
assert.match(
  returnedResubmissionMigration,
  /from public\.task_submissions[\s\S]*task_id = p_task_id[\s\S]*order by submitted_at desc, created_at desc[\s\S]*v_existing\.parent_review_status in \('pending', 'approved'\)/,
  "Only the newest submission may block a returned lesson retry; historical active rows must not.",
);

console.log("Returned lesson resubmission regression passed.");
