import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const structuredLessonResponsePath = "components/structured-lesson-response.tsx";
const lessonResponsesPath = "lib/lessons/responses.ts";
const learnActionsPath = "app/learn/actions.ts";
const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";
const reviewDetailPagePath = "app/courses/review/[submissionId]/page.tsx";
const reviewCompletionActionsPath =
  "app/courses/review/actions/review-completion-actions.ts";
const returnedCorrectionReviewPath =
  "lib/writing-engine/persistence/returned-correction-review.ts";

const structuredLessonResponse = readFileSync(structuredLessonResponsePath, "utf8");
const lessonResponses = readFileSync(lessonResponsesPath, "utf8");
const learnActions = readFileSync(learnActionsPath, "utf8");
const taskPage = readFileSync(taskPagePath, "utf8");
const reviewDetailPage = readFileSync(reviewDetailPagePath, "utf8");
const reviewCompletionActions = readFileSync(reviewCompletionActionsPath, "utf8");
const returnedCorrectionReview = readFileSync(returnedCorrectionReviewPath, "utf8");

assert.match(
  lessonResponses,
  /attempted_correction\?: string \| null;/,
  "Returned writing issue payload must preserve child retry attempt text.",
);
assert.match(
  lessonResponses,
  /typeof rawIssue\.attempted_correction === "string"[\s\S]*rawIssue\.attempted_correction[\s\S]*: null/,
  "Returned writing issue parser must hydrate attempted_correction from draft metadata.",
);

assert.match(
  structuredLessonResponse,
  /const returnedIssueInlineKeys = useMemo\([\s\S]*question_text[\s\S]*question_textarea[\s\S]*comprehension_quiz_group[\s\S]*`\$\{block\.block_id\}::\$\{question\.question_id\}`/,
  "Structured child UI must know which returned issues can render inline beside lesson fields.",
);
assert.match(
  structuredLessonResponse,
  /const unmatchedReturnedIssues = useMemo\([\s\S]*!issue\.source_field_key[\s\S]*!returnedIssueInlineKeys\.has\(issue\.source_field_key\)/,
  "Returned issues without a source_field_key match must be collected for fallback rendering.",
);
assert.match(
  structuredLessonResponse,
  /function renderUnmatchedReturnedIssueFeedback\(\)[\s\S]*Fix these spellings[\s\S]*unmatchedReturnedIssues\.map/,
  "Structured child UI must render a fallback returned-issues panel.",
);
assert.match(
  structuredLessonResponse,
  /name=\{`returned_issue_attempt:\$\{issue\.issue_id\}`\}[\s\S]*defaultValue=\{issue\.attempted_correction \?\? ""\}/,
  "Spelling-like returned issues must include a dedicated retry input that reloads saved draft attempt text.",
);
assert.match(
  structuredLessonResponse,
  /issue\.allow_confidence \? \([\s\S]*returned_issue_attempt:[\s\S]*How did this feel\?/,
  "Retry input and easy/medium/hard reflection must remain scoped to spelling-like returned issues.",
);
assert.doesNotMatch(
  structuredLessonResponse,
  /needed_help|could_not_fix/,
  "This pass must not expose needed_help or could_not_fix in the child UI.",
);

assert.match(
  learnActions,
  /const attemptedCorrectionValue = formData\.get\(`returned_issue_attempt:\$\{issue\.issue_id\}`\)/,
  "Returned issue form parsing must read the dedicated retry input.",
);
assert.match(
  learnActions,
  /attemptedCorrectionValue\.trim\(\)\.slice\(0, 500\)[\s\S]*attempted_correction: attemptedCorrection/,
  "Returned issue form parsing must bound and persist retry text into draft metadata.",
);
assert.match(
  learnActions,
  /if \(issue\.attempted_correction\?\.trim\(\)\) \{[\s\S]*return issue\.attempted_correction\.trim\(\);[\s\S]*\}/,
  "Correction-attempt inserts must prefer the dedicated retry input over full-field fallback text.",
);
assert.match(
  learnActions,
  /\.from\("writing_issue_correction_attempts"\)[\s\S]*\.insert\(attemptRows\)/,
  "Returned child resubmission must continue to write durable correction attempts.",
);
assert.match(
  learnActions,
  /draftPayloadWithReturnedIssueInputs[\s\S]*__writing_issue_feedback: returnedWritingIssues[\s\S]*draft_payload: draftPayloadWithReturnedIssueInputs/,
  "Explicit Save draft must preserve returned issue retry/reflection metadata when submitted through the full form.",
);

assert.match(
  taskPage,
  /returnedIssueFeedback=\{returnedWritingIssues\}/,
  "Structured lesson child page must continue to pass returned issue feedback into the structured response component.",
);
assert.doesNotMatch(
  taskPage,
  /manual_writing_sample|sample_/,
  "Returned-child structured correction pass must not broaden into manual writing sample routing.",
);

assert.match(
  reviewCompletionActions,
  /async function materializeReturnedSpellingIssuesFromCandidates/,
  "Review Work send-back must own the bridge from raw spelling candidates to returned child feedback.",
);
assert.match(
  reviewCompletionActions,
  /if \(!input\.structuredPayloadType\) \{[\s\S]*return false;[\s\S]*\}/,
  "Candidate materialization must stay scoped to structured lesson/test returns.",
);
assert.match(
  reviewCompletionActions,
  /\.from\("misspelling_instances"\)[\s\S]*\.from\("writing_issues"\)\.insert\(rowsToInsert\)/,
  "Send-back must materialize eligible raw misspelling candidates into durable writing_issues.",
);
assert.match(
  reviewCompletionActions,
  /source_misspelling_instance_id: misspelling\.id/,
  "Materialized returned writing issues must preserve source_misspelling_instance_id linkage.",
);
assert.match(
  reviewCompletionActions,
  /!\(misspelling\.is_false_positive \?\? false\)[\s\S]*!isSuppressedFalsePositivePair[\s\S]*!durableMisspellingIds\.has\(misspelling\.id\)[\s\S]*!verifiedMisspellingIds\.has\(misspelling\.id\)[\s\S]*\(!suggestion \|\| suggestion\.suggestion_status === "pending"\)/,
  "Materialization must exclude false-positive, already durable, verified, and non-pending suggestion candidates.",
);
assert.doesNotMatch(
  reviewCompletionActions,
  /eligibleMisspellings = misspellings\.filter[\s\S]*!isParentAuthoredMisspellingRow\(misspelling\)/,
  "Parent-authored missed words must remain eligible for returned-child correction materialization.",
);
assert.match(
  reviewCompletionActions,
  /const isParentAddedMissedWord = isParentAuthoredMisspellingRow\(misspelling\)/,
  "Materialized rows must detect parent-authored missed-word provenance.",
);
assert.match(
  reviewCompletionActions,
  /source_kind: isParentAddedMissedWord[\s\S]*"parent_authored_missed_word"[\s\S]*parent_authored_missed_word: isParentAddedMissedWord/,
  "Materialized parent-added missed words must preserve parent-authored provenance metadata.",
);
assert.match(
  reviewCompletionActions,
  /\.from\("writing_issues"\)[\s\S]*\.select\("source_misspelling_instance_id"\)[\s\S]*const durableMisspellingIds = new Set/,
  "Materialization must dedupe against all linked writing_issues, including finalised rows.",
);
assert.match(
  reviewCompletionActions,
  /const materializedCandidateIssues =[\s\S]*materializeReturnedSpellingIssuesFromCandidates[\s\S]*if \(materializedCandidateIssues\) \{[\s\S]*refreshedLinkedWritingIssues/,
  "Send-back must refetch durable writing_issues after candidate materialization before building __writing_issue_feedback.",
);
assert.match(
  reviewCompletionActions,
  /__field_feedback: safeFieldFeedback,[\s\S]*__writing_issue_feedback: returnedIssuePayload/,
  "Returned draft payload must preserve field feedback while attaching returned writing issue feedback.",
);
assert.doesNotMatch(
  reviewCompletionActions,
  /\.from\("task_submission_payloads"\)\s*\n\s*\.(update|upsert|insert)\(/,
  "Review Work send-back must not mutate durable submitted payload evidence.",
);

assert.match(
  returnedCorrectionReview,
  /export async function loadReturnedCorrectionReviewItemsForSubmission/,
  "Review Work detail must use a focused returned-correction read helper.",
);
assert.match(
  returnedCorrectionReview,
  /\.from\("writing_issue_correction_attempts"\)[\s\S]*\.eq\("task_submission_id", input\.submissionId\)/,
  "Returned-correction read helper must start from correction attempts on the current resubmission.",
);
assert.match(
  returnedCorrectionReview,
  /\.from\("writing_issues"\)[\s\S]*\.in\("id", writingIssueIds\)/,
  "Returned-correction read helper must follow attempts back to original writing_issues.",
);
assert.match(
  returnedCorrectionReview,
  /source_kind[\s\S]*parent_authored_missed_word[\s\S]*parentAuthoredMissedWord/,
  "Returned-correction read helper must preserve parent-authored missed-word provenance.",
);
assert.doesNotMatch(
  returnedCorrectionReview,
  /\.from\("writing_issues"\)\s*\n\s*\.(insert|upsert)\(/,
  "Returned-correction read helper must not duplicate writing_issues onto the new submission.",
);
assert.doesNotMatch(
  returnedCorrectionReview,
  /\.from\("task_submission_payloads"\)/,
  "Returned-correction read helper must not read or mutate durable submitted payload rows.",
);

assert.match(
  reviewDetailPage,
  /loadReturnedCorrectionReviewItemsForSubmission\([\s\S]*submissionId: submission\.id[\s\S]*parentUserId: user\.id[\s\S]*childId: submission\.child_id/,
  "Review Work detail must load returned corrections for the current pending resubmission.",
);
assert.match(
  reviewDetailPage,
  /function ReturnedCorrectionsSection\([\s\S]*Returned corrections[\s\S]*Child correction responses/,
  "Review Work detail must render returned correction attempts in a separate section.",
);
assert.match(
  reviewDetailPage,
  /name="writing_issue_id"[\s\S]*value=\{item\.originalWritingIssueId\}/,
  "Returned correction final classification must target the original writing_issue.id.",
);
assert.match(
  reviewDetailPage,
  /action=\{finaliseWritingIssueClassification\}/,
  "Returned correction section must use the existing final-classification action.",
);

console.log("writing-engine-returned-child-correction-regression: ok");
