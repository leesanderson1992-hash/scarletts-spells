import type {
  LessonComprehensionQuizGroupBlock,
  LessonChoiceMultiBlock,
  LessonChoiceSingleBlock,
  StructuredLessonBlock,
  StructuredLessonDocument,
  StructuredLessonQuizAnswerValue,
} from "@/lib/lessons/schema";

type DraftFieldMeta = {
  label?: string;
  type?: string;
  excludeFromSpelling?: boolean;
};

type DraftPayloadLike = Record<string, unknown> & {
  __field_meta?: Record<string, DraftFieldMeta>;
  __field_feedback?: Record<string, string>;
};

export type ReviewableLessonField = {
  key: string;
  label: string;
  value: string;
  feedback: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getBlockById(
  lessonSchema: StructuredLessonDocument | null | undefined,
  blockId: string,
): StructuredLessonBlock | null {
  if (!lessonSchema) {
    return null;
  }

  return lessonSchema.blocks.find((block) => block.block_id === blockId) ?? null;
}

function formatChoiceValue(
  block: LessonChoiceSingleBlock | LessonChoiceMultiBlock,
  rawValue: unknown,
) {
  const values = Array.isArray(rawValue)
    ? rawValue.filter((item): item is string => typeof item === "string")
    : typeof rawValue === "string"
      ? [rawValue]
      : [];

  return values
    .map((value) => block.options.find((option) => option.value === value)?.label ?? value)
    .join(", ");
}

function isQuizAnswerValue(value: unknown): value is StructuredLessonQuizAnswerValue {
  return (
    isPlainObject(value) &&
    typeof value.score === "number" &&
    typeof value.total_questions === "number" &&
    typeof value.percentage === "number" &&
    typeof value.understanding_band === "string" &&
    isPlainObject(value.selected_answers)
  );
}

function formatQuizValue(
  block: LessonComprehensionQuizGroupBlock,
  rawValue: StructuredLessonQuizAnswerValue,
) {
  const selectedAnswerLines = block.questions
    .map((question, questionIndex) => {
      const selectedOptionId = rawValue.selected_answers[question.question_id];
      const selectedOptionLabel = question.options.find(
        (option) => option.option_id === selectedOptionId,
      )?.label;
      const isCorrect = rawValue.correctness_by_question[question.question_id];

      return selectedOptionLabel
        ? `Question ${questionIndex + 1}: ${selectedOptionLabel} (${isCorrect ? "correct" : "incorrect"})`
        : null;
    })
    .filter((value): value is string => Boolean(value));

  const bandLabel =
    rawValue.understanding_band === "review_needed"
      ? "Review needed"
      : rawValue.understanding_band.charAt(0).toUpperCase() +
        rawValue.understanding_band.slice(1);

  return [
    `Score: ${rawValue.score}/${rawValue.total_questions} (${rawValue.percentage}%)`,
    `Understanding: ${bandLabel}`,
    ...selectedAnswerLines,
  ].join("\n");
}

function formatStructuredFieldValue(
  block: StructuredLessonBlock | null,
  rawValue: unknown,
) {
  if (!block) {
    if (typeof rawValue === "string") {
      return rawValue.trim();
    }
    return JSON.stringify(rawValue, null, 2);
  }

  switch (block.block_type) {
    case "question_choice_single":
    case "question_choice_multi":
      return formatChoiceValue(block, rawValue);
    case "comprehension_quiz_group":
      return isQuizAnswerValue(rawValue) ? formatQuizValue(block, rawValue) : JSON.stringify(rawValue, null, 2);
    case "question_table":
    case "question_repeatable_interview":
      return JSON.stringify(rawValue, null, 2);
    default:
      return typeof rawValue === "string" ? rawValue.trim() : JSON.stringify(rawValue, null, 2);
  }
}

export function extractReviewableLessonFields(
  payload: unknown,
  lessonSchema?: StructuredLessonDocument | null,
): ReviewableLessonField[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const draftPayload = payload as DraftPayloadLike;
  const metaMap = draftPayload.__field_meta ?? {};
  const feedbackMap = draftPayload.__field_feedback ?? {};
  const structuredResponse = isPlainObject(draftPayload.__structured_lesson_response)
    ? draftPayload.__structured_lesson_response
    : null;

  if (structuredResponse && Array.isArray(structuredResponse.answers)) {
    return structuredResponse.answers
      .flatMap((answer) => {
        const block = getBlockById(lessonSchema, answer.block_id);
        if (block?.block_type === "comprehension_quiz_group" && isQuizAnswerValue(answer.value)) {
          const summaryValue = formatQuizValue(block, answer.value);
          const summaryFields: ReviewableLessonField[] = summaryValue.trim()
            ? [
                {
                  key: answer.block_id,
                  label:
                    (typeof block.label === "string" && block.label.trim()) ||
                    "Comprehension quiz",
                  value: summaryValue,
                  feedback:
                    (typeof answer.feedback === "string" && answer.feedback.trim()) ||
                    feedbackMap[answer.block_id]?.trim() ||
                    "",
                },
              ]
            : [];

          const perQuestionFields = block.questions.flatMap((question, questionIndex) => {
            const selectedOptionId = answer.value.selected_answers[question.question_id];
            const selectedOptionLabel = question.options.find(
              (option) => option.option_id === selectedOptionId,
            )?.label;

            if (!selectedOptionLabel) {
              return [];
            }

            const isCorrect = answer.value.correctness_by_question[question.question_id];
            const correctOptionLabel = question.options.find(
              (option) => option.option_id === question.correct_option_id,
            )?.label;

            return [
              {
                key: `${answer.block_id}::${question.question_id}`,
                label: `Quiz question ${questionIndex + 1}`,
                value: [
                  question.prompt,
                  `Selected: ${selectedOptionLabel}`,
                  `Result: ${isCorrect ? "Correct" : "Incorrect"}`,
                  !isCorrect && correctOptionLabel
                    ? `Correct answer: ${correctOptionLabel}`
                    : null,
                ]
                  .filter((item): item is string => Boolean(item))
                  .join("\n"),
                feedback:
                  feedbackMap[`${answer.block_id}::${question.question_id}`]?.trim() ||
                  "",
              },
            ];
          });

          return [...summaryFields, ...perQuestionFields];
        }

        const value = formatStructuredFieldValue(block, answer.value);

        if (!value.trim()) {
          return [];
        }

        return [
          {
            key: answer.block_id,
            label:
              (block && "label" in block && typeof block.label === "string" ? block.label.trim() : "") ||
              metaMap[answer.block_id]?.label?.trim() ||
              answer.block_id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() ||
              "Answer",
            value,
            feedback:
              (typeof answer.feedback === "string" && answer.feedback.trim()) ||
              feedbackMap[answer.block_id]?.trim() ||
              "",
          } satisfies ReviewableLessonField,
        ];
      });
  }

  return Object.entries(draftPayload)
    .filter(([key, value]) => {
      if (key === "__field_meta" || key === "__field_feedback") {
        return false;
      }

      return typeof value === "string" && value.trim().length > 0;
    })
    .map(([key, value]) => ({
      key,
      label:
        metaMap[key]?.label?.trim() ||
        key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() ||
        "Answer",
      value: typeof value === "string" ? value.trim() : "",
      feedback: feedbackMap[key]?.trim() ?? "",
    }));
}
