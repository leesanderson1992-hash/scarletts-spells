import {
  cloneStructuredLessonDocument,
  type StructuredLessonPreset,
} from "@/lib/lessons/presets";
import {
  isStructuredLessonDocument,
  type StructuredLessonDocument,
} from "@/lib/lessons/schema";

export const PERSONAL_LESSON_TEMPLATE_TITLE_MAX_LENGTH = 120;
export const PERSONAL_LESSON_TEMPLATE_DESCRIPTION_MAX_LENGTH = 280;

export type PersonalLessonTemplate = {
  id: string;
  title: string;
  description: string | null;
  lesson: StructuredLessonDocument;
  createdAt: string;
  updatedAt: string;
};

export type LessonTemplatePickerOption =
  | {
      kind: "preset";
      id: string;
      title: string;
      description: string;
      lesson: StructuredLessonDocument;
    }
  | {
      kind: "personal";
      id: string;
      title: string;
      description: string | null;
      lesson: StructuredLessonDocument;
      updatedAt: string;
    };

type PersonalLessonTemplateRow = {
  id: unknown;
  title: unknown;
  description: unknown;
  lesson_schema: unknown;
  created_at: unknown;
  updated_at: unknown;
};

export function normalisePersonalLessonTemplateTitle(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, PERSONAL_LESSON_TEMPLATE_TITLE_MAX_LENGTH);
}

export function normalisePersonalLessonTemplateDescription(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, PERSONAL_LESSON_TEMPLATE_DESCRIPTION_MAX_LENGTH);
}

export function parsePersonalLessonTemplateLesson(value: unknown) {
  if (!isStructuredLessonDocument(value)) {
    return null;
  }

  return cloneStructuredLessonDocument(value);
}

export function buildPersonalLessonTemplateSnapshot(input: {
  lesson: StructuredLessonDocument;
  taskTitle?: string | null;
}) {
  const nextLesson = cloneStructuredLessonDocument(input.lesson);
  const nextTitle = typeof input.taskTitle === "string" ? input.taskTitle.trim() : "";

  if (nextTitle) {
    nextLesson.title = nextTitle;
  }

  return nextLesson;
}

export function mapPersonalLessonTemplateRow(row: PersonalLessonTemplateRow): PersonalLessonTemplate | null {
  const title = normalisePersonalLessonTemplateTitle(row.title);
  const lesson = parsePersonalLessonTemplateLesson(row.lesson_schema);
  const id = typeof row.id === "string" && row.id.trim() ? row.id : null;
  const createdAt = typeof row.created_at === "string" ? row.created_at : null;
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;

  if (!id || !title || !lesson || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    title,
    description: normalisePersonalLessonTemplateDescription(row.description),
    lesson,
    createdAt,
    updatedAt,
  };
}

export function buildLessonTemplatePickerOptionFromPreset(
  preset: StructuredLessonPreset,
): LessonTemplatePickerOption {
  return {
    kind: "preset",
    id: preset.id,
    title: preset.label,
    description: preset.description,
    lesson: cloneStructuredLessonDocument(preset.lesson),
  };
}

export function buildLessonTemplatePickerOptionFromPersonalTemplate(
  template: PersonalLessonTemplate,
): LessonTemplatePickerOption {
  return {
    kind: "personal",
    id: template.id,
    title: template.title,
    description: template.description,
    lesson: cloneStructuredLessonDocument(template.lesson),
    updatedAt: template.updatedAt,
  };
}

export function getPersonalLessonTemplateDatabaseError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't save that lesson template just yet.";
  }

  if (message.includes('relation "personal_lesson_templates" does not exist')) {
    return "The lesson template table is missing in Supabase. Run the latest lesson template migration before trying again.";
  }

  return `We couldn't save that lesson template just yet. ${message}`;
}
