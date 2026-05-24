import {
  type LessonChoiceOption,
  type LessonComprehensionQuizGroupBlock,
  type LessonRepeatableInterviewBlock,
  type LessonTableQuestionBlock,
  isStructuredLessonDocument,
  type StructuredLessonAnswerValue,
  type StructuredLessonDocument,
  type StructuredLessonAnswer,
  type StructuredLessonResponse,
  type StructuredLessonResponseStatus,
  type StructuredLessonQuizAnswerValue,
} from "@/lib/lessons/schema";
import type { WritingIssueReflection } from "@/lib/writing-practice/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStructuredAnswerValue(
  value: unknown,
): value is StructuredLessonAnswer["value"] {
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) =>
      typeof item === "string" || isPlainObject(item),
    );
  }

  return isPlainObject(value);
}

export function normaliseLessonDraftPayload(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export function getLegacyFieldFeedback(
  payloadValue: unknown,
): Record<string, string> {
  const payload = normaliseLessonDraftPayload(payloadValue);
  const rawFeedback = payload.__field_feedback;

  if (!isPlainObject(rawFeedback)) {
    return {};
  }

  const feedbackEntries = Object.entries(rawFeedback).flatMap(([key, value]) =>
    typeof value === "string" && value.trim().length > 0 ? [[key, value.trim()] as const] : [],
  );

  return Object.fromEntries(feedbackEntries);
}

export function getStructuredFieldFeedback(
  payloadValue: unknown,
): Record<string, string> {
  return getLegacyFieldFeedback(payloadValue);
}

export type ReturnedWritingIssueDraftPayload = {
  issue_id: string;
  observed_text: string | null;
  approved_replacement: string | null;
  child_note: string | null;
  source_field_key: string | null;
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
  allow_confidence: boolean;
  issue_status: "sent_back_to_child";
  marked_fixed?: boolean;
  reflection?: WritingIssueReflection;
};

export function getReturnedWritingIssueFeedback(
  payloadValue: unknown,
): ReturnedWritingIssueDraftPayload[] {
  const payload = normaliseLessonDraftPayload(payloadValue);
  const rawIssues = payload.__writing_issue_feedback;

  if (!Array.isArray(rawIssues)) {
    return [];
  }

  return rawIssues.flatMap((rawIssue) => {
    if (!isPlainObject(rawIssue) || typeof rawIssue.issue_id !== "string") {
      return [];
    }

    const reflection: WritingIssueReflection | undefined =
      rawIssue.reflection === "easy" ||
      rawIssue.reflection === "medium" ||
      rawIssue.reflection === "hard" ||
      rawIssue.reflection === "needed_help" ||
      rawIssue.reflection === "could_not_fix"
        ? rawIssue.reflection
        : undefined;

    return [
      {
        issue_id: rawIssue.issue_id,
        observed_text:
          typeof rawIssue.observed_text === "string" ? rawIssue.observed_text : null,
        approved_replacement:
          typeof rawIssue.approved_replacement === "string"
            ? rawIssue.approved_replacement
            : null,
        child_note:
          typeof rawIssue.child_note === "string" ? rawIssue.child_note : null,
        source_field_key:
          typeof rawIssue.source_field_key === "string"
            ? rawIssue.source_field_key
            : null,
        context_text:
          typeof rawIssue.context_text === "string" ? rawIssue.context_text : null,
        position_start:
          typeof rawIssue.position_start === "number" ? rawIssue.position_start : null,
        position_end:
          typeof rawIssue.position_end === "number" ? rawIssue.position_end : null,
        allow_confidence: Boolean(rawIssue.allow_confidence),
        issue_status: "sent_back_to_child",
        marked_fixed: rawIssue.marked_fixed === true,
        reflection,
      },
    ];
  });
}

export function buildStructuredAnswersFromLegacyPayload(
  payloadValue: unknown,
): StructuredLessonAnswer[] {
  const payload = normaliseLessonDraftPayload(payloadValue);
  const feedbackByField = getLegacyFieldFeedback(payload);

  return Object.entries(payload)
    .filter(([key]) => !key.startsWith("__"))
    .flatMap(([blockId, value]) => {
      if (!isStructuredAnswerValue(value)) {
        return [];
      }

      return [
        {
          block_id: blockId,
          value,
          feedback: feedbackByField[blockId] ?? null,
        } satisfies StructuredLessonAnswer,
      ];
    });
}

export function buildStructuredLessonResponseFromLegacyPayload({
  taskId,
  childId,
  status,
  payloadValue,
  submittedAt,
}: {
  taskId: string;
  childId: string;
  status: StructuredLessonResponseStatus;
  payloadValue: unknown;
  submittedAt?: string | null;
}): StructuredLessonResponse {
  return {
    task_id: taskId,
    child_id: childId,
    status,
    answers: buildStructuredAnswersFromLegacyPayload(payloadValue),
    draft_saved_at: status === "draft" ? new Date().toISOString() : null,
    submitted_at: submittedAt ?? (status === "submitted" ? new Date().toISOString() : null),
  };
}

function isQuizAnswerValue(value: unknown): value is StructuredLessonQuizAnswerValue {
  return (
    isPlainObject(value) &&
    typeof value.score === "number" &&
    typeof value.total_questions === "number" &&
    typeof value.percentage === "number" &&
    typeof value.understanding_band === "string" &&
    isPlainObject(value.selected_answers) &&
    isPlainObject(value.correctness_by_question)
  );
}

export type StructuredLessonAnswerMap = Record<string, StructuredLessonAnswerValue>;

export type StructuredLessonDraftFieldMeta = {
  label: string;
  type: string;
  excludeFromSpelling?: boolean;
};

export type StructuredLessonDraftPayload = Record<string, unknown> & {
  __field_meta: Record<string, StructuredLessonDraftFieldMeta>;
  __structured_lesson_response: StructuredLessonResponse;
};

function resolveExcludeFromSpelling(
  blockId: string,
  configuredValue: boolean | undefined,
  fallback: boolean,
) {
  if (blockId === "ai-prompt" || blockId === "summary-prompt") {
    return false;
  }

  return configuredValue ?? fallback;
}

function getInputValue(answerMap: StructuredLessonAnswerMap, blockId: string) {
  const value = answerMap[blockId];
  return typeof value === "string" ? value : "";
}

function getChoiceValue(answerMap: StructuredLessonAnswerMap, blockId: string) {
  const value = answerMap[blockId];
  return typeof value === "string" ? value : "";
}

function getChoiceValues(answerMap: StructuredLessonAnswerMap, blockId: string) {
  const value = answerMap[blockId];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getTableRows(answerMap: StructuredLessonAnswerMap, block: LessonTableQuestionBlock) {
  const value = answerMap[block.block_id];

  if (!Array.isArray(value)) {
    return Array.from({ length: block.row_count }, () =>
      Object.fromEntries(block.columns.map((column) => [column.column_id, ""])),
    ) as Array<Record<string, string>>;
  }

  return Array.from({ length: block.row_count }, (_, rowIndex) => {
    const row = value[rowIndex];
    const safeRow = isPlainObject(row) ? row : {};
    return Object.fromEntries(
      block.columns.map((column) => [
        column.column_id,
        typeof safeRow[column.column_id] === "string" ? safeRow[column.column_id] : "",
      ]),
    );
  });
}

function getInterviewRows(answerMap: StructuredLessonAnswerMap, block: LessonRepeatableInterviewBlock) {
  const value = answerMap[block.block_id];

  if (!Array.isArray(value)) {
    return Array.from({ length: block.repeat_count }, () =>
      Object.fromEntries(block.questions.map((question) => [question.question_id, ""])),
    ) as Array<Record<string, string>>;
  }

  return Array.from({ length: block.repeat_count }, (_, rowIndex) => {
    const row = value[rowIndex];
    const safeRow = isPlainObject(row) ? row : {};
    return Object.fromEntries(
      block.questions.map((question) => [
        question.question_id,
        typeof safeRow[question.question_id] === "string"
          ? safeRow[question.question_id]
          : "",
      ]),
    );
  });
}

export function getQuizValue(
  answerMap: StructuredLessonAnswerMap,
  block: LessonComprehensionQuizGroupBlock,
): StructuredLessonQuizAnswerValue {
  const value = answerMap[block.block_id];

  if (isPlainObject(value)) {
    const selectedAnswers = isPlainObject(value.selected_answers)
      ? Object.fromEntries(
          Object.entries(value.selected_answers).flatMap(([questionId, selectedValue]) =>
            typeof selectedValue === "string" ? [[questionId, selectedValue] as const] : [],
          ),
        )
      : {};

    const score = typeof value.score === "number" ? value.score : 0;
    const totalQuestions =
      typeof value.total_questions === "number" ? value.total_questions : block.questions.length;
    const percentage =
      typeof value.percentage === "number"
        ? value.percentage
        : totalQuestions > 0
          ? Math.round((score / totalQuestions) * 100)
          : 0;

    return {
      selected_answers: selectedAnswers,
      correctness_by_question: isPlainObject(value.correctness_by_question)
        ? Object.fromEntries(
            Object.entries(value.correctness_by_question).flatMap(([questionId, isCorrect]) =>
              typeof isCorrect === "boolean" ? [[questionId, isCorrect] as const] : [],
            ),
          )
        : {},
      score,
      total_questions: totalQuestions,
      percentage,
      understanding_band:
        value.understanding_band === "secure" ||
        value.understanding_band === "developing" ||
        value.understanding_band === "review_needed"
          ? value.understanding_band
          : "review_needed",
    };
  }

  return {
    selected_answers: {},
    correctness_by_question: {},
    score: 0,
    total_questions: block.questions.length,
    percentage: 0,
    understanding_band: "review_needed",
  };
}

function choiceLabel(options: LessonChoiceOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function flattenDraftValue(value: StructuredLessonAnswerValue) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string")
      ? value.join(", ")
      : JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function buildStructuredLessonCapture({
  lesson,
  answerMap,
  feedbackMap,
  taskId,
  childId,
  status = "draft",
}: {
  lesson: StructuredLessonDocument;
  answerMap: StructuredLessonAnswerMap;
  feedbackMap?: Record<string, string>;
  taskId: string;
  childId: string;
  status?: StructuredLessonResponseStatus;
}) {
  const lines: string[] = [];
  const fieldMeta: Record<string, StructuredLessonDraftFieldMeta> = {};
  const answers: StructuredLessonResponse["answers"] = [];

  lesson.blocks.forEach((block) => {
    switch (block.block_type) {
      case "question_text":
      case "question_textarea": {
        const value = getInputValue(answerMap, block.block_id).trim();
        fieldMeta[block.block_id] = {
          label: block.label ?? block.block_id,
          type: block.block_type === "question_text" ? "text" : "textarea",
          excludeFromSpelling: resolveExcludeFromSpelling(
            block.block_id,
            block.exclude_from_spelling,
            false,
          ),
        };
        answers.push({
          block_id: block.block_id,
          value,
          feedback: feedbackMap?.[block.block_id] ?? null,
        });
        if (value) {
          lines.push(`${block.label ?? block.block_id}: ${value}`);
        }
        break;
      }
      case "question_choice_single": {
        const value = getChoiceValue(answerMap, block.block_id);
        fieldMeta[block.block_id] = {
          label: block.label ?? block.block_id,
          type: "radio",
          excludeFromSpelling: resolveExcludeFromSpelling(
            block.block_id,
            block.exclude_from_spelling,
            true,
          ),
        };
        answers.push({
          block_id: block.block_id,
          value,
          feedback: feedbackMap?.[block.block_id] ?? null,
        });
        if (value) {
          lines.push(`${block.label ?? block.block_id}: ${choiceLabel(block.options, value)}`);
        }
        break;
      }
      case "question_choice_multi": {
        const values = getChoiceValues(answerMap, block.block_id);
        fieldMeta[block.block_id] = {
          label: block.label ?? block.block_id,
          type: "checkbox",
          excludeFromSpelling: resolveExcludeFromSpelling(
            block.block_id,
            block.exclude_from_spelling,
            true,
          ),
        };
        answers.push({
          block_id: block.block_id,
          value: values,
          feedback: feedbackMap?.[block.block_id] ?? null,
        });
        if (values.length > 0) {
          lines.push(
            `${block.label ?? block.block_id}: ${values
              .map((value) => choiceLabel(block.options, value))
              .join(", ")}`,
          );
        }
        break;
      }
      case "question_table": {
        const rows = getTableRows(answerMap, block);
        fieldMeta[block.block_id] = {
          label: block.label ?? block.block_id,
          type: "table",
          excludeFromSpelling: resolveExcludeFromSpelling(
            block.block_id,
            block.exclude_from_spelling,
            false,
          ),
        };
        answers.push({
          block_id: block.block_id,
          value: rows,
          feedback: feedbackMap?.[block.block_id] ?? null,
        });
        const flattened = rows
          .map((row, rowIndex) =>
            block.columns
              .map((column) => {
                const cell = row[column.column_id]?.trim() ?? "";
                return cell ? `Row ${rowIndex + 1} ${column.label}: ${cell}` : null;
              })
              .filter(Boolean)
              .join(" · "),
          )
          .filter(Boolean)
          .join("\n");
        if (flattened) {
          lines.push(`${block.label ?? block.block_id}:\n${flattened}`);
        }
        break;
      }
      case "question_repeatable_interview": {
        const rows = getInterviewRows(answerMap, block);
        fieldMeta[block.block_id] = {
          label: block.label ?? block.block_id,
          type: "repeatable",
          excludeFromSpelling: resolveExcludeFromSpelling(
            block.block_id,
            block.exclude_from_spelling,
            false,
          ),
        };
        answers.push({
          block_id: block.block_id,
          value: rows,
          feedback: feedbackMap?.[block.block_id] ?? null,
        });
        const flattened = rows
          .map((row, rowIndex) =>
            block.questions
              .map((question) => {
                const cell = row[question.question_id]?.trim() ?? "";
                return cell ? `Person ${rowIndex + 1} ${question.prompt}: ${cell}` : null;
              })
              .filter(Boolean)
              .join(" · "),
          )
          .filter(Boolean)
          .join("\n");
        if (flattened) {
          lines.push(`${block.label ?? block.block_id}:\n${flattened}`);
        }
        break;
      }
      case "comprehension_quiz_group": {
        const quizValue = getQuizValue(answerMap, block);
        fieldMeta[block.block_id] = {
          label: block.label ?? block.block_id,
          type: "comprehension_quiz",
          excludeFromSpelling: resolveExcludeFromSpelling(
            block.block_id,
            block.exclude_from_spelling,
            true,
          ),
        };
        answers.push({
          block_id: block.block_id,
          value: quizValue,
          feedback: feedbackMap?.[block.block_id] ?? null,
        });
        if (quizValue.total_questions > 0) {
          const bandLabel =
            quizValue.understanding_band === "review_needed"
              ? "Review needed"
              : quizValue.understanding_band.charAt(0).toUpperCase() +
                quizValue.understanding_band.slice(1);
          lines.push(
            `${block.label ?? "Comprehension"}: ${quizValue.score}/${quizValue.total_questions} · ${bandLabel}`,
          );
        }
        break;
      }
      default:
        break;
    }
  });

  const structuredResponse: StructuredLessonResponse = {
    task_id: taskId,
    child_id: childId,
    status,
    answers,
    draft_saved_at: status === "draft" ? new Date().toISOString() : null,
    submitted_at: status === "submitted" ? new Date().toISOString() : null,
  };

  const draftPayload: StructuredLessonDraftPayload = {
    ...Object.fromEntries(
      answers.map((answer) => [answer.block_id, flattenDraftValue(answer.value)]),
    ),
    __field_meta: fieldMeta,
    __structured_lesson_response: structuredResponse,
  };

  return {
    submissionText: lines.join("\n\n"),
    reviewSummary: "",
    draftPayload,
    structuredResponse,
  };
}

export function withStructuredLessonResponse(
  payloadValue: unknown,
  response: StructuredLessonResponse,
) {
  const payload = normaliseLessonDraftPayload(payloadValue);
  return {
    ...payload,
    __structured_lesson_response: response,
  };
}

export function getStructuredLessonResponseFromPayload(
  payloadValue: unknown,
): StructuredLessonResponse | null {
  const payload = normaliseLessonDraftPayload(payloadValue);
  const candidate = payload.__structured_lesson_response;
  const feedbackByField = getLegacyFieldFeedback(payloadValue);

  if (!isPlainObject(candidate)) {
    return null;
  }

  const answers = candidate.answers;

  if (
    typeof candidate.task_id !== "string" ||
    typeof candidate.child_id !== "string" ||
    !Array.isArray(answers)
  ) {
    return null;
  }

  const response = candidate as StructuredLessonResponse;

  return {
    ...response,
    answers: Array.isArray(response.answers)
      ? response.answers.map((answer) => ({
          ...answer,
          feedback: answer.feedback ?? feedbackByField[answer.block_id] ?? null,
        }))
      : [],
  };
}

export function getInitialStructuredLessonResponse({
  payloadValue,
  isReturned = false,
}: {
  payloadValue: unknown;
  isReturned?: boolean;
}): StructuredLessonResponse | null {
  const response = getStructuredLessonResponseFromPayload(payloadValue);

  if (!response) {
    return null;
  }

  if (!isReturned) {
    return response;
  }

  return {
    ...response,
    status: "returned",
  };
}

export function buildStructuredLessonResponse({
  taskId,
  childId,
  status,
  payloadValue,
  submittedAt,
}: {
  taskId: string;
  childId: string;
  status: StructuredLessonResponseStatus;
  payloadValue: unknown;
  submittedAt?: string | null;
}): StructuredLessonResponse {
  const embedded = getStructuredLessonResponseFromPayload(payloadValue);

  if (embedded) {
    return {
      ...embedded,
      task_id: taskId,
      child_id: childId,
      status,
      draft_saved_at: status === "draft" ? new Date().toISOString() : embedded.draft_saved_at ?? null,
      submitted_at: submittedAt ?? (status === "submitted" ? new Date().toISOString() : embedded.submitted_at ?? null),
    };
  }

  return buildStructuredLessonResponseFromLegacyPayload({
    taskId,
    childId,
    status,
    payloadValue,
    submittedAt,
  });
}

export function buildStructuredLessonResponseFromFlatSubmission({
  taskId,
  childId,
  lessonValue,
  submissionText,
  submittedAt,
}: {
  taskId: string;
  childId: string;
  lessonValue: unknown;
  submissionText: string;
  submittedAt: string;
}): StructuredLessonResponse | null {
  const trimmedText = submissionText.trim();

  if (!trimmedText || !isStructuredLessonDocument(lessonValue)) {
    return null;
  }

  const textBlock = lessonValue.blocks.find(
    (block) =>
      block.block_type === "question_text" ||
      block.block_type === "question_textarea",
  );

  if (!textBlock) {
    return null;
  }

  return {
    task_id: taskId,
    child_id: childId,
    status: "submitted",
    answers: [
      {
        block_id: textBlock.block_id,
        value: trimmedText,
        feedback: null,
      },
    ],
    draft_saved_at: null,
    submitted_at: submittedAt,
  };
}

export function hasMeaningfulStructuredLessonResponse(
  response: StructuredLessonResponse | null | undefined,
) {
  if (!response) {
    return false;
  }

  return response.answers.some((answer) => {
    const value = answer.value;

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.some((item) =>
        typeof item === "string"
          ? item.trim().length > 0
          : isPlainObject(item) && Object.values(item).some((cell) => typeof cell === "string" && cell.trim().length > 0),
      );
    }

    if (isQuizAnswerValue(value)) {
      return Object.values(value.selected_answers).some(
        (selectedValue) => typeof selectedValue === "string" && selectedValue.trim().length > 0,
      );
    }

    if (isPlainObject(value)) {
      return Object.values(value).some(
        (item) => typeof item === "string" && item.trim().length > 0,
      );
    }

    return false;
  });
}
