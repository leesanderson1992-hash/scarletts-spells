import type { FirstImpressionStageId } from "../../../components/adle/first-impression/first-impression-lesson";
import type { IngScrabbleBoard } from "./scrabble";
import { ingScrabbleSpelling, validIngScrabbleBoard } from "./scrabble";
import type { IngLessonV1 } from "./contracts";
import { semanticJson } from "../inflection/semantic-json";

export interface IngProgressV1 {
  schemaVersion: 1;
  assignmentKey: string;
  stageId: FirstImpressionStageId;
  teachingPageIndex: number;
  meaningConnected: string[];
  meaningMisses: Record<string, number>;
  scrabbleIndex: number;
  scrabbleBoards: Record<string, IngScrabbleBoard>;
  scrabbleComplete: string[];
  cleaverIndex: number;
  cleaverProgress: Record<string, { revealed: boolean; questionShown: boolean; selectedOptionId: string | null; splitMisses?: number }>;
  coverIndex: number;
  coverProgress: Record<string, { state: "look" | "cover" | "write" | "check"; attempt: string }>;
  coverAttempts: Record<string, string>;
  dictationIndex: number;
  dictationValues: Record<string, string>;
  dictationChecked: string[];
  reflection: string;
  finished: boolean;
}
export function initialIngProgress(lesson: IngLessonV1): IngProgressV1 {
  return { schemaVersion: 1, assignmentKey: lesson.assignmentKey, stageId: "teaching", teachingPageIndex: 0,
    meaningConnected: [], meaningMisses: {}, scrabbleIndex: 0, scrabbleBoards: {}, scrabbleComplete: [], cleaverIndex: 0, cleaverProgress: {},
    coverIndex: 0, coverProgress: {}, coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: [], reflection: "", finished: false };
}
export function ingProgressValid(value: unknown, lesson: IngLessonV1): value is IngProgressV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as IngProgressV1;
  const ids = new Set(lesson.words.map(word => word.canonicalWordId));
  const meaningIds = new Set([0, 2, 4].map(index => lesson.words[index].canonicalWordId));
  const scrabbleIds = new Set([1, 3, 5].map(index => lesson.words[index].canonicalWordId));
  const queuedIds = new Set(lesson.queuedTargets.map(target => target.canonicalWordId));
  const record = (input: unknown) => !!input && typeof input === "object" && !Array.isArray(input);
  if (p.schemaVersion !== 1 || p.assignmentKey !== lesson.assignmentKey
    || !["teaching", "activity:meaning-match", "activity:ing-scrabble", "activity:cleaver", "cover", "dictation", "reflection"].includes(p.stageId)
    || !Number.isInteger(p.teachingPageIndex) || p.teachingPageIndex < 0 || p.teachingPageIndex > 2
    || !Number.isInteger(p.scrabbleIndex) || p.scrabbleIndex < 0 || p.scrabbleIndex > 2
    || !Number.isInteger(p.cleaverIndex) || p.cleaverIndex < 0 || p.cleaverIndex >= lesson.queuedTargets.length
    || !Number.isInteger(p.coverIndex) || p.coverIndex < 0 || p.coverIndex > 5
    || !Number.isInteger(p.dictationIndex) || p.dictationIndex < 0 || p.dictationIndex > 5
    || !Array.isArray(p.meaningConnected) || p.meaningConnected.some(id => !meaningIds.has(id)) || new Set(p.meaningConnected).size !== p.meaningConnected.length
    || !record(p.meaningMisses) || Object.entries(p.meaningMisses).some(([id, misses]) => !meaningIds.has(id) || !Number.isInteger(misses) || misses < 0)
    || !record(p.scrabbleBoards) || Object.entries(p.scrabbleBoards).some(([id, board]) => { const word = lesson.words.find(w => w.canonicalWordId === id); return !word || !scrabbleIds.has(id) || !validIngScrabbleBoard(board, word); })
    || !Array.isArray(p.scrabbleComplete) || p.scrabbleComplete.some(id => !scrabbleIds.has(id) || !p.scrabbleBoards[id] || ingScrabbleSpelling(p.scrabbleBoards[id]) !== lesson.words.find(w => w.canonicalWordId === id)?.word)
    || new Set(p.scrabbleComplete).size !== p.scrabbleComplete.length
    || !record(p.cleaverProgress) || Object.entries(p.cleaverProgress).some(([id, state]) => !queuedIds.has(id) || !record(state) || typeof state.revealed !== "boolean" || typeof state.questionShown !== "boolean" || (state.questionShown && !state.revealed) || ![null, "0", "1", "2"].includes(state.selectedOptionId))
    || !record(p.coverProgress) || Object.entries(p.coverProgress).some(([id, state]) => !ids.has(id) || !record(state) || !["look", "cover", "write", "check"].includes(state.state) || typeof state.attempt !== "string")
    || !record(p.coverAttempts) || Object.entries(p.coverAttempts).some(([id, text]) => !ids.has(id) || typeof text !== "string" || !text.trim())
    || !record(p.dictationValues) || Object.entries(p.dictationValues).some(([id, text]) => !ids.has(id) || typeof text !== "string" || text.length > 80)
    || !Array.isArray(p.dictationChecked) || p.dictationChecked.some(id => !ids.has(id) || !p.dictationValues[id]?.trim()) || new Set(p.dictationChecked).size !== p.dictationChecked.length
    || typeof p.reflection !== "string" || p.reflection.length > 2000 || typeof p.finished !== "boolean") return false;
  return !p.finished || (p.stageId === "reflection" && !!p.reflection.trim() && p.meaningConnected.length === 3 && p.scrabbleComplete.length === 3
    && lesson.queuedTargets.every(target => { const state = p.cleaverProgress[target.canonicalWordId]; return state?.revealed && state.questionShown && state.selectedOptionId === "0"; })
    && lesson.words.every(word => p.coverAttempts[word.canonicalWordId] && p.dictationChecked.includes(word.canonicalWordId)));
}
export function ingProgressTransitionValid(previous: unknown, next: unknown, lesson: IngLessonV1): boolean {
  if (!ingProgressValid(next, lesson)) return false;
  if (previous === null) return true;
  if (!ingProgressValid(previous, lesson)) return false;
  if (previous.finished) return semanticJson(previous) === semanticJson(next);
  if (previous.meaningConnected.some(id => !next.meaningConnected.includes(id)) || previous.scrabbleComplete.some(id => !next.scrabbleComplete.includes(id))) return false;
  if (Object.entries(previous.coverAttempts).some(([id, text]) => next.coverAttempts[id] !== text)) return false;
  if (previous.dictationChecked.some(id => !next.dictationChecked.includes(id) || previous.dictationValues[id] !== next.dictationValues[id])) return false;
  return true;
}

export function ingCheckpointReplayVersion(previousPayload: unknown, nextPayload: unknown, previousVersion: number, expectedVersion: number): number | null {
  return Number.isInteger(previousVersion) && previousVersion > expectedVersion && expectedVersion >= 0
    && semanticJson(previousPayload) === semanticJson(nextPayload) ? previousVersion : null;
}
