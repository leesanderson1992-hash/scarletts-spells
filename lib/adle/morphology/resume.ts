export const MORPHOLOGY_RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MorphologyResumeEnvelope<T> {
  savedAt: number;
  schemaVersion: 1;
  contentVersion: string;
  state: T;
}

export type MorphologyLessonStage = "learn" | "discover" | "split" | "match" | "build" | "controlled" | "dictation" | "reflect";

export interface MorphologyLessonResumeState {
  stage: MorphologyLessonStage;
  introIndex: number;
  discoverIndex: number;
  discoverAddedPrefix: boolean;
  splitMisses: number;
  splitCorrect: boolean;
  matchComplete: boolean;
  controlledIndex: number;
  dictationIndex: number;
  controlledAttempts: Record<string, string>;
  controlledChecked: Record<string, boolean>;
  sentenceAttempts: Record<string, string>;
  checkedSentence: boolean;
  guidedBindings: string[];
  muted: boolean;
  helpLevel: number;
  reflectionText: string;
}

const LESSON_STAGES: readonly MorphologyLessonStage[] = ["learn", "discover", "split", "match", "build", "controlled", "dictation", "reflect"];

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "boolean");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normaliseMorphologyLessonResume(
  value: unknown,
  canonicalWordIds: readonly string[],
  validGuidedBindings: readonly string[],
): MorphologyLessonResumeState | null {
  if (!isRecord(value) || !LESSON_STAGES.includes(value.stage as MorphologyLessonStage)) return null;
  if (!Number.isInteger(value.introIndex) || Number(value.introIndex) < 0 || Number(value.introIndex) > 2 || !Number.isInteger(value.discoverIndex) || Number(value.discoverIndex) < 0 || Number(value.discoverIndex) > 3 || !Number.isInteger(value.splitMisses) || Number(value.splitMisses) < 0 || Number(value.splitMisses) > 2 || !Number.isInteger(value.controlledIndex) || Number(value.controlledIndex) < 0 || Number(value.controlledIndex) > 3 || !Number.isInteger(value.dictationIndex) || Number(value.dictationIndex) < 0 || Number(value.dictationIndex) > 3 || !Number.isInteger(value.helpLevel) || Number(value.helpLevel) < 0 || Number(value.helpLevel) > 2) return null;
  if (typeof value.discoverAddedPrefix !== "boolean" || typeof value.splitCorrect !== "boolean" || typeof value.matchComplete !== "boolean" || typeof value.checkedSentence !== "boolean" || typeof value.muted !== "boolean" || typeof value.reflectionText !== "string" || value.reflectionText.length > 2000 || !isStringRecord(value.controlledAttempts) || !isBooleanRecord(value.controlledChecked) || !isStringRecord(value.sentenceAttempts) || !Array.isArray(value.guidedBindings) || !value.guidedBindings.every((entry) => typeof entry === "string")) return null;
  const wordIds = new Set(canonicalWordIds);
  if (Object.keys(value.controlledAttempts).some((id) => !wordIds.has(id)) || Object.keys(value.controlledChecked).some((id) => !wordIds.has(id)) || Object.keys(value.sentenceAttempts).some((id) => !wordIds.has(id))) return null;
  const bindingSet = new Set(validGuidedBindings);
  if (value.guidedBindings.some((binding) => !bindingSet.has(binding))) return null;
  const state: MorphologyLessonResumeState = {
    stage: value.stage as MorphologyLessonStage,
    introIndex: Number(value.introIndex),
    discoverIndex: Number(value.discoverIndex),
    discoverAddedPrefix: value.discoverAddedPrefix,
    splitMisses: Number(value.splitMisses),
    splitCorrect: value.splitCorrect,
    matchComplete: value.matchComplete,
    controlledIndex: Number(value.controlledIndex),
    dictationIndex: Number(value.dictationIndex),
    controlledAttempts: value.controlledAttempts,
    controlledChecked: value.controlledChecked,
    sentenceAttempts: value.sentenceAttempts,
    checkedSentence: value.checkedSentence,
    guidedBindings: [...new Set(value.guidedBindings)],
    muted: value.muted,
    helpLevel: Number(value.helpLevel),
    reflectionText: value.reflectionText,
  };
  if (state.stage === "controlled" && state.controlledChecked[canonicalWordIds[state.controlledIndex]] === true) {
    if (state.controlledIndex < canonicalWordIds.length - 1) {
      state.controlledIndex += 1;
    } else {
      state.stage = "dictation";
      state.dictationIndex = 0;
    }
  }
  if (state.stage === "dictation" && state.checkedSentence) {
    state.checkedSentence = false;
    if (state.dictationIndex < canonicalWordIds.length - 1) {
      state.dictationIndex += 1;
    } else {
      state.stage = "reflect";
    }
  }
  return state;
}

export function morphologyResumeKey(assignmentId: string, contentVersion: string): string {
  return `adle:morphology-un:${assignmentId}:1:${contentVersion}`;
}

export function serialiseMorphologyResume<T>(contentVersion: string, state: T, now = Date.now()): string {
  return JSON.stringify({ savedAt: now, schemaVersion: 1, contentVersion, state } satisfies MorphologyResumeEnvelope<T>);
}

export function parseMorphologyResume<T>(raw: string | null, contentVersion: string, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MorphologyResumeEnvelope<T>>;
    if (parsed.schemaVersion !== 1 || parsed.contentVersion !== contentVersion || typeof parsed.savedAt !== "number" || now - parsed.savedAt > MORPHOLOGY_RESUME_TTL_MS || parsed.state === undefined) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function readMorphologyResume<T>(key: string, contentVersion: string, storage: Pick<Storage, "getItem"> = window.localStorage): T | null {
  try {
    return parseMorphologyResume<T>(storage.getItem(key), contentVersion);
  } catch {
    return null;
  }
}

export function writeMorphologyResume<T>(key: string, contentVersion: string, state: T, storage: Pick<Storage, "setItem"> = window.localStorage): boolean {
  try {
    storage.setItem(key, serialiseMorphologyResume(contentVersion, state));
    return true;
  } catch {
    return false;
  }
}

export function clearMorphologyResume(key: string, storage: Pick<Storage, "removeItem"> = window.localStorage): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
