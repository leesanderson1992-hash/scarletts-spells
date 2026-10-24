import { semanticJson } from "../inflection/semantic-json";
import type { FrozenConvergenceAssignment } from "./convergence-assignment";
import { validateFrozenConvergenceAssignment } from "./convergence-assignment";
import { homophoneProgressComplete, homophoneProgressTransitionValid, homophoneProgressValid,
  initialHomophoneProgress, type HomophoneProgressV1 } from "./progress";
import type { ContextualChoiceResponse } from "./contextual-choice-contract";

export type ContextualProgressV1 = {
  schemaVersion: 1;
  stage: "guided" | "context_check";
  guided: HomophoneProgressV1;
  responses: ContextualChoiceResponse[];
  responsesLocked: boolean;
  completed: boolean;
};

export function initialContextualProgress(): ContextualProgressV1 {
  return { schemaVersion: 1, stage: "guided", guided: initialHomophoneProgress(),
    responses: [], responsesLocked: false, completed: false };
}

export function contextualProgressValid(value: unknown, assignment: FrozenConvergenceAssignment): value is ContextualProgressV1 {
  if (!validateFrozenConvergenceAssignment(assignment) || !value || typeof value !== "object") return false;
  const progress = value as ContextualProgressV1;
  if (progress.schemaVersion !== 1 || !["guided", "context_check"].includes(progress.stage)
    || progress.completed !== false || typeof progress.responsesLocked !== "boolean"
    || !homophoneProgressValid(progress.guided, assignment.guidedLesson.lesson)
    || !Array.isArray(progress.responses)) return false;
  const questions = new Map(assignment.contextCheck.questions.map(question => [question.questionId, question]));
  if (new Set(progress.responses.map(response => response.questionId)).size !== progress.responses.length
    || progress.responses.some((response, index) => response.questionId !== assignment.contextCheck.questions[index]?.questionId)
    || progress.responses.some(response => !response || typeof response.questionId !== "string"
      || typeof response.selectedWordId !== "string"
      || !questions.get(response.questionId)?.optionWordIds.includes(response.selectedWordId))) return false;
  if (progress.stage === "guided" && (progress.responses.length > 0 || progress.responsesLocked
    || progress.guided.completed)) return false;
  if (progress.stage === "context_check" && (!homophoneProgressComplete(progress.guided, assignment.guidedLesson.lesson)
    || !progress.guided.completed)) return false;
  return !progress.responsesLocked || progress.responses.length === questions.size;
}

/** CAS checkpoints may add choices, but cannot erase a checked answer or return to guided work. */
export function contextualProgressTransitionValid(previous: unknown, next: unknown,
  assignment: FrozenConvergenceAssignment): boolean {
  if (!contextualProgressValid(next, assignment)) return false;
  if (previous === null || previous === undefined) return next.stage === "guided";
  if (!contextualProgressValid(previous, assignment) || previous.responsesLocked) return false;
  if (previous.stage === "context_check" && next.stage !== "context_check") return false;
  if (previous.responses.some(response => !next.responses.some(candidate =>
    candidate.questionId === response.questionId && candidate.selectedWordId === response.selectedWordId))) return false;
  if (previous.stage === "guided") {
    if (next.stage === "guided") return homophoneProgressTransitionValid(previous.guided, next.guided,
      assignment.guidedLesson.lesson);
    if (!homophoneProgressComplete(next.guided, assignment.guidedLesson.lesson)
      || semanticJson({ ...previous.guided, completed: false }) !== semanticJson({ ...next.guided, completed: false })) return false;
  } else if (semanticJson(previous.guided) !== semanticJson(next.guided)) return false;
  return true;
}

export function contextualProgressReadyToFinish(value: unknown, assignment: FrozenConvergenceAssignment):
  value is ContextualProgressV1 {
  return contextualProgressValid(value, assignment)
    && value.stage === "context_check" && value.responsesLocked;
}
