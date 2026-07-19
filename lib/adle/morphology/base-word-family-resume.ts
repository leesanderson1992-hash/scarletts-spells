import type { BaseWordFamilyLessonSnapshotV1 } from "./base-word-family-payload";

export type BaseWordFamilyLessonStage = "intro" | "families" | "cleave" | "word_sums" | "controlled" | "dictation" | "reflect";

export interface BaseWordFamilyResumeState {
  stage: BaseWordFamilyLessonStage;
  familyIndex: number;
  cleaveIndex: number;
  cleaveStep: number;
  cleaveCuts: Record<string, number[]>;
  cleaveMisses: Record<string, number>;
  buildIndex: number;
  controlledIndex: number;
  dictationIndex: number;
  controlledAttempts: Record<string, string>;
  controlledChecked: Record<string, boolean>;
  sentenceAttempts: Record<string, string>;
  sentenceChecked: boolean;
  reflectionText: string;
}

const STAGES: BaseWordFamilyLessonStage[] = ["intro", "families", "cleave", "word_sums", "controlled", "dictation", "reflect"];

export function baseWordFamilyResumeKey(previewId: string, contentVersion: string): string {
  return `adle:morphology-base-family:${previewId}:1:${contentVersion}`;
}

export function normaliseBaseWordFamilyResume(value: unknown, payload: BaseWordFamilyLessonSnapshotV1): BaseWordFamilyResumeState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<BaseWordFamilyResumeState>;
  const wordIds = new Set(payload.independentWords.map((word) => word.canonicalWordId));
  if (!STAGES.includes(state.stage as BaseWordFamilyLessonStage) || !Number.isInteger(state.familyIndex) || !Number.isInteger(state.cleaveIndex) || !Number.isInteger(state.cleaveStep) || !Number.isInteger(state.buildIndex) || !Number.isInteger(state.controlledIndex) || !Number.isInteger(state.dictationIndex) || typeof state.sentenceChecked !== "boolean" || typeof state.reflectionText !== "string" || state.reflectionText.length > 2000 || !recordOfNumbers(state.cleaveMisses) || !recordOfStrings(state.controlledAttempts) || !recordOfBooleans(state.controlledChecked) || !recordOfStrings(state.sentenceAttempts) || (state.cleaveCuts !== undefined && !recordOfNumberArrays(state.cleaveCuts))) return null;
  if (state.familyIndex! < 0 || state.familyIndex! >= payload.familySections.length || state.cleaveIndex! < 0 || state.cleaveIndex! >= payload.authenticTargets.length || state.cleaveStep! < 0 || state.buildIndex! < 0 || state.buildIndex! >= payload.familySections.flatMap((section) => section.guidedWords).length || state.controlledIndex! < 0 || state.controlledIndex! >= payload.independentWords.length || state.dictationIndex! < 0 || state.dictationIndex! >= payload.independentWords.length) return null;
  if ([...Object.keys(state.controlledAttempts!), ...Object.keys(state.controlledChecked!), ...Object.keys(state.sentenceAttempts!)].some((id) => !wordIds.has(id))) return null;
  return { ...state, cleaveCuts: state.cleaveCuts ?? {}, cleaveStep: state.cleaveCuts === undefined && state.stage === "cleave" ? 0 : state.cleaveStep } as BaseWordFamilyResumeState;
}

function recordOfStrings(value: unknown): value is Record<string, string> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "string"); }
function recordOfBooleans(value: unknown): value is Record<string, boolean> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "boolean"); }
function recordOfNumbers(value: unknown): value is Record<string, number> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => Number.isInteger(item) && item >= 0); }
function recordOfNumberArrays(value: unknown): value is Record<string, number[]> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => Array.isArray(item) && item.every((point) => Number.isInteger(point) && point > 0)); }
