"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ReturnedIssueRetryControls } from "@/components/returned-issue-retry-controls";
import { buildStructuredLessonCapture } from "@/lib/lessons/responses";
import type { ReturnedWritingIssueDraftPayload } from "@/lib/lessons/responses";
import {
  getLessonUnderstandingBand,
  type LessonComprehensionQuizGroupBlock,
  type LessonRepeatableInterviewBlock,
  type LessonTableQuestionBlock,
  type StructuredLessonAnswerValue,
  type StructuredLessonBlock,
  type StructuredLessonDocument,
  type StructuredLessonQuizAnswerValue,
  type StructuredLessonResponse,
} from "@/lib/lessons/schema";

type DraftContext = {
  taskId: string;
  courseId: string;
  childId: string;
  redirectPath: string;
};

type StructuredLessonResponseProps = {
  lesson: StructuredLessonDocument;
  submitLabel: string;
  initialResponse?: StructuredLessonResponse | null;
  initialFieldFeedback?: FeedbackMap;
  returnedIssueFeedback?: ReturnedWritingIssueDraftPayload[];
  saveDraftAction: (formData: FormData) => void | Promise<void>;
  saveDraftSilentlyAction?: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  draftContext: DraftContext;
};

type AnswerMap = Record<string, StructuredLessonAnswerValue>;
type FeedbackMap = Record<string, string>;
type SaveState = "idle" | "saving" | "saved" | "error";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getInitialAnswerMap(
  initialResponse?: StructuredLessonResponse | null,
): AnswerMap {
  if (!initialResponse) {
    return {};
  }

  return Object.fromEntries(
    initialResponse.answers.map((answer) => [answer.block_id, answer.value]),
  );
}

function getInitialFeedbackMap(
  initialResponse?: StructuredLessonResponse | null,
): FeedbackMap {
  if (!initialResponse) {
    return {};
  }

  return Object.fromEntries(
    initialResponse.answers.flatMap((answer) =>
      answer.feedback && answer.feedback.trim()
        ? [[answer.block_id, answer.feedback.trim()] as const]
        : [],
    ),
  );
}

function getInputValue(answerMap: AnswerMap, blockId: string) {
  const value = answerMap[blockId];
  return typeof value === "string" ? value : "";
}

function getChoiceValue(answerMap: AnswerMap, blockId: string) {
  const value = answerMap[blockId];
  return typeof value === "string" ? value : "";
}

function getChoiceValues(answerMap: AnswerMap, blockId: string) {
  const value = answerMap[blockId];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getTableRows(answerMap: AnswerMap, block: LessonTableQuestionBlock) {
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

function getInterviewRows(answerMap: AnswerMap, block: LessonRepeatableInterviewBlock) {
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

function getQuizValue(answerMap: AnswerMap, block: LessonComprehensionQuizGroupBlock): StructuredLessonQuizAnswerValue {
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
          : getLessonUnderstandingBand(percentage, block),
    };
  }

  return {
    selected_answers: {},
    correctness_by_question: {},
    score: 0,
    total_questions: block.questions.length,
    percentage: 0,
    understanding_band: getLessonUnderstandingBand(0, block),
  };
}

function buildQuizValue(
  block: LessonComprehensionQuizGroupBlock,
  selectedAnswers: Record<string, string>,
): StructuredLessonQuizAnswerValue {
  const correctnessByQuestion = Object.fromEntries(
    block.questions.map((question) => [
      question.question_id,
      selectedAnswers[question.question_id] === question.correct_option_id,
    ]),
  );
  const score = Object.values(correctnessByQuestion).filter(Boolean).length;
  const totalQuestions = block.questions.length;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  return {
    selected_answers: selectedAnswers,
    correctness_by_question: correctnessByQuestion,
    score,
    total_questions: totalQuestions,
    percentage,
    understanding_band: getLessonUnderstandingBand(percentage, block),
  };
}

function toneClasses(tone?: string | null) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "tip":
      return "border-[rgba(206,71,125,0.24)] bg-[rgba(252,228,244,0.3)] text-[color:var(--ink)]";
    default:
      return "border-[var(--border)] bg-white text-[color:var(--ink)]";
  }
}

function saveIndicatorClasses(saveState: SaveState) {
  switch (saveState) {
    case "saving":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "saved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-[var(--border)] bg-white text-[color:var(--mid)]";
  }
}

function understandingBandLabel(band: StructuredLessonQuizAnswerValue["understanding_band"]) {
  switch (band) {
    case "secure":
      return "Secure";
    case "developing":
      return "Developing";
    default:
      return "Review needed";
  }
}

export function StructuredLessonResponse({
  lesson,
  submitLabel,
  initialResponse,
  initialFieldFeedback,
  returnedIssueFeedback = [],
  saveDraftAction,
  saveDraftSilentlyAction,
  draftContext,
}: StructuredLessonResponseProps) {
  const [answerMap, setAnswerMap] = useState<AnswerMap>(() => getInitialAnswerMap(initialResponse));
  const [feedbackMap] = useState<FeedbackMap>(() => ({
    ...getInitialFeedbackMap(initialResponse),
    ...(initialFieldFeedback ?? {}),
  }));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("Autosave keeps each answer safe.");
  const [questionChecks, setQuestionChecks] = useState<Record<string, boolean>>({});
  const submissionRef = useRef<HTMLInputElement | null>(null);
  const reviewSummaryRef = useRef<HTMLInputElement | null>(null);
  const draftPayloadRef = useRef<HTMLInputElement | null>(null);
  const hasMountedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveVersionRef = useRef(0);
  const saveDraftSilentlyActionRef = useRef(saveDraftSilentlyAction);

  const orderedBlocks = useMemo(() => lesson.blocks, [lesson.blocks]);
  const returnedIssueInlineKeys = useMemo(() => {
    const keys = new Set<string>();

    orderedBlocks.forEach((block) => {
      switch (block.block_type) {
        case "question_text":
        case "question_textarea":
        case "question_choice_single":
        case "question_choice_multi":
        case "question_table":
        case "question_repeatable_interview":
        case "comprehension_quiz_group":
          keys.add(block.block_id);
          break;
        default:
          break;
      }

      if (block.block_type === "comprehension_quiz_group") {
        block.questions.forEach((question) => {
          keys.add(`${block.block_id}::${question.question_id}`);
        });
      }
    });

    return keys;
  }, [orderedBlocks]);
  const unmatchedReturnedIssues = useMemo(
    () =>
      returnedIssueFeedback.filter(
        (issue) =>
          !issue.source_field_key ||
          !returnedIssueInlineKeys.has(issue.source_field_key),
      ),
    [returnedIssueFeedback, returnedIssueInlineKeys],
  );
  const isReturnedForReview = initialResponse?.status === "returned";

  useEffect(() => {
    saveDraftSilentlyActionRef.current = saveDraftSilentlyAction;
  }, [saveDraftSilentlyAction]);

  function setAnswer(blockId: string, value: StructuredLessonAnswerValue) {
    setAnswerMap((current) => ({
      ...current,
      [blockId]: value,
    }));
    setSaveState("saving");
    setSaveMessage("Saving your latest answer...");
  }

  function setTableCell(
    block: LessonTableQuestionBlock,
    rowIndex: number,
    columnId: string,
    value: string,
  ) {
    const rows = getTableRows(answerMap, block);
    rows[rowIndex] = {
      ...rows[rowIndex],
      [columnId]: value,
    };
    setAnswer(block.block_id, rows);
  }

  function setInterviewAnswer(
    block: LessonRepeatableInterviewBlock,
    rowIndex: number,
    questionId: string,
    value: string,
  ) {
    const rows = getInterviewRows(answerMap, block);
    rows[rowIndex] = {
      ...rows[rowIndex],
      [questionId]: value,
    };
    setAnswer(block.block_id, rows);
  }

  function setQuizAnswer(
    block: LessonComprehensionQuizGroupBlock,
    questionId: string,
    optionId: string,
  ) {
    const currentQuizValue = getQuizValue(answerMap, block);
    const selectedAnswers = {
      ...currentQuizValue.selected_answers,
      [questionId]: optionId,
    };
    setAnswer(block.block_id, buildQuizValue(block, selectedAnswers));
  }

  function toggleQuestionCheck(key: string, checked: boolean) {
    setQuestionChecks((current) => ({
      ...current,
      [key]: checked,
    }));
  }

  const buildCapturedResponse = useMemo(
    () => () =>
      buildStructuredLessonCapture({
        lesson,
        answerMap,
        feedbackMap,
        taskId: draftContext.taskId,
        childId: draftContext.childId,
        status: "draft",
      }),
    [answerMap, draftContext.childId, draftContext.taskId, feedbackMap, lesson],
  );

  function captureResponse() {
    if (!submissionRef.current || !reviewSummaryRef.current || !draftPayloadRef.current) {
      return true;
    }

    const captured = buildCapturedResponse();
    submissionRef.current.value = captured.submissionText;
    reviewSummaryRef.current.value = captured.reviewSummary;
    draftPayloadRef.current.value = JSON.stringify(captured.draftPayload);
    return true;
  }

  useEffect(() => {
    if (!saveDraftSilentlyActionRef.current) {
      return;
    }

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      const captured = buildCapturedResponse();
      const formData = new FormData();
      formData.set("task_id", draftContext.taskId);
      formData.set("course_id", draftContext.courseId);
      formData.set("child_id", draftContext.childId);
      formData.set("redirect_path", draftContext.redirectPath);
      formData.set("submission_text", captured.submissionText);
      formData.set("lesson_review_summary", captured.reviewSummary);
      formData.set("draft_payload", JSON.stringify(captured.draftPayload));

      const saveVersion = ++autosaveVersionRef.current;

      void (async () => {
        try {
          const result = await saveDraftSilentlyActionRef.current?.(formData);
          if (saveVersion !== autosaveVersionRef.current) {
            return;
          }
          if (result?.ok) {
            setSaveState("saved");
            setSaveMessage("Saved");
          } else {
            setSaveState("error");
            setSaveMessage("Could not save. Try the Save draft button.");
          }
        } catch {
          if (saveVersion !== autosaveVersionRef.current) {
            return;
          }
          setSaveState("error");
          setSaveMessage("Could not save. Try the Save draft button.");
        }
      })();
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    buildCapturedResponse,
    draftContext.childId,
    draftContext.courseId,
    draftContext.redirectPath,
    draftContext.taskId,
  ]);

  function renderSaveStatus(blockId: string) {
    const feedback = feedbackMap[blockId];

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${saveIndicatorClasses(saveState)}`}
        >
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Needs review"
                : "Autosave on"}
        </span>
        {feedback ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            Feedback added
          </span>
        ) : null}
      </div>
    );
  }

  function renderQuestionCheck(checkKey: string) {
    return (
      <label className="mt-3 inline-flex max-w-full items-start gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-3 py-2 text-sm text-[color:var(--ink)]">
        <input
          type="checkbox"
          checked={Boolean(questionChecks[checkKey])}
          onChange={(event) => toggleQuestionCheck(checkKey, event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
        />
        <span className="min-w-0 break-words">I checked this for read aloud, spelling, and punctuation.</span>
      </label>
    );
  }

  function renderFeedback(feedbackKey: string) {
    const feedback = feedbackMap[feedbackKey];

    if (!feedback) {
      return null;
    }

    return (
      <div className="mt-3 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
          Feedback
        </p>
        <p className="mt-2">{feedback}</p>
      </div>
    );
  }

  function renderReturnedIssueCard(
    issue: ReturnedWritingIssueDraftPayload,
    label: string,
  ) {
    return (
      <div
        key={issue.issue_id}
        className="w-full min-w-0 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]">
          <div className="min-w-0 flex-1">
            <div className="grid gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                {label}
              </p>
              {issue.child_note ? <p className="min-w-0 break-words">{issue.child_note}</p> : null}
              {issue.observed_text ? (
                <p className="min-w-0 break-words text-sm text-amber-900/90">
                  Look at:{" "}
                  <mark className="rounded-md bg-white px-1.5 py-0.5 font-semibold text-amber-950 ring-1 ring-amber-200 break-words">
                    {issue.observed_text}
                  </mark>
                </p>
              ) : null}
              {issue.context_text ? (
                <p className="min-w-0 whitespace-pre-wrap break-words rounded-2xl bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)]">
                  {issue.context_text}
                </p>
              ) : null}
              <p className="text-sm text-amber-900/90">
                Choose whether to keep your first try or make a new one.
              </p>
            </div>
          </div>
          <ReturnedIssueRetryControls issue={issue} />
        </div>
      </div>
    );
  }

  function renderReturnedIssueFeedback(feedbackKey: string) {
    const matchingIssues = returnedIssueFeedback.filter(
      (issue) => issue.source_field_key === feedbackKey,
    );

    if (matchingIssues.length === 0) {
      return null;
    }

    return (
      <div className="mt-3 grid gap-3">
        {matchingIssues.map((issue, index) =>
          renderReturnedIssueCard(issue, `Fix note ${index + 1}`),
        )}
      </div>
    );
  }

  function renderUnmatchedReturnedIssueFeedback() {
    if (unmatchedReturnedIssues.length === 0) {
      return null;
    }

    return (
      <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/80 px-4 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
            Fix these spellings
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            These notes are not attached to one exact question, but they still need a try before you resubmit.
          </p>
        </div>
        <div className="mt-3 grid gap-3">
          {unmatchedReturnedIssues.map((issue, index) =>
            renderReturnedIssueCard(issue, `Fix note ${index + 1}`),
          )}
        </div>
      </div>
    );
  }

  function renderBlock(block: StructuredLessonBlock) {
    switch (block.block_type) {
      case "heading":
        return (
          <div className="grid gap-2 text-center">
            {block.eyebrow ? (
              <p className="brand-eyebrow">{block.eyebrow}</p>
            ) : null}
            <h2 className="brand-lesson-title text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-tight">
              {block.heading}
            </h2>
          </div>
        );
      case "section_intro":
        return (
          <div className="grid justify-items-center gap-2 text-center">
            {block.eyebrow ? <p className="brand-eyebrow">{block.eyebrow}</p> : null}
            <h3 className="brand-lesson-title text-[clamp(1.4rem,3vw,2rem)] font-semibold">
              {block.title}
            </h3>
            {block.body ? (
              <p className="mx-auto max-w-3xl text-sm leading-7 text-[color:var(--mid)]">
                {block.body}
              </p>
            ) : null}
          </div>
        );
      case "rich_text":
        return (
          <div
            className="prose prose-sm max-w-none break-words text-[color:var(--ink)]"
            dangerouslySetInnerHTML={{ __html: block.content }}
          />
        );
      case "callout":
        return (
          <div className={`rounded-[1.75rem] border px-4 py-4 ${toneClasses(block.tone)}`}>
            {block.title ? (
              <p className="text-sm font-semibold">{block.title}</p>
            ) : null}
            <div
              className="mt-2 text-sm leading-6"
              dangerouslySetInnerHTML={{ __html: block.content }}
            />
          </div>
        );
      case "action_link":
        return (
          <div className="flex justify-center">
            <a
              href={block.url}
              target="_blank"
              rel="noreferrer"
              className={
                block.style === "secondary"
                  ? "brand-secondary-btn"
                  : "brand-primary-btn"
              }
            >
              ↗ {block.label}
            </a>
          </div>
        );
      case "info_cards": {
        const gridClass =
          block.cards.length === 4
            ? "md:grid-cols-2"
            : block.cards.length >= 3
              ? "md:grid-cols-3"
              : "md:grid-cols-2";

        return (
            <div className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-5 py-4 text-center">
              {block.title ? (
                <h3 className="brand-lesson-title text-xl font-semibold">
                  {block.title}
                </h3>
              ) : null}
              {block.body ? (
                <p className="mx-auto mt-2 max-w-3xl text-sm leading-7 text-[color:var(--mid)]">
                  {block.body}
                </p>
              ) : null}
            </div>
            <div className={`grid min-w-0 gap-4 p-5 ${gridClass}`}>
              {block.cards.map((card) => (
                <div
                  key={card.card_id}
                  className="min-w-0 rounded-[1.5rem] border border-[rgba(206,71,125,0.24)] bg-[rgba(252,228,244,0.18)] px-4 py-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {card.icon ? (
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-lg">
                        {card.icon}
                      </div>
                    ) : null}
                    <div className="grid min-w-0 gap-2">
                      <h4 className="text-lg font-semibold text-[var(--scarlett)]">
                        {card.title}
                      </h4>
                      <p className="break-words text-sm leading-7 text-[color:var(--ink)]">
                        {card.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case "question_text":
        return (
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</span>
              <input
                type="text"
                value={getInputValue(answerMap, block.block_id)}
                onChange={(event) => setAnswer(block.block_id, event.target.value)}
                placeholder={block.placeholder ?? ""}
                className="brand-input h-11 rounded-2xl px-4 text-sm"
              />
            </label>
            {renderQuestionCheck(block.block_id)}
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      case "question_textarea":
        return (
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</span>
              <textarea
                value={getInputValue(answerMap, block.block_id)}
                onChange={(event) => setAnswer(block.block_id, event.target.value)}
                placeholder={block.placeholder ?? ""}
                rows={block.rows ?? 5}
                className="brand-input rounded-2xl px-4 py-3 text-sm"
              />
            </label>
            {renderQuestionCheck(block.block_id)}
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      case "question_choice_single":
        return (
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</legend>
              {block.options.map((option) => (
                <label
                  key={option.value}
                  className="inline-flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                >
                  <input
                    type="radio"
                    name={block.block_id}
                    checked={getChoiceValue(answerMap, block.block_id) === option.value}
                    onChange={() => setAnswer(block.block_id, option.value)}
                    className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            {renderQuestionCheck(block.block_id)}
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      case "question_choice_multi":
        return (
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</legend>
              {block.options.map((option) => {
                const values = getChoiceValues(answerMap, block.block_id);
                const checked = values.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className="inline-flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextValues = event.target.checked
                          ? [...values, option.value]
                          : values.filter((value) => value !== option.value);
                        setAnswer(block.block_id, nextValues);
                      }}
                      className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </fieldset>
            {renderQuestionCheck(block.block_id)}
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      case "question_table":
        return (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</p>
            <div className="grid gap-3">
              {getTableRows(answerMap, block).map((row, rowIndex) => (
                <div key={`${block.block_id}-row-${rowIndex}`} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Row {rowIndex + 1}
                  </p>
                  <div className="mt-3 grid gap-3">
                    {block.columns.map((column) => (
                      <label key={column.column_id} className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--mid)]">
                          {column.label}
                        </span>
                        {column.input_type === "textarea" ? (
                          <textarea
                            value={row[column.column_id] ?? ""}
                            onChange={(event) =>
                              setTableCell(block, rowIndex, column.column_id, event.target.value)
                            }
                            rows={3}
                            placeholder={column.placeholder ?? ""}
                            className="brand-input rounded-2xl px-4 py-3 text-sm"
                          />
                        ) : column.input_type === "select" ? (
                          <select
                            value={row[column.column_id] ?? ""}
                            onChange={(event) =>
                              setTableCell(block, rowIndex, column.column_id, event.target.value)
                            }
                            className="brand-input h-11 rounded-2xl px-4 text-sm"
                          >
                            <option value="">Select</option>
                            {(column.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={row[column.column_id] ?? ""}
                            onChange={(event) =>
                              setTableCell(block, rowIndex, column.column_id, event.target.value)
                            }
                            placeholder={column.placeholder ?? ""}
                            className="brand-input h-11 rounded-2xl px-4 text-sm"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      case "question_repeatable_interview":
        return (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</p>
            {getInterviewRows(answerMap, block).map((row, rowIndex) => (
              <div key={`${block.block_id}-person-${rowIndex}`} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                  Person {rowIndex + 1}
                </p>
                <div className="mt-3 grid gap-3">
                  {block.questions.map((question) => (
                    <label key={question.question_id} className="grid gap-1.5">
                      <span className="text-sm font-medium text-[color:var(--ink)]">
                        {question.prompt}
                      </span>
                      <textarea
                        value={row[question.question_id] ?? ""}
                        onChange={(event) =>
                          setInterviewAnswer(
                            block,
                            rowIndex,
                            question.question_id,
                            event.target.value,
                          )
                        }
                        rows={3}
                        placeholder={question.placeholder ?? ""}
                        className="brand-input rounded-2xl px-4 py-3 text-sm"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      case "comprehension_quiz_group": {
        const quizValue = getQuizValue(answerMap, block);

        return (
          <div className="grid gap-3">
            <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {block.label ?? "Comprehension check"}
                  </p>
                  {block.help_text ? (
                    <p className="mt-1 text-sm text-[color:var(--mid)]">{block.help_text}</p>
                  ) : null}
                </div>
                <div className="rounded-[1.5rem] border border-[rgba(206,71,125,0.18)] bg-[rgba(252,228,244,0.4)] px-4 py-3 text-sm text-[color:var(--ink)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Understanding
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {quizValue.score}/{quizValue.total_questions}
                  </p>
                  <p className="text-sm text-[color:var(--mid)]">
                    {understandingBandLabel(quizValue.understanding_band)}
                  </p>
                </div>
              </div>
            </div>
            {block.questions.map((question, questionIndex) => {
              const selectedAnswer = quizValue.selected_answers[question.question_id] ?? "";
              const wasAnswered = selectedAnswer.length > 0;
              const shouldLockAnswer = wasAnswered && !isReturnedForReview;
              const isCorrect = wasAnswered
                ? quizValue.correctness_by_question[question.question_id]
                : false;
              const questionFeedbackKey = `${block.block_id}::${question.question_id}`;

              return (
                <div
                  key={question.question_id}
                  className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Question {questionIndex + 1}
                  </p>
                  <p className="mt-2 text-base font-semibold text-[color:var(--ink)]">
                    {question.prompt}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {question.options.map((option) => {
                      const checked = selectedAnswer === option.option_id;
                      const shouldRevealCorrect =
                        wasAnswered && option.option_id === question.correct_option_id;
                      const optionClass = wasAnswered
                        ? checked
                          ? isCorrect
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-rose-200 bg-rose-50 text-rose-900"
                          : shouldRevealCorrect
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-[var(--border)] bg-white text-[color:var(--ink)]"
                        : "border-[var(--border)] bg-white text-[color:var(--ink)]";

                      return (
                        <label
                          key={option.option_id}
                          className={`inline-flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm ${optionClass}`}
                        >
                          <input
                            type="radio"
                            name={question.question_id}
                            checked={checked}
                            disabled={shouldLockAnswer}
                            onChange={() => setQuizAnswer(block, question.question_id, option.option_id)}
                            className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {renderQuestionCheck(`${block.block_id}::${question.question_id}`)}
                  {wasAnswered ? (
                    <div className="mt-3 grid gap-2">
                      <p
                        className={`text-sm font-medium ${isCorrect ? "text-emerald-700" : "text-rose-700"}`}
                      >
                        {isCorrect ? "Correct." : "Not quite."}
                      </p>
                      {!isCorrect && question.explanation ? (
                        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                            Helper
                          </p>
                          <p className="mt-2">{question.explanation}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {renderFeedback(questionFeedbackKey)}
                  {renderReturnedIssueFeedback(questionFeedbackKey)}
                </div>
              );
            })}
            {renderSaveStatus(block.block_id)}
            {renderFeedback(block.block_id)}
            {renderReturnedIssueFeedback(block.block_id)}
          </div>
        );
      }
      case "carry_forward_reference":
        return (
          <div className="rounded-[1.75rem] border border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-4 py-4 text-sm text-[color:var(--mid)]">
            {block.empty_state ?? "Previous lesson answers can be pulled into this section in a later pass."}
          </div>
        );
      case "titled_divider":
        return (
          <div className="flex items-center gap-4 py-2">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <div className="rounded-full bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              {block.title}
            </div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
        );
      case "divider":
        return <div className="h-px w-full bg-[var(--border)]" />;
      default:
        return (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[color:var(--mid)]">
            This lesson block is not rendered yet.
          </div>
        );
    }
  }

  return (
    <div className="grid w-full min-w-0 gap-4">
      <div className="sticky top-0 z-10 min-w-0 rounded-[2rem] border border-[var(--border)] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
              Lesson progress
            </p>
            <p className="mt-1 text-sm text-[color:var(--mid)]">{saveMessage}</p>
          </div>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${saveIndicatorClasses(saveState)}`}
          >
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Needs review"
                  : "Autosave on"}
          </span>
        </div>
      </div>

      <div className="w-full min-w-0 rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(252,228,244,0.18),rgba(255,255,255,0.96))] px-4 py-5 shadow-[0_14px_40px_rgba(79,38,66,0.06)] sm:px-5">
        <div className="grid min-w-0 gap-5">
          {renderUnmatchedReturnedIssueFeedback()}
          {orderedBlocks.map((block) => (
            <div key={block.block_id} className="min-w-0">
              {renderBlock(block)}
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 rounded-3xl border border-[var(--border)] bg-white/90 px-4 py-4">
        <p className="text-sm leading-6 text-[color:var(--mid)]">
          Work through the lesson here, then save your draft or submit it below.
        </p>
        <input ref={submissionRef} type="hidden" name="submission_text" />
        <input ref={reviewSummaryRef} type="hidden" name="lesson_review_summary" />
        <input ref={draftPayloadRef} type="hidden" name="draft_payload" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            formAction={saveDraftAction}
            onClick={() => {
              captureResponse();
            }}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
          >
            Save draft
          </button>
          <button
            type="submit"
            onClick={() => {
              captureResponse();
            }}
            className="brand-primary-btn w-fit"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
