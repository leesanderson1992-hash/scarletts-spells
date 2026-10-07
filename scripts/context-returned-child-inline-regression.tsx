import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StructuredLessonResponse } from "../components/structured-lesson-response";
import { buildStructuredLessonCapture, getStructuredFieldFeedback, type ReturnedWritingIssueDraftPayload } from "../lib/lessons/responses";
import type { StructuredLessonDocument } from "../lib/lessons/schema";

const lesson: StructuredLessonDocument = {
  version: 1, theme: "scarlett-default", title: "Retry test",
  blocks: ["First", "Second", "Third"].map((label) => ({
    block_id: label.toLowerCase(), block_type: "question_textarea" as const, label,
  })),
};
const issue: ReturnedWritingIssueDraftPayload = {
  issue_id: "context-issue", observed_text: "their", approved_replacement: "there",
  child_note: null,
  source_field_key: "/draftPayload/__structured_lesson_response/answers/1/value",
  context_text: "their", position_start: 25, position_end: 30,
  allow_confidence: false, issue_status: "sent_back_to_child",
};
const excerpt = {
  before: "Their bags were wet, but ", focus: "their", after: " coats were dry.",
  answerBlockId: "second",
};

function render(answerBlockId: string | null) {
  return renderToStaticMarkup(<StructuredLessonResponse
    lesson={lesson} submitLabel="Save" readOnly
    initialResponse={{ task_id: "task", child_id: "child", status: "returned",
      answers: [{ block_id: "first", value: "There are bags." },
        { block_id: "second", value: "Their bags were wet, but their coats were dry." }] }}
    returnedIssueFeedback={[issue]}
    returnedContextExcerpts={{ [issue.issue_id]: { ...excerpt, answerBlockId } }}
    saveDraftAction={() => {}}
    draftContext={{ taskId: "task", courseId: "course", childId: "child", redirectPath: "/learn" }}
  />);
}

const html = render("second");
assert.ok(html.indexOf("Second</span>") < html.indexOf("In your first answer:"));
assert.ok(html.indexOf("In your first answer:") < html.indexOf("Third</span>"),
  "The context retry card stays with its answer, before the following answer");
assert.match(html, /but <strong[^>]*>their<\/strong> coats were dry\./,
  "Only the verified occurrence in the original excerpt is emphasized");
assert.equal((html.match(/In your first answer:/g) ?? []).length, 1,
  "The same issue is not repeated in the unmatched panel");

const unresolved = render(null);
assert.ok(unresolved.indexOf("In your first answer:") < unresolved.indexOf("First</span>"),
  "Unverified field mapping stays in the existing fallback instead of attaching to a wrong answer");

const submissionHtml = renderToStaticMarkup(<StructuredLessonResponse
  lesson={lesson} submitLabel="Submit lesson"
  saveDraftAction={() => {}}
  draftContext={{ taskId: "task", courseId: "course", childId: "child", redirectPath: "/learn" }}
/>);
assert.ok(submissionHtml.indexOf("excerpts of your writing are sent to OpenAI") <
  submissionHtml.indexOf("Submit lesson"),
"The structured submission shows the same OpenAI notice before its submit control");

const captured = buildStructuredLessonCapture({ lesson, answerMap: { second: "My answer" },
  feedbackMap: { second: "Explain the answer", "quiz::question-1": "Try this question again" },
  taskId: "task", childId: "child" });
assert.equal(getStructuredFieldFeedback(captured.draftPayload)["quiz::question-1"],
  "Try this question again", "Autosaving a returned lesson retains per-question feedback");

const page = readFileSync("app/(authenticated)/learn/modules/[moduleId]/tasks/[taskId]/page.tsx", "utf8");
assert.match(page, /loadReturnedContextExcerpts\([\s\S]*issueIds: returnedWritingIssues\.map\([\s\S]*parentUserId: user\.id,[\s\S]*childId: selectedChild\.id,[\s\S]*taskId: task\.id/,
  "The child page must request excerpts only for the authenticated owner's returned task");
assert.match(page, /returnedContextExcerpts=\{returnedContextExcerpts\}/);
assert.match(page, /name="submission_text"[\s\S]*returnedWritingIssues\.map\([\s\S]*returnedContextExcerpts\[issue\.issue_id\]\.focus/,
  "The plain-writing retry cards follow their answer box and identify the exact context word");

console.log("Returned context child inline regression passed.");
