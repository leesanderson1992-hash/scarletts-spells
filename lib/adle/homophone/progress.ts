import type { FirstImpressionStageId } from "@/components/adle/first-impression/first-impression-lesson";
import type { HomophoneLesson } from "./lesson";
import { semanticJson } from "../inflection/semantic-json";

export type HomophoneChoiceMistake = {
  activity: "bin-sort" | "balloon-pop";
  word: string;
  selected: string | null;
  sentence: string;
};

export type HomophoneProgressV1 = {
  stage: FirstImpressionStageId;
  teachingPage: number;
  muted: boolean;
  binSortCompleted: boolean;
  balloonCompleted: boolean;
  coverIndex: number;
  coverAttempts: Record<string, string>;
  dictationIndex: number;
  dictationValues: Record<string, [string, string]>;
  dictationChecked: Record<string, boolean>;
  choiceMistakes: HomophoneChoiceMistake[];
  reflectionResponse: string;
  completed: boolean;
};

export function initialHomophoneProgress(): HomophoneProgressV1 {
  return { stage: "teaching", teachingPage: 0, muted: false, binSortCompleted: false, balloonCompleted: false, coverIndex: 0,
    coverAttempts: {}, dictationIndex: 0, dictationValues: {}, dictationChecked: {},
    choiceMistakes: [], reflectionResponse: "", completed: false };
}

function stringRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every(entry => typeof entry === "string" && entry.length <= 200);
}

export function homophoneProgressValid(value: unknown, lesson: HomophoneLesson): value is HomophoneProgressV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<HomophoneProgressV1>;
  const words = new Set(lesson.words.map(entry => entry.word));
  return typeof p.stage === "string" && ["teaching", "activity:bin-sort", "activity:balloon-pop", "cover", "dictation", "reflection"].includes(p.stage)
    && Number.isInteger(p.teachingPage) && p.teachingPage! >= 0 && p.teachingPage! < lesson.words.length + 1
    && typeof p.muted === "boolean" && typeof p.completed === "boolean"
    && typeof p.binSortCompleted === "boolean" && typeof p.balloonCompleted === "boolean"
    && Number.isInteger(p.coverIndex) && p.coverIndex! >= 0 && p.coverIndex! < lesson.coverCheck.length
    && Number.isInteger(p.dictationIndex) && p.dictationIndex! >= 0 && p.dictationIndex! < lesson.dictationPassages.length
    && stringRecord(p.coverAttempts) && Object.keys(p.coverAttempts).every(word => words.has(word))
    && !!p.dictationValues && typeof p.dictationValues === "object" && !Array.isArray(p.dictationValues)
    && Object.entries(p.dictationValues).every(([key, values]) => /^\d+$/.test(key) && Number(key) < lesson.dictationPassages.length && Array.isArray(values) && values.length === 2 && values.every(item => typeof item === "string" && item.length <= 200))
    && !!p.dictationChecked && typeof p.dictationChecked === "object" && !Array.isArray(p.dictationChecked)
    && Object.entries(p.dictationChecked).every(([key, checked]) => /^\d+$/.test(key) && Number(key) < lesson.dictationPassages.length && typeof checked === "boolean" && (!checked || p.dictationValues?.[key]?.length === 2))
    && Array.isArray(p.choiceMistakes) && p.choiceMistakes.length <= 500
    && p.choiceMistakes.every(entry => (entry.activity === "bin-sort" || entry.activity === "balloon-pop") && words.has(entry.word) && (entry.selected === null || words.has(entry.selected)) && typeof entry.sentence === "string" && entry.sentence.length <= 300)
    && typeof p.reflectionResponse === "string" && p.reflectionResponse.length <= 1000;
}

export function homophoneProgressComplete(progress: HomophoneProgressV1, lesson: HomophoneLesson): boolean {
  return progress.stage === "reflection"
    && progress.binSortCompleted && progress.balloonCompleted
    && progress.reflectionResponse.trim().length > 0
    && lesson.coverCheck.every(word => progress.coverAttempts[word] !== undefined)
    && lesson.dictationPassages.every((_, index) => progress.dictationChecked[String(index)] === true
      && progress.dictationValues[String(index)]?.length === 2);
}

/** Checked writing and recorded guided mistakes cannot be rewritten on retry. */
export function homophoneProgressTransitionValid(previous: unknown, next: unknown, lesson: HomophoneLesson): boolean {
  if (!homophoneProgressValid(next, lesson) || next.completed) return false;
  if (previous === null || previous === undefined) return true;
  if (!homophoneProgressValid(previous, lesson) || previous.completed) return false;
  if ((previous.binSortCompleted && !next.binSortCompleted) || (previous.balloonCompleted && !next.balloonCompleted)) return false;
  if (next.choiceMistakes.length < previous.choiceMistakes.length
    || semanticJson(next.choiceMistakes.slice(0, previous.choiceMistakes.length)) !== semanticJson(previous.choiceMistakes)) return false;
  for (const [word, attempt] of Object.entries(previous.coverAttempts)) {
    if (next.coverAttempts[word] !== attempt) return false;
  }
  for (const [index, checked] of Object.entries(previous.dictationChecked)) {
    if (checked && (next.dictationChecked[index] !== true
      || semanticJson(next.dictationValues[index]) !== semanticJson(previous.dictationValues[index]))) return false;
  }
  return true;
}

export function homophoneCheckpointReplayVersion(previousPayload: unknown, nextPayload: unknown, previousVersion: number, expectedVersion: number): number | null {
  return Number.isInteger(previousVersion) && previousVersion > expectedVersion && expectedVersion >= 0
    && semanticJson(previousPayload) === semanticJson(nextPayload) ? previousVersion : null;
}
