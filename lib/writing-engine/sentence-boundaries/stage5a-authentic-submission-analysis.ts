import type {
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineSourceRef,
  WritingEngineStage3TaskSubmission,
  WritingEngineStage3WritingSample,
} from "../types";
import {
  buildAuthenticWritingSourceRef,
  normalizeAuthenticWritingSubmissionSource,
  type WritingEngineAuthenticSubmissionNormalization,
} from "../analysis/authentic-submission";

type WritingEngineStage5aSupportedSentenceBoundaryRule =
  | "missing_terminal_punctuation"
  | "missing_space_after_sentence_end"
  | "sentence_start_not_capitalized";

type WritingEngineStage5aUnsupportedReason =
  | "unsupported_sentence_boundary_pattern"
  | "requires_grammar_semantics"
  | "requires_proofreading_semantics";

export type WritingEngineStage5aSentenceBoundaryAnalysisInput = {
  taskSubmission: WritingEngineStage3TaskSubmission;
  writingSample?: WritingEngineStage3WritingSample | null;
};

export type WritingEngineStage5aSentenceBoundaryCandidate = {
  status: "candidate";
  sourceType: "authentic_writing";
  rule: WritingEngineStage5aSupportedSentenceBoundaryRule;
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  targetText: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  candidateHypothesis: WritingEngineCandidateHypothesis;
};

export type WritingEngineStage5aSentenceBoundaryUnresolvedResult = {
  status: "unresolved";
  sourceType: "authentic_writing";
  reason: WritingEngineStage5aUnsupportedReason;
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  targetText: null;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  notes: string;
};

export type WritingEngineStage5aSentenceBoundaryResult =
  | WritingEngineStage5aSentenceBoundaryCandidate
  | WritingEngineStage5aSentenceBoundaryUnresolvedResult;

export type WritingEngineStage5aSentenceBoundaryAnalysisResult = {
  sourceType: "authentic_writing";
  normalization: WritingEngineAuthenticSubmissionNormalization;
  results: WritingEngineStage5aSentenceBoundaryResult[];
};

const SENTENCE_END_MARKS = new Set([".", "!", "?"]);

function isWordLike(char: string | undefined) {
  return typeof char === "string" && /[A-Za-z0-9]/.test(char);
}

function isLowercaseLetter(char: string | undefined) {
  return typeof char === "string" && /^[a-z]$/.test(char);
}

function isUppercaseLetter(char: string | undefined) {
  return typeof char === "string" && /^[A-Z]$/.test(char);
}

function normalizeConfidence(confidence: number) {
  return Math.min(1, Math.max(0, Number(confidence.toFixed(2))));
}

function buildContextText(text: string, start: number, end: number) {
  const snippetStart = Math.max(0, start - 18);
  const snippetEnd = Math.min(text.length, end + 18);
  return text.slice(snippetStart, snippetEnd).trim();
}

function buildMetadata(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  status: "candidate" | "unresolved";
  observedText: string;
  targetText: string | null;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  rule?: WritingEngineStage5aSupportedSentenceBoundaryRule;
  reason?: WritingEngineStage5aUnsupportedReason;
}) {
  return {
    taskSubmissionId: input.normalization.taskSubmissionId,
    writingSampleId: input.normalization.writingSampleId,
    sourceTextOrigin: input.normalization.sourceTextOrigin,
    sourceSpan: {
      positionStart: input.positionStart,
      positionEnd: input.positionEnd,
    },
    targetText: input.targetText,
    childAttemptText: input.observedText,
    contextText: input.contextText,
    sentenceBoundaryAnalysisStatus: input.status,
    sentenceBoundaryRule: input.rule ?? null,
    sentenceBoundaryReason: input.reason ?? null,
  } satisfies WritingEngineSourceMetadata;
}

function buildCandidateNotes(input: {
  rule: WritingEngineStage5aSupportedSentenceBoundaryRule;
  observedText: string;
  targetText: string;
}) {
  switch (input.rule) {
    case "missing_terminal_punctuation":
      return `Stage 5A sentence-boundary analysis suggested adding sentence-ending punctuation by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
    case "missing_space_after_sentence_end":
      return `Stage 5A sentence-boundary analysis suggested adding spacing after a sentence-ending mark by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
    case "sentence_start_not_capitalized":
      return `Stage 5A sentence-boundary analysis suggested capitalizing the start of a sentence by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
  }
}

function buildCandidateResult(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  rule: WritingEngineStage5aSupportedSentenceBoundaryRule;
  observedText: string;
  targetText: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  confidence: number;
}) {
  const metadata = buildMetadata({
    normalization: input.normalization,
    status: "candidate",
    observedText: input.observedText,
    targetText: input.targetText,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    rule: input.rule,
  });

  const sourceRef = buildAuthenticWritingSourceRef({
    normalization: input.normalization,
    observedText: input.observedText,
    targetText: input.targetText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    metadata,
  });

  const candidateHypothesis = {
    domainModule: "sentence_boundaries",
    suggestedCategoryCode: null,
    suggestedMicroSkillKey: null,
    suggestedTemplateKey: null,
    confidence: normalizeConfidence(input.confidence),
    notes: buildCandidateNotes({
      rule: input.rule,
      observedText: input.observedText,
      targetText: input.targetText,
    }),
    sourceRef,
    metadata,
  } satisfies WritingEngineCandidateHypothesis;

  return {
    status: "candidate" as const,
    sourceType: "authentic_writing" as const,
    rule: input.rule,
    sourceRef,
    observedText: input.observedText,
    targetText: input.targetText,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    candidateHypothesis,
  } satisfies WritingEngineStage5aSentenceBoundaryCandidate;
}

function buildUnresolvedResult(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  reason: WritingEngineStage5aUnsupportedReason;
  observedText: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  notes: string;
}) {
  const metadata = buildMetadata({
    normalization: input.normalization,
    status: "unresolved",
    observedText: input.observedText,
    targetText: null,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    reason: input.reason,
  });

  const sourceRef = buildAuthenticWritingSourceRef({
    normalization: input.normalization,
    observedText: input.observedText,
    targetText: null,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    metadata,
  });

  return {
    status: "unresolved" as const,
    sourceType: "authentic_writing" as const,
    reason: input.reason,
    sourceRef,
    observedText: input.observedText,
    targetText: null,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    notes: input.notes,
  } satisfies WritingEngineStage5aSentenceBoundaryUnresolvedResult;
}

function detectMissingTerminalPunctuation(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const trimmed = text.trimEnd();

  if (!trimmed) {
    return [];
  }

  const lastIndex = trimmed.length - 1;
  const lastChar = trimmed[lastIndex];

  if (!isWordLike(lastChar)) {
    return [];
  }

  let start = lastIndex;
  while (start > 0 && isWordLike(trimmed[start - 1])) {
    start -= 1;
  }

  const observedText = trimmed.slice(start, lastIndex + 1);

  return [
    buildCandidateResult({
      normalization,
      rule: "missing_terminal_punctuation",
      observedText,
      targetText: `${observedText}.`,
      contextText: buildContextText(trimmed, start, lastIndex + 1),
      positionStart: start,
      positionEnd: lastIndex + 1,
      confidence: 0.93,
    }),
  ];
}

function detectMissingSpaceAfterSentenceEnd(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage5aSentenceBoundaryCandidate[] = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (!SENTENCE_END_MARKS.has(char)) {
      continue;
    }

    if (!isWordLike(text[index - 1]) || !isWordLike(nextChar)) {
      continue;
    }

    results.push(
      buildCandidateResult({
        normalization,
        rule: "missing_space_after_sentence_end",
        observedText: `${char}${nextChar}`,
        targetText: `${char} ${nextChar}`,
        contextText: buildContextText(text, index, index + 2),
        positionStart: index,
        positionEnd: index + 2,
        confidence: 0.97,
      }),
    );
  }

  return results;
}

function detectSentenceStartNotCapitalized(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage5aSentenceBoundaryCandidate[] = [];

  let index = 0;
  while (index < text.length && /\s/.test(text[index] ?? "")) {
    index += 1;
  }

  if (isLowercaseLetter(text[index])) {
    const observedText = text[index];
    results.push(
      buildCandidateResult({
        normalization,
        rule: "sentence_start_not_capitalized",
        observedText,
        targetText: observedText.toUpperCase(),
        contextText: buildContextText(text, index, index + 1),
        positionStart: index,
        positionEnd: index + 1,
        confidence: 0.91,
      }),
    );
  }

  for (let cursor = 0; cursor < text.length - 1; cursor += 1) {
    if (!SENTENCE_END_MARKS.has(text[cursor])) {
      continue;
    }

    let nextIndex = cursor + 1;
    while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
      nextIndex += 1;
    }

    if (!isLowercaseLetter(text[nextIndex])) {
      continue;
    }

    const observedText = text[nextIndex];
    results.push(
      buildCandidateResult({
        normalization,
        rule: "sentence_start_not_capitalized",
        observedText,
        targetText: observedText.toUpperCase(),
        contextText: buildContextText(text, nextIndex, nextIndex + 1),
        positionStart: nextIndex,
        positionEnd: nextIndex + 1,
        confidence: 0.9,
      }),
    );
  }

  return results;
}

function detectGrammarDependentCases(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage5aSentenceBoundaryUnresolvedResult[] = [];
  const lowercasePronounPattern = /\bi\b/g;
  let match: RegExpExecArray | null = lowercasePronounPattern.exec(text);

  while (match) {
    const previousChar = match.index > 0 ? text[match.index - 1] : undefined;
    const nextChar =
      match.index + match[0].length < text.length
        ? text[match.index + match[0].length]
        : undefined;

    if (
      (previousChar === undefined || /\s/.test(previousChar)) &&
      (nextChar === undefined || /\s|[.!?,;:]/.test(nextChar))
    ) {
      results.push(
        buildUnresolvedResult({
          normalization,
          reason: "requires_grammar_semantics",
          observedText: match[0],
          contextText: buildContextText(text, match.index, match.index + 1),
          positionStart: match.index,
          positionEnd: match.index + 1,
          notes:
            "Stage 5A detected a sentence-start or standalone lowercase pronoun that may require grammar semantics outside the bounded sentence-boundary contract.",
        }),
      );
    }

    match = lowercasePronounPattern.exec(text);
  }

  return results;
}

function detectProofreadingDependentCases(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const quoteIndexes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\"") {
      quoteIndexes.push(index);
    }
  }

  if (quoteIndexes.length > 0 && quoteIndexes.length % 2 !== 0) {
    const unmatchedIndex = quoteIndexes[quoteIndexes.length - 1];
    return [
      buildUnresolvedResult({
        normalization,
        reason: "requires_proofreading_semantics",
        observedText: "\"",
        contextText: buildContextText(text, unmatchedIndex, unmatchedIndex + 1),
        positionStart: unmatchedIndex,
        positionEnd: unmatchedIndex + 1,
        notes:
          "Stage 5A detected a quotation-mark pattern that would require broad proofreading ownership outside the bounded sentence-boundary contract.",
      }),
    ];
  }

  return [];
}

function detectUnsupportedSentenceBoundaryPatterns(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage5aSentenceBoundaryUnresolvedResult[] = [];
  const ellipsisPattern = /\.{3,}/g;
  let match: RegExpExecArray | null = ellipsisPattern.exec(text);

  while (match) {
    results.push(
      buildUnresolvedResult({
        normalization,
        reason: "unsupported_sentence_boundary_pattern",
        observedText: match[0],
        contextText: buildContextText(
          text,
          match.index,
          match.index + match[0].length,
        ),
        positionStart: match.index,
        positionEnd: match.index + match[0].length,
        notes:
          "Stage 5A detected an unsupported sentence-boundary pattern. This bounded pass does not classify ellipsis or repeated-terminal-punctuation structure.",
      }),
    );

    match = ellipsisPattern.exec(text);
  }

  return results;
}

function sortResults(results: WritingEngineStage5aSentenceBoundaryResult[]) {
  return [...results].sort((left, right) => {
    if (left.positionStart !== right.positionStart) {
      return left.positionStart - right.positionStart;
    }

    if (left.positionEnd !== right.positionEnd) {
      return left.positionEnd - right.positionEnd;
    }

    if (left.status !== right.status) {
      return left.status.localeCompare(right.status);
    }

    const leftKey = left.status === "candidate" ? left.rule : left.reason;
    const rightKey = right.status === "candidate" ? right.rule : right.reason;

    return leftKey.localeCompare(rightKey);
  });
}

export function analyzeStage5aAuthenticSubmissionSentenceBoundaries(
  input: WritingEngineStage5aSentenceBoundaryAnalysisInput,
): WritingEngineStage5aSentenceBoundaryAnalysisResult {
  const normalization = normalizeAuthenticWritingSubmissionSource({
    taskSubmission: input.taskSubmission,
    writingSample: input.writingSample,
  });

  if (!normalization.analysisText) {
    return {
      sourceType: "authentic_writing",
      normalization,
      results: [],
    };
  }

  const analysisText = normalization.analysisText;
  const results = sortResults([
    ...detectSentenceStartNotCapitalized(analysisText, normalization),
    ...detectMissingSpaceAfterSentenceEnd(analysisText, normalization),
    ...detectMissingTerminalPunctuation(analysisText, normalization),
    ...detectGrammarDependentCases(analysisText, normalization),
    ...detectProofreadingDependentCases(analysisText, normalization),
    ...detectUnsupportedSentenceBoundaryPatterns(analysisText, normalization),
  ]);

  return {
    sourceType: "authentic_writing",
    normalization,
    results,
  };
}
