export const LESSON_THEME_PRESETS = ["scarlett-default"] as const;

export type LessonThemePreset = (typeof LESSON_THEME_PRESETS)[number];

export const LESSON_BLOCK_TYPES = [
  "heading",
  "section_intro",
  "rich_text",
  "callout",
  "action_link",
  "info_cards",
  "question_text",
  "question_textarea",
  "question_choice_single",
  "question_choice_multi",
  "question_table",
  "question_repeatable_interview",
  "comprehension_quiz_group",
  "carry_forward_reference",
  "titled_divider",
  "divider",
] as const;

export type LessonBlockType = (typeof LESSON_BLOCK_TYPES)[number];

type LessonBaseBlock = {
  block_id: string;
  block_type: LessonBlockType;
};

type LessonDisplayBlock = LessonBaseBlock & {
  label?: string | null;
  help_text?: string | null;
  description?: string | null;
};

export type LessonHeadingBlock = LessonDisplayBlock & {
  block_type: "heading";
  heading: string;
  eyebrow?: string | null;
};

export type LessonSectionIntroBlock = LessonDisplayBlock & {
  block_type: "section_intro";
  eyebrow?: string | null;
  title: string;
  body?: string | null;
};

export type LessonRichTextBlock = LessonDisplayBlock & {
  block_type: "rich_text";
  content: string;
};

export type LessonCalloutBlock = LessonDisplayBlock & {
  block_type: "callout";
  title?: string | null;
  content: string;
  tone?: "default" | "success" | "warning" | "tip";
};

export type LessonActionLinkBlock = LessonDisplayBlock & {
  block_type: "action_link";
  label: string;
  url: string;
  style?: "primary" | "secondary";
};

export type LessonInfoCard = {
  card_id: string;
  title: string;
  body: string;
  icon?: string | null;
};

export type LessonInfoCardsBlock = LessonDisplayBlock & {
  block_type: "info_cards";
  title?: string | null;
  body?: string | null;
  cards: LessonInfoCard[];
};

type LessonAnswerableBlockBase = LessonDisplayBlock & {
  required?: boolean;
  exclude_from_spelling?: boolean;
  feedback_slot?: string | null;
  save_affordance?: "auto" | "quiet";
};

export type LessonTextQuestionBlock = LessonAnswerableBlockBase & {
  block_type: "question_text";
  placeholder?: string | null;
};

export type LessonTextareaQuestionBlock = LessonAnswerableBlockBase & {
  block_type: "question_textarea";
  placeholder?: string | null;
  rows?: number | null;
};

export type LessonChoiceOption = {
  value: string;
  label: string;
};

export type LessonChoiceSingleBlock = LessonAnswerableBlockBase & {
  block_type: "question_choice_single";
  options: LessonChoiceOption[];
};

export type LessonChoiceMultiBlock = LessonAnswerableBlockBase & {
  block_type: "question_choice_multi";
  options: LessonChoiceOption[];
};

export type LessonTableColumn = {
  column_id: string;
  label: string;
  input_type: "text" | "textarea" | "select";
  placeholder?: string | null;
  options?: LessonChoiceOption[];
  exclude_from_spelling?: boolean;
};

export type LessonTableQuestionBlock = LessonAnswerableBlockBase & {
  block_type: "question_table";
  columns: LessonTableColumn[];
  row_count: number;
};

export type LessonRepeatableInterviewQuestion = {
  question_id: string;
  prompt: string;
  placeholder?: string | null;
  exclude_from_spelling?: boolean;
};

export type LessonRepeatableInterviewBlock = LessonAnswerableBlockBase & {
  block_type: "question_repeatable_interview";
  repeat_count: number;
  questions: LessonRepeatableInterviewQuestion[];
};

export type LessonComprehensionQuizOption = {
  option_id: string;
  label: string;
};

export type LessonComprehensionQuizQuestion = {
  question_id: string;
  prompt: string;
  options: LessonComprehensionQuizOption[];
  correct_option_id: string;
  explanation?: string | null;
};

export type LessonUnderstandingBand =
  | "secure"
  | "developing"
  | "review_needed";

export type LessonComprehensionQuizGroupBlock = LessonAnswerableBlockBase & {
  block_type: "comprehension_quiz_group";
  questions: LessonComprehensionQuizQuestion[];
  secure_threshold_percent?: number | null;
  developing_threshold_percent?: number | null;
};

export type LessonCarryForwardReferenceBlock = LessonDisplayBlock & {
  block_type: "carry_forward_reference";
  source_task_id?: string | null;
  source_block_id?: string | null;
  empty_state?: string | null;
};

export type LessonTitledDividerBlock = LessonDisplayBlock & {
  block_type: "titled_divider";
  title: string;
};

export type LessonDividerBlock = LessonBaseBlock & {
  block_type: "divider";
};

export type StructuredLessonBlock =
  | LessonHeadingBlock
  | LessonSectionIntroBlock
  | LessonRichTextBlock
  | LessonCalloutBlock
  | LessonActionLinkBlock
  | LessonInfoCardsBlock
  | LessonTextQuestionBlock
  | LessonTextareaQuestionBlock
  | LessonChoiceSingleBlock
  | LessonChoiceMultiBlock
  | LessonTableQuestionBlock
  | LessonRepeatableInterviewBlock
  | LessonComprehensionQuizGroupBlock
  | LessonCarryForwardReferenceBlock
  | LessonTitledDividerBlock
  | LessonDividerBlock;

export type StructuredLessonDocument = {
  version: 1;
  theme: LessonThemePreset;
  title: string;
  blocks: StructuredLessonBlock[];
};

export type StructuredLessonQuizAnswerValue = {
  selected_answers: Record<string, string>;
  correctness_by_question: Record<string, boolean>;
  score: number;
  total_questions: number;
  percentage: number;
  understanding_band: LessonUnderstandingBand;
};

export type StructuredLessonAnswerValue =
  | string
  | string[]
  | boolean
  | Record<string, string>
  | Array<Record<string, string>>
  | StructuredLessonQuizAnswerValue;

export type StructuredLessonAnswer = {
  block_id: string;
  value: StructuredLessonAnswerValue;
  feedback?: string | null;
};

export type StructuredLessonResponseStatus =
  | "draft"
  | "submitted"
  | "returned"
  | "approved";

export type StructuredLessonResponse = {
  task_id: string;
  child_id: string;
  status: StructuredLessonResponseStatus;
  answers: StructuredLessonAnswer[];
  draft_saved_at?: string | null;
  submitted_at?: string | null;
};

export function isStructuredLessonBlock(value: unknown): value is StructuredLessonBlock {
  if (!value || typeof value !== "object") {
    return false;
  }

  const blockType = (value as { block_type?: unknown }).block_type;
  const blockId = (value as { block_id?: unknown }).block_id;

  return (
    typeof blockId === "string" &&
    LESSON_BLOCK_TYPES.includes(blockType as LessonBlockType)
  );
}

export function isStructuredLessonDocument(
  value: unknown,
): value is StructuredLessonDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<StructuredLessonDocument>;

  return (
    candidate.version === 1 &&
    typeof candidate.title === "string" &&
    LESSON_THEME_PRESETS.includes(
      candidate.theme as LessonThemePreset,
    ) &&
    Array.isArray(candidate.blocks) &&
    candidate.blocks.every(isStructuredLessonBlock)
  );
}

export function isAnswerableLessonBlock(
  block: StructuredLessonBlock,
): block is
  | LessonTextQuestionBlock
  | LessonTextareaQuestionBlock
  | LessonChoiceSingleBlock
  | LessonChoiceMultiBlock
  | LessonTableQuestionBlock
  | LessonRepeatableInterviewBlock
  | LessonComprehensionQuizGroupBlock {
  return [
    "question_text",
    "question_textarea",
    "question_choice_single",
    "question_choice_multi",
    "question_table",
    "question_repeatable_interview",
    "comprehension_quiz_group",
  ].includes(block.block_type);
}

export function getLessonUnderstandingBand(
  percentage: number,
  thresholds?: {
    secure_threshold_percent?: number | null;
    developing_threshold_percent?: number | null;
  },
): LessonUnderstandingBand {
  const secureThreshold = thresholds?.secure_threshold_percent ?? 80;
  const developingThreshold = thresholds?.developing_threshold_percent ?? 50;

  if (percentage >= secureThreshold) {
    return "secure";
  }

  if (percentage >= developingThreshold) {
    return "developing";
  }

  return "review_needed";
}
