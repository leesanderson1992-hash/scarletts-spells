"use client";

import { useMemo, useState } from "react";

import {
  cloneStructuredLessonDocument,
  STRUCTURED_LESSON_PRESETS,
} from "@/lib/lessons/presets";
import type {
  LessonBlockType,
  LessonChoiceOption,
  LessonComprehensionQuizGroupBlock,
  LessonComprehensionQuizQuestion,
  LessonInfoCard,
  LessonInfoCardsBlock,
  StructuredLessonBlock,
  StructuredLessonDocument,
} from "@/lib/lessons/schema";

export const BLOCK_OPTIONS: Array<{ type: LessonBlockType; label: string }> = [
  { type: "heading", label: "Heading" },
  { type: "section_intro", label: "Section intro" },
  { type: "rich_text", label: "Intro text" },
  { type: "callout", label: "Callout" },
  { type: "action_link", label: "Link button" },
  { type: "info_cards", label: "Information cards" },
  { type: "question_text", label: "Short answer" },
  { type: "question_textarea", label: "Paragraph answer" },
  { type: "question_choice_single", label: "Single choice" },
  { type: "question_choice_multi", label: "Multi choice" },
  { type: "comprehension_quiz_group", label: "Comprehension quiz" },
  { type: "titled_divider", label: "Section line" },
  { type: "divider", label: "Divider" },
];

type StructuredChoiceBlock = Extract<
  StructuredLessonBlock,
  { block_type: "question_choice_single" | "question_choice_multi" }
>;

export type StructuredLessonBuilderState = {
  showPreview: boolean;
  isExpanded: boolean;
  blocks: StructuredLessonBlock[];
  structuredDocument: StructuredLessonDocument;
  togglePreview: () => void;
  toggleExpanded: () => void;
  addBlock: (blockType: LessonBlockType) => void;
  moveBlock: (blockId: string, direction: -1 | 1) => void;
  duplicateBlock: (blockId: string) => void;
  removeBlock: (blockId: string) => void;
  loadPreset: (presetId: string) => void;
  updateBlock: (
    blockId: string,
    updater: (block: StructuredLessonBlock) => StructuredLessonBlock,
  ) => void;
  updateInfoCard: (
    blockId: string,
    cardId: string,
    fields: Partial<LessonInfoCard>,
  ) => void;
  addInfoCard: (blockId: string) => void;
  removeInfoCard: (blockId: string, cardId: string) => void;
  updateChoiceOptionLabel: (
    blockId: string,
    optionValue: string,
    label: string,
  ) => void;
  addChoiceOption: (blockId: string) => void;
  removeChoiceOption: (blockId: string, optionValue: string) => void;
  updateQuizQuestion: (
    blockId: string,
    questionId: string,
    fields: Partial<LessonComprehensionQuizQuestion>,
  ) => void;
  addQuizQuestion: (blockId: string) => void;
  removeQuizQuestion: (blockId: string, questionId: string) => void;
  updateQuizOptionLabel: (
    blockId: string,
    questionId: string,
    optionId: string,
    label: string,
  ) => void;
  setQuizCorrectOption: (
    blockId: string,
    questionId: string,
    optionId: string,
  ) => void;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function createOption(label: string): LessonChoiceOption {
  return {
    value: makeId("option"),
    label,
  };
}

function createInfoCard(title = "New information card"): LessonInfoCard {
  return {
    card_id: makeId("info-card"),
    title,
    body: "Add the supporting explanation here.",
    icon: "",
  };
}

function createQuizQuestion(prompt = "New comprehension question"): LessonComprehensionQuizQuestion {
  const options = [
    { option_id: makeId("quiz-option"), label: "Option 1" },
    { option_id: makeId("quiz-option"), label: "Option 2" },
    { option_id: makeId("quiz-option"), label: "Option 3" },
    { option_id: makeId("quiz-option"), label: "Option 4" },
  ];

  return {
    question_id: makeId("quiz-question"),
    prompt,
    options,
    correct_option_id: options[0].option_id,
    explanation: "",
  };
}

function createBlock(blockType: LessonBlockType): StructuredLessonBlock {
  switch (blockType) {
    case "heading":
      return {
        block_id: makeId("heading"),
        block_type: "heading",
        heading: "New section heading",
        eyebrow: "",
      };
    case "section_intro":
      return {
        block_id: makeId("section-intro"),
        block_type: "section_intro",
        eyebrow: "Part 1",
        title: "Section title",
        body: "Add the short section introduction here.",
      };
    case "rich_text":
      return {
        block_id: makeId("rich-text"),
        block_type: "rich_text",
        content: "<p>Write the lesson introduction here.</p>",
      };
    case "callout":
      return {
        block_id: makeId("callout"),
        block_type: "callout",
        title: "Helpful note",
        content: "<p>Add a tip, example, or reminder.</p>",
        tone: "tip",
      };
    case "action_link":
      return {
        block_id: makeId("action-link"),
        block_type: "action_link",
        label: "Read this first",
        url: "https://example.com",
        style: "primary",
      };
    case "info_cards":
      return {
        block_id: makeId("info-cards"),
        block_type: "info_cards",
        title: "How to interview well",
        body: "These reminders help you collect useful answers instead of trying to get people to agree with you.",
        cards: [
          createInfoCard("Ask exactly what they already do"),
          createInfoCard("Let silence do some work"),
          createInfoCard("Notice emotion"),
        ],
      };
    case "question_text":
      return {
        block_id: makeId("question-text"),
        block_type: "question_text",
        label: "Question",
        placeholder: "Type the answer here",
        required: false,
        exclude_from_spelling: false,
      };
    case "question_textarea":
      return {
        block_id: makeId("question-textarea"),
        block_type: "question_textarea",
        label: "Question",
        placeholder: "Write the answer here",
        rows: 5,
        required: false,
        exclude_from_spelling: false,
      };
    case "question_choice_single":
      return {
        block_id: makeId("question-single"),
        block_type: "question_choice_single",
        label: "Choose one answer",
        options: [createOption("Option 1"), createOption("Option 2"), createOption("Option 3")],
        exclude_from_spelling: true,
      };
    case "question_choice_multi":
      return {
        block_id: makeId("question-multi"),
        block_type: "question_choice_multi",
        label: "Choose all that apply",
        options: [createOption("Option 1"), createOption("Option 2"), createOption("Option 3")],
        exclude_from_spelling: true,
      };
    case "comprehension_quiz_group":
      return {
        block_id: makeId("quiz-group"),
        block_type: "comprehension_quiz_group",
        label: "Comprehension check",
        help_text: "Add quiz questions and mark the correct answer for each one.",
        questions: [createQuizQuestion()],
        secure_threshold_percent: 80,
        developing_threshold_percent: 50,
        exclude_from_spelling: true,
      };
    case "divider":
      return {
        block_id: makeId("divider"),
        block_type: "divider",
      };
    case "titled_divider":
      return {
        block_id: makeId("titled-divider"),
        block_type: "titled_divider",
        title: "Part 3 — Patterns",
      };
    default:
      return {
        block_id: makeId("rich-text"),
        block_type: "rich_text",
        content: "<p>Write here.</p>",
      };
  }
}

function cloneBlock(block: StructuredLessonBlock): StructuredLessonBlock {
  return {
    ...block,
    block_id: makeId(block.block_type),
    ...(block.block_type === "info_cards"
      ? {
          cards: block.cards.map((card) => ({
            ...card,
            card_id: makeId("info-card"),
          })),
        }
      : {}),
    ...(block.block_type === "question_choice_single" || block.block_type === "question_choice_multi"
      ? {
          options: block.options.map((option) => ({
            ...option,
            value: makeId("option"),
          })),
        }
      : {}),
    ...(block.block_type === "comprehension_quiz_group"
      ? {
          questions: block.questions.map((question) => ({
            ...question,
            question_id: makeId("quiz-question"),
            options: question.options.map((option) => ({
              ...option,
              option_id: makeId("quiz-option"),
            })),
          })),
        }
      : {}),
  } as StructuredLessonBlock;
}

function updateBlockInList(
  blocks: StructuredLessonBlock[],
  blockId: string,
  updater: (block: StructuredLessonBlock) => StructuredLessonBlock,
) {
  return blocks.map((block) => (block.block_id === blockId ? updater(block) : block));
}

function buildInitialBlocks(
  taskTitle: string,
  initialLesson?: StructuredLessonDocument | null,
) {
  if (initialLesson?.blocks?.length) {
    return initialLesson.blocks;
  }

  return [
    {
      block_id: makeId("heading"),
      block_type: "heading",
      heading: taskTitle || "Lesson title",
      eyebrow: "",
    },
    {
      block_id: makeId("rich-text"),
      block_type: "rich_text",
      content: "<p>Start the lesson with a short introduction.</p>",
    },
    {
      block_id: makeId("question-textarea"),
      block_type: "question_textarea",
      label: "Main written answer",
      placeholder: "Write the response here",
      rows: 5,
      required: false,
      exclude_from_spelling: false,
    },
  ] satisfies StructuredLessonBlock[];
}

export function useStructuredLessonBuilderState(input: {
  taskTitle: string;
  initialLesson?: StructuredLessonDocument | null;
  compact?: boolean;
}): StructuredLessonBuilderState {
  const [showPreview, setShowPreview] = useState(true);
  const [isExpanded, setIsExpanded] = useState(!input.compact);
  const [blocks, setBlocks] = useState<StructuredLessonBlock[]>(
    buildInitialBlocks(input.taskTitle, input.initialLesson),
  );

  const structuredDocument = useMemo<StructuredLessonDocument>(
    () => ({
      version: 1,
      theme: "scarlett-default",
      title: input.taskTitle || input.initialLesson?.title || "Lesson",
      blocks,
    }),
    [blocks, input.initialLesson?.title, input.taskTitle],
  );

  function updateBlock(
    blockId: string,
    updater: (block: StructuredLessonBlock) => StructuredLessonBlock,
  ) {
    setBlocks((current) => updateBlockInList(current, blockId, updater));
  }

  return {
    showPreview,
    isExpanded,
    blocks,
    structuredDocument,
    togglePreview: () => setShowPreview((current) => !current),
    toggleExpanded: () => setIsExpanded((current) => !current),
    addBlock: (blockType) => setBlocks((current) => [...current, createBlock(blockType)]),
    moveBlock: (blockId, direction) =>
      setBlocks((current) => {
        const index = current.findIndex((block) => block.block_id === blockId);
        if (index < 0) {
          return current;
        }

        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= current.length) {
          return current;
        }

        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(nextIndex, 0, item);
        return next;
      }),
    duplicateBlock: (blockId) =>
      setBlocks((current) => {
        const index = current.findIndex((block) => block.block_id === blockId);
        if (index < 0) {
          return current;
        }

        const next = [...current];
        next.splice(index + 1, 0, cloneBlock(current[index]!));
        return next;
      }),
    removeBlock: (blockId) =>
      setBlocks((current) => current.filter((block) => block.block_id !== blockId)),
    loadPreset: (presetId) => {
      const preset = STRUCTURED_LESSON_PRESETS.find((item) => item.id === presetId);
      if (!preset) {
        return;
      }

      const cloned = cloneStructuredLessonDocument(preset.lesson);
      setBlocks(cloned.blocks);
      setShowPreview(true);
    },
    updateBlock,
    updateInfoCard: (blockId, cardId, fields) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonInfoCardsBlock;
        return {
          ...block,
          cards: block.cards.map((card) =>
            card.card_id === cardId ? { ...card, ...fields } : card,
          ),
        };
      }),
    addInfoCard: (blockId) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonInfoCardsBlock;
        return {
          ...block,
          cards: [...block.cards, createInfoCard(`Card ${block.cards.length + 1}`)],
        };
      }),
    removeInfoCard: (blockId, cardId) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonInfoCardsBlock;
        return {
          ...block,
          cards: block.cards.filter((card) => card.card_id !== cardId),
        };
      }),
    updateChoiceOptionLabel: (blockId, optionValue, label) =>
      updateBlock(blockId, (item) => {
        const block = item as StructuredChoiceBlock;
        return {
          ...block,
          options: block.options.map((option) =>
            option.value === optionValue ? { ...option, label } : option,
          ),
        };
      }),
    addChoiceOption: (blockId) =>
      updateBlock(blockId, (item) => {
        const block = item as StructuredChoiceBlock;
        return {
          ...block,
          options: [...block.options, createOption(`Option ${block.options.length + 1}`)],
        };
      }),
    removeChoiceOption: (blockId, optionValue) =>
      updateBlock(blockId, (item) => {
        const block = item as StructuredChoiceBlock;
        return {
          ...block,
          options: block.options.filter((option) => option.value !== optionValue),
        };
      }),
    updateQuizQuestion: (blockId, questionId, fields) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonComprehensionQuizGroupBlock;
        return {
          ...block,
          questions: block.questions.map((question) =>
            question.question_id === questionId ? { ...question, ...fields } : question,
          ),
        };
      }),
    addQuizQuestion: (blockId) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonComprehensionQuizGroupBlock;
        return {
          ...block,
          questions: [...block.questions, createQuizQuestion()],
        };
      }),
    removeQuizQuestion: (blockId, questionId) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonComprehensionQuizGroupBlock;
        return {
          ...block,
          questions: block.questions.filter((question) => question.question_id !== questionId),
        };
      }),
    updateQuizOptionLabel: (blockId, questionId, optionId, label) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonComprehensionQuizGroupBlock;
        return {
          ...block,
          questions: block.questions.map((question) =>
            question.question_id === questionId
              ? {
                  ...question,
                  options: question.options.map((option) =>
                    option.option_id === optionId ? { ...option, label } : option,
                  ),
                }
              : question,
          ),
        };
      }),
    setQuizCorrectOption: (blockId, questionId, optionId) =>
      updateBlock(blockId, (item) => {
        const block = item as LessonComprehensionQuizGroupBlock;
        return {
          ...block,
          questions: block.questions.map((question) =>
            question.question_id === questionId
              ? { ...question, correct_option_id: optionId }
              : question,
          ),
        };
      }),
  };
}
