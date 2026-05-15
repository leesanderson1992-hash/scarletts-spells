import type {
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineSourceRef,
  WritingEngineStage1d1CatalogEntry,
  WritingEngineStage3TaskSubmission,
  WritingEngineStage3WritingSample,
} from "../types";
import {
  buildAuthenticWritingSourceRef,
  normalizeAuthenticWritingSubmissionSource,
  type WritingEngineAuthenticSubmissionNormalization,
} from "../analysis/authentic-submission";

type WritingEngineStage4aSupportedPunctuationRule =
  | "space_before_punctuation"
  | "missing_space_after_punctuation";

type WritingEngineStage4aUnsupportedReason =
  | "unsupported_punctuation_pattern"
  | "requires_sentence_boundary_semantics"
  | "requires_grammar_semantics";

export type WritingEngineStage4aPunctuationAnalysisInput = {
  taskSubmission: WritingEngineStage3TaskSubmission;
  writingSample?: WritingEngineStage3WritingSample | null;
  catalogEntries?: WritingEngineStage1d1CatalogEntry[];
};

export type WritingEngineStage4aPunctuationCandidate = {
  status: "candidate";
  sourceType: "authentic_writing";
  rule: WritingEngineStage4aSupportedPunctuationRule;
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  targetText: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  candidateHypothesis: WritingEngineCandidateHypothesis;
};

export type WritingEngineStage4aPunctuationUnresolvedResult = {
  status: "unresolved";
  sourceType: "authentic_writing";
  reason: WritingEngineStage4aUnsupportedReason;
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  targetText: null;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  notes: string;
};

export type WritingEngineStage4aPunctuationResult =
  | WritingEngineStage4aPunctuationCandidate
  | WritingEngineStage4aPunctuationUnresolvedResult;

export type WritingEngineStage4aPunctuationAnalysisResult = {
  sourceType: "authentic_writing";
  normalization: WritingEngineAuthenticSubmissionNormalization;
  results: WritingEngineStage4aPunctuationResult[];
};

const SPACE_BEFORE_PUNCTUATION_MARKS = new Set([",", ".", "!", "?", ";", ":"]);
const INLINE_SPACE_AFTER_MARKS = new Set([",", ";", ":"]);
const SENTENCE_BOUNDARY_MARKS = new Set([".", "!", "?"]);
const COMMON_APOSTROPHE_WORDS = new Set([
  "arent",
  "cant",
  "couldnt",
  "didnt",
  "doesnt",
  "dont",
  "hadnt",
  "hasnt",
  "havent",
  "hes",
  "heres",
  "ill",
  "im",
  "isnt",
  "its",
  "ive",
  "shes",
  "shouldnt",
  "thats",
  "theres",
  "theyre",
  "theyve",
  "wasnt",
  "were",
  "werent",
  "whats",
  "wont",
  "wouldnt",
  "youre",
  "youve",
]);

function isWordLike(char: string | undefined) {
  return typeof char === "string" && /[A-Za-z0-9]/.test(char);
}

function normalizeConfidence(confidence: number) {
  return Math.min(1, Math.max(0, Number(confidence.toFixed(2))));
}

function buildContextText(text: string, start: number, end: number) {
  const snippetStart = Math.max(0, start - 12);
  const snippetEnd = Math.min(text.length, end + 12);
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
  rule?: WritingEngineStage4aSupportedPunctuationRule;
  reason?: WritingEngineStage4aUnsupportedReason;
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
    punctuationAnalysisStatus: input.status,
    punctuationRule: input.rule ?? null,
    punctuationReason: input.reason ?? null,
  } satisfies WritingEngineSourceMetadata;
}

function buildCandidateNotes(input: {
  rule: WritingEngineStage4aSupportedPunctuationRule;
  observedText: string;
  targetText: string;
}) {
  switch (input.rule) {
    case "space_before_punctuation":
      return `Stage 4A punctuation analysis suggested removing spacing before punctuation by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
    case "missing_space_after_punctuation":
      return `Stage 4A punctuation analysis suggested adding spacing after punctuation by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
  }
}

function buildCandidateResult(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  rule: WritingEngineStage4aSupportedPunctuationRule;
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
    domainModule: "punctuation",
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
  } satisfies WritingEngineStage4aPunctuationCandidate;
}

function buildUnresolvedResult(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  reason: WritingEngineStage4aUnsupportedReason;
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
  } satisfies WritingEngineStage4aPunctuationUnresolvedResult;
}

function detectSpaceBeforePunctuation(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage4aPunctuationCandidate[] = [];

  for (let index = 1; index < text.length; index += 1) {
    const char = text[index];

    if (!SPACE_BEFORE_PUNCTUATION_MARKS.has(char)) {
      continue;
    }

    const previousChar = text[index - 1];
    if (!/\s/.test(previousChar)) {
      continue;
    }

    let start = index - 1;
    while (start > 0 && /\s/.test(text[start - 1])) {
      start -= 1;
    }

    if (!isWordLike(text[start - 1])) {
      continue;
    }

    const observedText = text.slice(start, index + 1);
    results.push(
      buildCandidateResult({
        normalization,
        rule: "space_before_punctuation",
        observedText,
        targetText: char,
        contextText: buildContextText(text, start, index + 1),
        positionStart: start,
        positionEnd: index + 1,
        confidence: 0.98,
      }),
    );
  }

  return results;
}

function detectMissingInlineSpaceAfterPunctuation(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage4aPunctuationCandidate[] = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    const char = text[index];
    if (!INLINE_SPACE_AFTER_MARKS.has(char)) {
      continue;
    }

    if (!isWordLike(text[index - 1]) || !isWordLike(text[index + 1])) {
      continue;
    }

    results.push(
      buildCandidateResult({
        normalization,
        rule: "missing_space_after_punctuation",
        observedText: char,
        targetText: `${char} `,
        contextText: buildContextText(text, index, index + 1),
        positionStart: index,
        positionEnd: index + 1,
        confidence: 0.96,
      }),
    );
  }

  return results;
}

function detectSentenceBoundaryDependentCases(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage4aPunctuationUnresolvedResult[] = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    const char = text[index];

    if (!SENTENCE_BOUNDARY_MARKS.has(char)) {
      continue;
    }

    if (!isWordLike(text[index - 1]) || !isWordLike(text[index + 1])) {
      continue;
    }

    results.push(
      buildUnresolvedResult({
        normalization,
        reason: "requires_sentence_boundary_semantics",
        observedText: char,
        contextText: buildContextText(text, index, index + 1),
        positionStart: index,
        positionEnd: index + 1,
        notes:
          "Stage 4A detected punctuation that may act as a sentence boundary, but resolving it would require sentence-boundary semantics outside the punctuation-only contract.",
      }),
    );
  }

  const trimmed = text.trimEnd();
  const lastIndex = trimmed.length - 1;
  const lastChar = lastIndex >= 0 ? trimmed[lastIndex] : "";

  if (isWordLike(lastChar)) {
    let start = lastIndex;
    while (start > 0 && isWordLike(trimmed[start - 1])) {
      start -= 1;
    }

    results.push(
      buildUnresolvedResult({
        normalization,
        reason: "requires_sentence_boundary_semantics",
        observedText: trimmed.slice(start, lastIndex + 1),
        contextText: buildContextText(trimmed, start, lastIndex + 1),
        positionStart: start,
        positionEnd: lastIndex + 1,
        notes:
          "Stage 4A detected writing that may be missing sentence-ending punctuation, but confirming that would require sentence-boundary semantics outside the punctuation-only contract.",
      }),
    );
  }

  return results;
}

function detectGrammarDependentApostropheCases(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage4aPunctuationUnresolvedResult[] = [];
  const wordPattern = /\b[A-Za-z]+\b/g;
  let match: RegExpExecArray | null = wordPattern.exec(text);

  while (match) {
    const observedWord = match[0];
    const normalizedWord = observedWord.toLowerCase();

    if (COMMON_APOSTROPHE_WORDS.has(normalizedWord)) {
      results.push(
        buildUnresolvedResult({
          normalization,
          reason: "requires_grammar_semantics",
          observedText: observedWord,
          contextText: buildContextText(
            text,
            match.index,
            match.index + observedWord.length,
          ),
          positionStart: match.index,
          positionEnd: match.index + observedWord.length,
          notes:
            "Stage 4A detected punctuation that may require apostrophe handling, but resolving it would require grammar or usage semantics outside the punctuation-only contract.",
        }),
      );
    }

    match = wordPattern.exec(text);
  }

  return results;
}

function detectUnsupportedQuoteCases(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const quoteIndexes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\"") {
      quoteIndexes.push(index);
    }
  }

  if (quoteIndexes.length === 0 || quoteIndexes.length % 2 === 0) {
    return [];
  }

  const unmatchedIndex = quoteIndexes[quoteIndexes.length - 1];

  return [
    buildUnresolvedResult({
      normalization,
      reason: "unsupported_punctuation_pattern",
      observedText: "\"",
      contextText: buildContextText(text, unmatchedIndex, unmatchedIndex + 1),
      positionStart: unmatchedIndex,
      positionEnd: unmatchedIndex + 1,
      notes:
        "Stage 4A detected an unsupported quotation-mark pattern. This bounded pass does not classify quotation-structure issues.",
    }),
  ];
}

function sortResults(
  results: WritingEngineStage4aPunctuationResult[],
) {
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

    const leftKey =
      left.status === "candidate"
        ? left.rule
        : left.reason;
    const rightKey =
      right.status === "candidate"
        ? right.rule
        : right.reason;

    return leftKey.localeCompare(rightKey);
  });
}

export function analyzeStage4aAuthenticSubmissionPunctuation(
  input: WritingEngineStage4aPunctuationAnalysisInput,
): WritingEngineStage4aPunctuationAnalysisResult {
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
    ...detectSpaceBeforePunctuation(analysisText, normalization),
    ...detectMissingInlineSpaceAfterPunctuation(analysisText, normalization),
    ...detectSentenceBoundaryDependentCases(analysisText, normalization),
    ...detectGrammarDependentApostropheCases(analysisText, normalization),
    ...detectUnsupportedQuoteCases(analysisText, normalization),
  ]);

  return {
    sourceType: "authentic_writing",
    normalization,
    results,
  };
}
