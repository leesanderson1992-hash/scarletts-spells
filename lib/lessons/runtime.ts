import type { CourseTaskType } from "@/lib/courses/types";

import {
  isStructuredLessonDocument,
  type StructuredLessonDocument,
} from "./schema";

export type LessonTaskLike = {
  task_type: CourseTaskType;
  lesson_schema?: unknown;
};

export type LessonRuntimeMode =
  | "structured"
  | "plain_writing"
  | "none";

export function getStructuredLessonDocument(
  task: LessonTaskLike,
): StructuredLessonDocument | null {
  return isStructuredLessonDocument(task.lesson_schema)
    ? task.lesson_schema
    : null;
}

export function getLessonRuntimeMode(task: LessonTaskLike): LessonRuntimeMode {
  if (getStructuredLessonDocument(task)) {
    return "structured";
  }

  if (task.task_type === "lesson" || task.task_type === "test") {
    return "plain_writing";
  }

  return "none";
}
