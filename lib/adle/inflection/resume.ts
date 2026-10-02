import type { FirstImpressionStageId } from "../../../components/adle/first-impression/first-impression-lesson";
import type { ShutterState } from "../../../components/adle/activities/shared/cover-shutter";
import type { SnapRailProgress } from "../../../components/adle/activities/shared/snap-rail";
import type { TransformTargetProps } from "../../../components/adle/activities/shared/split-handle";
import type { ComparativeLessonV1 } from "./contracts";
import { semanticJson } from "./semantic-json";

export interface ComparativeProgressV1 {
  schemaVersion: 1;
  assignmentKey: string;
  stageId: FirstImpressionStageId;
  teachingPageIndex: number;
  sentenceIndex: number;
  sentenceProgress: Record<string, { rail: SnapRailProgress; placed: boolean }>;
  sortPreludeComplete: boolean;
  sortComplete: boolean;
  cleaverIndex: number;
  cleaverProgress: Record<string, NonNullable<TransformTargetProps["initialProgress"]>>;
  coverIndex: number;
  coverProgress: Record<string, { state: ShutterState; attempt: string }>;
  coverAttempts: Record<string, string>;
  dictationIndex: number;
  dictationValues: Record<string, [string, string]>;
  dictationChecked: Record<string, boolean>;
  reflection: string;
  finished: boolean;
}
export function initialComparativeProgress(lesson: ComparativeLessonV1): ComparativeProgressV1 {
  return { schemaVersion: 1, assignmentKey: lesson.assignmentKey, stageId: "teaching", teachingPageIndex: 0,
    sentenceIndex: 0, sentenceProgress: {}, sortPreludeComplete: false, sortComplete: false, cleaverIndex: 0, cleaverProgress: {},
    coverIndex: 0, coverProgress: {}, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {}, reflection: "", finished: false };
}
/** Invalid progress is rejected, never coerced into a completed activity. */
export function comparativeProgressValid(value: unknown, lesson: ComparativeLessonV1): value is ComparativeProgressV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as ComparativeProgressV1;
  const object = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x);
  if (p.schemaVersion !== 1 || p.assignmentKey !== lesson.assignmentKey
    || !["teaching", "activity:sentence-build", "activity:degree-sort", "activity:cleaver", "cover", "dictation", "reflection"].includes(p.stageId)
    || !Number.isInteger(p.teachingPageIndex) || p.teachingPageIndex < 0 || p.teachingPageIndex > 2
    || !Number.isInteger(p.sentenceIndex) || p.sentenceIndex < 0 || p.sentenceIndex >= lesson.sentenceTasks.length
    || !Number.isInteger(p.cleaverIndex) || p.cleaverIndex < 0 || p.cleaverIndex >= lesson.cleaverTasks.length
    || !Number.isInteger(p.coverIndex) || p.coverIndex < 0 || p.coverIndex > 5
    || !Number.isInteger(p.dictationIndex) || p.dictationIndex < 0 || p.dictationIndex > 1
    || [p.sortPreludeComplete, p.sortComplete, p.finished].some(x => typeof x !== "boolean")
    || typeof p.reflection !== "string" || p.reflection.length > 2000
    || [p.sentenceProgress, p.cleaverProgress, p.coverProgress, p.coverAttempts, p.dictationValues, p.dictationChecked].some(x => !object(x))) return false;
  if (Object.entries(p.sentenceProgress).some(([id, s]) => !lesson.sentenceTasks.some(t => t.id === id)
    || !s || !s.rail || !Array.isArray(s.rail.placedIds) || s.rail.placedIds.length !== 1
    || ![null, "er", "est"].includes(s.rail.placedIds[0]) || typeof s.placed !== "boolean" || typeof s.rail.completed !== "boolean")) return false;
  if (Object.entries(p.cleaverProgress).some(([id, s]) => !lesson.cleaverTasks.some(t => t.target.canonicalWordId === id)
    || !s || typeof s.revealed !== "boolean" || typeof s.questionShown !== "boolean" || (s.questionShown && !s.revealed)
    || (s.splitMisses !== undefined && (!Number.isInteger(s.splitMisses) || s.splitMisses < 0 || s.splitMisses > 2))
    || (s.selectedOptionId !== null && !lesson.cleaverTasks.find(t => t.target.canonicalWordId === id)!.question.options.some(o => o.id === s.selectedOptionId)))) return false;
  if (Object.entries(p.coverProgress).some(([id, s]) => !lesson.words.some(w => w.canonicalWordId === id) || !s || !["look", "cover", "write", "check"].includes(s.state) || typeof s.attempt !== "string")) return false;
  if (Object.entries(p.coverAttempts).some(([id, text]) => !lesson.words.some(w => w.canonicalWordId === id) || typeof text !== "string" || !text.trim())) return false;
  if (Object.entries(p.dictationValues).some(([id, values]) => !lesson.dictationTasks.some(t => t.id === id) || !Array.isArray(values) || values.length !== 2 || values.some(v => typeof v !== "string" || v.length > 80))) return false;
  if (Object.entries(p.dictationChecked).some(([id, checked]) => !lesson.dictationTasks.some(t => t.id === id) || typeof checked !== "boolean" || (checked && (!p.dictationValues[id] || p.dictationValues[id].some(v => !v.trim()))))) return false;
  return !p.finished || (p.stageId === "reflection" && !!p.reflection.trim()
    && p.sortPreludeComplete && p.sortComplete
    && lesson.sentenceTasks.every(t => p.sentenceProgress[t.id]?.placed
      && p.sentenceProgress[t.id].rail.placedIds[0] === (t.degree === "comparative" ? "er" : "est"))
    && lesson.cleaverTasks.every(t => p.cleaverProgress[t.target.canonicalWordId]?.revealed
      && p.cleaverProgress[t.target.canonicalWordId]?.questionShown
      && p.cleaverProgress[t.target.canonicalWordId]?.selectedOptionId === t.question.correctOptionId)
    && lesson.words.every(w => typeof p.coverAttempts[w.canonicalWordId] === "string")
    && lesson.dictationTasks.every(t => p.dictationChecked[t.id] === true));
}
/** Checked answers are immutable, including after reload and retry. */
export function comparativeProgressTransitionValid(previous: unknown, next: unknown, lesson: ComparativeLessonV1): boolean {
  if (!comparativeProgressValid(next, lesson)) return false;
  if (previous == null) return true;
  if (!comparativeProgressValid(previous, lesson)) return false;
  if (previous.finished) return semanticJson(previous) === semanticJson(next);
  if (previous.sortComplete && !next.sortComplete) return false;
  if (Object.entries(previous.coverAttempts).some(([id, text]) => next.coverAttempts[id] !== text)) return false;
  if (lesson.dictationTasks.some(t => previous.dictationChecked[t.id]
    && (!next.dictationChecked[t.id] || semanticJson(previous.dictationValues[t.id]) !== semanticJson(next.dictationValues[t.id])))) return false;
  return true;
}

/** A response lost after an identical save can recover its version without a second write. */
export function comparativeCheckpointReplayVersion(previousPayload: unknown, nextPayload: unknown, previousVersion: number, expectedVersion: number): number | null {
  return Number.isInteger(previousVersion) && previousVersion > expectedVersion && expectedVersion >= 0
    && semanticJson(previousPayload) === semanticJson(nextPayload) ? previousVersion : null;
}
