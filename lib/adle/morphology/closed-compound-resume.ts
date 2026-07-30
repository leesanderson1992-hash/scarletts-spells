import {
  morphologyResumeKey,
  parseMorphologyResume,
  serialiseMorphologyResume,
} from "./resume";

export type ClosedCompoundStage =
  | "intro"
  | "jigsaw"
  | "meaning"
  | "controlled"
  | "dictation"
  | "reflect";

export interface ClosedCompoundResumeState {
  stage: ClosedCompoundStage;
  index: number;
  muted: boolean;
  attempts: Record<string, string>;
  sentences: Record<string, string>;
  sentenceChecked: boolean;
  reflection: string;
  jigsawLocked: string[];
  jigsawMisses: Record<string, number>;
  meaningConnected: string[];
  meaningMisses: Record<string, number>;
}

const stages: readonly ClosedCompoundStage[] = [
  "intro",
  "jigsaw",
  "meaning",
  "controlled",
  "dictation",
  "reflect",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: unknown, ids: Set<string>): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) => ids.has(key) && typeof entry === "string",
    )
  );
}

function countRecord(value: unknown, ids: Set<string>): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        ids.has(key) &&
        Number.isInteger(entry) &&
        Number(entry) >= 0 &&
        Number(entry) <= 100,
    )
  );
}

function idList(value: unknown, ids: Set<string>): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && ids.has(entry)) &&
    new Set(value).size === value.length
  );
}

export function closedCompoundResumeKey(
  assignmentId: string,
  contentVersion: string,
): string {
  return `${morphologyResumeKey(assignmentId, contentVersion)}:closed-compound`;
}

export function normaliseClosedCompoundResume(
  value: unknown,
  canonicalWordIds: readonly string[],
): ClosedCompoundResumeState | null {
  if (!isRecord(value)) return null;
  const ids = new Set(canonicalWordIds);
  if (
    !stages.includes(value.stage as ClosedCompoundStage) ||
    !Number.isInteger(value.index) ||
    Number(value.index) < 0 ||
    Number(value.index) >= canonicalWordIds.length ||
    typeof value.muted !== "boolean" ||
    typeof value.sentenceChecked !== "boolean" ||
    typeof value.reflection !== "string" ||
    value.reflection.length > 2000 ||
    !stringRecord(value.attempts, ids) ||
    !stringRecord(value.sentences, ids) ||
    !idList(value.jigsawLocked, ids) ||
    !countRecord(value.jigsawMisses, ids) ||
    !idList(value.meaningConnected, ids) ||
    !countRecord(value.meaningMisses, ids)
  ) {
    return null;
  }
  const state = value as unknown as ClosedCompoundResumeState;
  if (state.stage === "controlled" && state.attempts[canonicalWordIds[state.index]] !== undefined) {
    state.index += 1;
    if (state.index >= canonicalWordIds.length) {
      state.stage = "dictation";
      state.index = 0;
    }
  }
  if (state.stage === "dictation" && state.sentenceChecked) {
    state.sentenceChecked = false;
    state.index += 1;
    if (state.index >= canonicalWordIds.length) {
      state.stage = "reflect";
      state.index = 0;
    }
  }
  return state;
}

export function parseClosedCompoundResume(
  raw: string | null,
  contentVersion: string,
  canonicalWordIds: readonly string[],
): ClosedCompoundResumeState | null {
  return normaliseClosedCompoundResume(
    parseMorphologyResume<unknown>(raw, contentVersion),
    canonicalWordIds,
  );
}

export function serialiseClosedCompoundResume(
  contentVersion: string,
  state: ClosedCompoundResumeState,
): string {
  return serialiseMorphologyResume(contentVersion, state);
}
