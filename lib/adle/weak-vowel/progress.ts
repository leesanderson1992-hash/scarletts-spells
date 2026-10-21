import type { WeakVowelLessonV1 } from "./lesson";
import { semanticJson } from "../inflection/semantic-json";

export type WeakVowelStage = "teaching" | "activity:dinner" | "activity:detective" | "cover" | "dictation" | "reflection";

export interface WeakVowelProgressV1 {
  schemaVersion: 1;
  assignmentKey: string;
  contentVersion: string;
  stageId: WeakVowelStage;
  teachingPageIndex: number;
  dinnerState: unknown;
  dinnerResponse: Record<string, unknown> | null;
  detectiveState: unknown;
  detectiveResponse: Record<string, unknown> | null;
  coverIndex: number;
  coverStates: Record<string, { state: "look" | "cover" | "write" | "check"; attempt: string }>;
  coverAttempts: Record<string, string>;
  dictationIndex: number;
  dictationValues: Record<string, string>;
  /** Frozen original, answer-hidden sentence attempt; later repairs stay in dictationValues. */
  dictationAttempts: Record<string, string>;
  dictationChecked: string[];
  reflection: string;
  finished: boolean;
}

export function initialWeakVowelProgress(lesson: WeakVowelLessonV1): WeakVowelProgressV1 {
  return { schemaVersion: 1, assignmentKey: lesson.assignmentKey, contentVersion: lesson.contentVersion,
    stageId: "teaching", teachingPageIndex: 0, dinnerState: null, dinnerResponse: null,
    detectiveState: null, detectiveResponse: null, coverIndex: 0, coverStates: {}, coverAttempts: {},
    dictationIndex: 0, dictationValues: {}, dictationAttempts: {}, dictationChecked: [], reflection: "", finished: false };
}

export function weakVowelProgressValid(value: unknown, lesson: WeakVowelLessonV1): value is WeakVowelProgressV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as WeakVowelProgressV1;
  const ids = new Set(lesson.words.map((word) => word.canonicalWordId));
  return p.schemaVersion === 1 && p.assignmentKey === lesson.assignmentKey && p.contentVersion === lesson.contentVersion &&
    ["teaching", "activity:dinner", "activity:detective", "cover", "dictation", "reflection"].includes(p.stageId) &&
    Number.isInteger(p.teachingPageIndex) && p.teachingPageIndex >= 0 && p.teachingPageIndex < lesson.teaching.pages.length + 1 &&
    Number.isInteger(p.coverIndex) && p.coverIndex >= 0 && p.coverIndex < lesson.words.length &&
    Number.isInteger(p.dictationIndex) && p.dictationIndex >= 0 && p.dictationIndex < lesson.words.length &&
    p.coverStates !== null && typeof p.coverStates === "object" && !Array.isArray(p.coverStates) &&
    p.coverAttempts !== null && typeof p.coverAttempts === "object" && !Array.isArray(p.coverAttempts) &&
    Object.entries(p.coverAttempts).every(([id, attempt]) => ids.has(id) && typeof attempt === "string" && attempt.length <= 200) &&
    p.dictationValues !== null && typeof p.dictationValues === "object" && !Array.isArray(p.dictationValues) &&
    Object.entries(p.dictationValues).every(([id, sentence]) => ids.has(id) && typeof sentence === "string" && sentence.length <= 1000) &&
    p.dictationAttempts !== null && typeof p.dictationAttempts === "object" && !Array.isArray(p.dictationAttempts) &&
    Object.entries(p.dictationAttempts).every(([id, sentence]) => ids.has(id) && typeof sentence === "string" && sentence.length <= 1000) &&
    Array.isArray(p.dictationChecked) && p.dictationChecked.every((id) => typeof id === "string" && ids.has(id)) &&
    p.dictationChecked.every((id) => Object.hasOwn(p.dictationAttempts, id)) &&
    typeof p.reflection === "string" && p.reflection.length <= 1000 && typeof p.finished === "boolean";
}

export function weakVowelReadyToFinish(p: WeakVowelProgressV1, lesson: WeakVowelLessonV1): boolean {
  const selectedIds = lesson.words.map((word) => word.canonicalWordId);
  const guidedComplete = (response: Record<string, unknown> | null) => response?.guided === true &&
    Array.isArray(response.words) && response.words.length === selectedIds.length &&
    response.words.every((value, index) => Boolean(value) && typeof value === "object" &&
      (value as { canonicalWordId?: unknown }).canonicalWordId === selectedIds[index]);
  return p.stageId === "reflection" && guidedComplete(p.dinnerResponse) &&
    guidedComplete(p.detectiveResponse) && Boolean(p.reflection.trim()) &&
    lesson.words.every((word) => Object.hasOwn(p.coverAttempts, word.canonicalWordId) &&
      p.dictationChecked.includes(word.canonicalWordId) && Object.hasOwn(p.dictationAttempts, word.canonicalWordId));
}

/** The first answer-hidden writing is immutable even when the child repairs
 * the visible answer later. Guided state may advance but cannot be recast as
 * a fresh spelling attempt by resubmitting a checkpoint. */
export function weakVowelProgressTransitionValid(previous: unknown, next: unknown, lesson: WeakVowelLessonV1): boolean {
  if (!weakVowelProgressValid(next, lesson) || next.finished) return false;
  if (previous === null || previous === undefined) return true;
  if (!weakVowelProgressValid(previous, lesson) || previous.finished) return false;
  if (previous.dinnerResponse && semanticJson(previous.dinnerResponse) !== semanticJson(next.dinnerResponse)) return false;
  if (previous.detectiveResponse && semanticJson(previous.detectiveResponse) !== semanticJson(next.detectiveResponse)) return false;
  for (const [id, attempt] of Object.entries(previous.coverAttempts)) {
    if (next.coverAttempts[id] !== attempt) return false;
  }
  for (const [id, attempt] of Object.entries(previous.dictationAttempts)) {
    if (next.dictationAttempts[id] !== attempt || !next.dictationChecked.includes(id)) return false;
  }
  if (previous.dictationChecked.some((id) => !next.dictationChecked.includes(id))) return false;
  return true;
}

export function weakVowelCheckpointReplayVersion(previousPayload: unknown, nextPayload: unknown,
  previousVersion: number, expectedVersion: number): number | null {
  return Number.isInteger(previousVersion) && previousVersion > expectedVersion && expectedVersion >= 0 &&
    semanticJson(previousPayload) === semanticJson(nextPayload) ? previousVersion : null;
}
