export const DICTATION_TARGET_CONTEXT_POLICY_VERSION =
  "dictation_target_context_v1" as const;

export type DictationTokenEdit =
  | {
      kind: "substitution";
      expectedToken: string;
      attemptedToken: string;
      expectedTokenIndex: number;
      attemptedTokenIndex: number;
    }
  | {
      kind: "omission";
      expectedToken: string;
      expectedTokenIndex: number;
    }
  | {
      kind: "insertion";
      attemptedToken: string;
      attemptedTokenIndex: number;
    };

export interface DictationContextSlip {
  classification: "non_target_sentence_spelling";
  targetToken: false;
  edit: DictationTokenEdit;
}

export interface DictationSentenceAnalysisV1 {
  policyVersion: typeof DICTATION_TARGET_CONTEXT_POLICY_VERSION;
  targetExpectedToken: string;
  targetAttemptedToken?: string;
  targetCorrect: boolean;
  targetEdit?: DictationTokenEdit;
  contextSlips: DictationContextSlip[];
}

interface SentenceToken {
  surface: string;
  normalised: string;
  index: number;
}

type AlignmentStep =
  | { kind: "exact"; expected: SentenceToken; attempted: SentenceToken }
  | { kind: "substitution"; expected: SentenceToken; attempted: SentenceToken }
  | { kind: "omission"; expected: SentenceToken }
  | { kind: "insertion"; attempted: SentenceToken };

interface AlignmentCell {
  edits: number;
  targetPenalty: number;
  tieBreak: string;
  steps: AlignmentStep[];
}

/**
 * Dictation compares spelling tokens, not typography. Sentence-edge
 * punctuation and case are neutral; internal apostrophes and hyphens remain
 * part of the spelling token. Curly apostrophes are canonicalised first.
 */
function sentenceTokens(sentence: string): SentenceToken[] {
  return sentence
    .trim()
    .split(/\s+/u)
    .map((raw) => raw.replaceAll("’", "'").replaceAll("‘", "'"))
    .map((raw) => raw
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/[^\p{L}\p{N}]+$/u, ""))
    .filter(Boolean)
    .map((surface, index) => ({
      surface,
      normalised: surface.toLocaleLowerCase("en-GB"),
      index,
    }));
}

function better(left: AlignmentCell | undefined, right: AlignmentCell): AlignmentCell {
  if (!left) return right;
  if (right.edits !== left.edits) return right.edits < left.edits ? right : left;
  if (right.targetPenalty !== left.targetPenalty) {
    return right.targetPenalty < left.targetPenalty ? right : left;
  }
  return right.tieBreak < left.tieBreak ? right : left;
}

function alignTokens(
  expected: SentenceToken[],
  attempted: SentenceToken[],
  targetTokenIndex: number,
): AlignmentStep[] {
  const rows: Array<Array<AlignmentCell | undefined>> = Array.from(
    { length: expected.length + 1 },
    () => Array<AlignmentCell | undefined>(attempted.length + 1),
  );
  rows[0]![0] = { edits: 0, targetPenalty: 0, tieBreak: "", steps: [] };

  for (let expectedCount = 0; expectedCount <= expected.length; expectedCount += 1) {
    for (let attemptedCount = 0; attemptedCount <= attempted.length; attemptedCount += 1) {
      const current = rows[expectedCount]![attemptedCount];
      if (!current) continue;
      const expectedToken = expected[expectedCount];
      const attemptedToken = attempted[attemptedCount];

      if (expectedToken && attemptedToken) {
        const exact = expectedToken.normalised === attemptedToken.normalised;
        const step: AlignmentStep = exact
          ? { kind: "exact", expected: expectedToken, attempted: attemptedToken }
          : { kind: "substitution", expected: expectedToken, attempted: attemptedToken };
        const next: AlignmentCell = {
          edits: current.edits + (exact ? 0 : 1),
          targetPenalty:
            current.targetPenalty +
            (expectedToken.index === targetTokenIndex && !exact ? 1 : 0),
          tieBreak: `${current.tieBreak}${exact ? "0" : "1"}`,
          steps: [...current.steps, step],
        };
        rows[expectedCount + 1]![attemptedCount + 1] = better(
          rows[expectedCount + 1]![attemptedCount + 1],
          next,
        );
      }

      if (expectedToken) {
        const next: AlignmentCell = {
          edits: current.edits + 1,
          targetPenalty:
            current.targetPenalty +
            (expectedToken.index === targetTokenIndex ? 1 : 0),
          tieBreak: `${current.tieBreak}2`,
          steps: [...current.steps, { kind: "omission", expected: expectedToken }],
        };
        rows[expectedCount + 1]![attemptedCount] = better(
          rows[expectedCount + 1]![attemptedCount],
          next,
        );
      }

      if (attemptedToken) {
        const next: AlignmentCell = {
          edits: current.edits + 1,
          targetPenalty: current.targetPenalty,
          tieBreak: `${current.tieBreak}3`,
          steps: [...current.steps, { kind: "insertion", attempted: attemptedToken }],
        };
        rows[expectedCount]![attemptedCount + 1] = better(
          rows[expectedCount]![attemptedCount + 1],
          next,
        );
      }
    }
  }

  return rows[expected.length]![attempted.length]?.steps ?? [];
}

function editFromStep(step: Exclude<AlignmentStep, { kind: "exact" }>): DictationTokenEdit {
  if (step.kind === "substitution") {
    return {
      kind: step.kind,
      expectedToken: step.expected.surface,
      attemptedToken: step.attempted.surface,
      expectedTokenIndex: step.expected.index,
      attemptedTokenIndex: step.attempted.index,
    };
  }
  if (step.kind === "omission") {
    return {
      kind: step.kind,
      expectedToken: step.expected.surface,
      expectedTokenIndex: step.expected.index,
    };
  }
  return {
    kind: step.kind,
    attemptedToken: step.attempted.surface,
    attemptedTokenIndex: step.attempted.index,
  };
}

/**
 * Produces one deterministic target result plus reflection-only context
 * differences. The target result is the sole correctness input; context
 * slips never enter evidence, learning-item, scheduler, or reward decisions.
 */
export function analyseDictationSentence(
  expectedSentence: string,
  attemptedSentence: string,
  targetTokenIndex: number,
): DictationSentenceAnalysisV1 {
  const expected = sentenceTokens(expectedSentence);
  const attempted = sentenceTokens(attemptedSentence);
  const target = expected[targetTokenIndex];
  if (!target) {
    throw new Error("analyseDictationSentence: target token index is outside the expected sentence");
  }
  const steps = alignTokens(expected, attempted, targetTokenIndex);
  let targetAttemptedToken: string | undefined;
  let targetCorrect = false;
  let targetEdit: DictationTokenEdit | undefined;
  const contextSlips: DictationContextSlip[] = [];

  for (const step of steps) {
    if (step.kind === "exact") {
      if (step.expected.index === targetTokenIndex) {
        targetAttemptedToken = step.attempted.surface;
        targetCorrect = true;
      }
      continue;
    }
    const edit = editFromStep(step);
    if (
      (step.kind === "substitution" || step.kind === "omission") &&
      step.expected.index === targetTokenIndex
    ) {
      targetAttemptedToken = step.kind === "substitution"
        ? step.attempted.surface
        : undefined;
      targetEdit = edit;
      continue;
    }
    contextSlips.push({
      classification: "non_target_sentence_spelling",
      targetToken: false,
      edit,
    });
  }

  return {
    policyVersion: DICTATION_TARGET_CONTEXT_POLICY_VERSION,
    targetExpectedToken: target.surface,
    ...(targetAttemptedToken ? { targetAttemptedToken } : {}),
    targetCorrect,
    ...(targetEdit ? { targetEdit } : {}),
    contextSlips,
  };
}
