/** Raw submitted values, before the existing lesson-summary formatter trims
 * or flattens them. The saved schema determines authorship during analysis. */
export function buildRawLessonSourceDraft(input: {
  answerMap: Readonly<Record<string, unknown>>;
  taskId: string;
  childId: string;
}) {
  return {
    __structured_lesson_response: {
      task_id: input.taskId,
      child_id: input.childId,
      answers: Object.entries(input.answerMap).map(([block_id, value]) => ({ block_id, value })),
    },
  };
}
