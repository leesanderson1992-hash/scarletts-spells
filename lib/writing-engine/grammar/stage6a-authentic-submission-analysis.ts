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

type WritingEngineStage6aSupportedRule =
  | "standalone_lowercase_i"
  | "repeated_internal_spacing";

type WritingEngineStage6aUnsupportedReason =
  | "requires_undocumented_taxonomy_truth"
  | "requires_broad_proofreading_ownership";

type WritingEngineStage6aCandidateDomainModule = "grammar" | "proofreading";

export type WritingEngineStage6aGrammarProofreadingAnalysisInput = {
  taskSubmission: WritingEngineStage3TaskSubmission;
  writingSample?: WritingEngineStage3WritingSample | null;
};

export type WritingEngineStage6aGrammarProofreadingCandidate = {
  status: "candidate";
  sourceType: "authentic_writing";
  domainModule: WritingEngineStage6aCandidateDomainModule;
  rule: WritingEngineStage6aSupportedRule;
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  targetText: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  candidateHypothesis: WritingEngineCandidateHypothesis;
};

export type WritingEngineStage6aGrammarProofreadingUnresolvedResult = {
  status: "unresolved";
  sourceType: "authentic_writing";
  domainModule: WritingEngineStage6aCandidateDomainModule;
  reason: WritingEngineStage6aUnsupportedReason;
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  targetText: null;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  notes: string;
};

export type WritingEngineStage6aGrammarProofreadingResult =
  | WritingEngineStage6aGrammarProofreadingCandidate
  | WritingEngineStage6aGrammarProofreadingUnresolvedResult;

export type WritingEngineStage6aGrammarProofreadingAnalysisResult = {
  sourceType: "authentic_writing";
  normalization: WritingEngineAuthenticSubmissionNormalization;
  results: WritingEngineStage6aGrammarProofreadingResult[];
};

function isWordLike(char: string | undefined) {
  return typeof char === "string" && /[A-Za-z0-9]/.test(char);
}

function isLowercaseLetter(char: string | undefined) {
  return typeof char === "string" && /^[a-z]$/.test(char);
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
  domainModule: WritingEngineStage6aCandidateDomainModule;
  observedText: string;
  targetText: string | null;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  rule?: WritingEngineStage6aSupportedRule;
  reason?: WritingEngineStage6aUnsupportedReason;
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
    stage6aAnalysisStatus: input.status,
    stage6aDomainModule: input.domainModule,
    stage6aRule: input.rule ?? null,
    stage6aReason: input.reason ?? null,
  } satisfies WritingEngineSourceMetadata;
}

function buildCandidateNotes(input: {
  domainModule: WritingEngineStage6aCandidateDomainModule;
  rule: WritingEngineStage6aSupportedRule;
  observedText: string;
  targetText: string;
}) {
  switch (input.rule) {
    case "standalone_lowercase_i":
      return `Stage 6A grammar analysis suggested capitalizing the standalone pronoun by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
    case "repeated_internal_spacing":
      return `Stage 6A proofreading analysis suggested collapsing repeated internal spacing by changing "${input.observedText}" to "${input.targetText}". Category, mini-skill, and template remain unresolved in this bounded pass.`;
  }
}

function buildCandidateResult(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  domainModule: WritingEngineStage6aCandidateDomainModule;
  rule: WritingEngineStage6aSupportedRule;
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
    domainModule: input.domainModule,
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
    domainModule: input.domainModule,
    suggestedCategoryCode: null,
    suggestedMicroSkillKey: null,
    suggestedTemplateKey: null,
    confidence: normalizeConfidence(input.confidence),
    notes: buildCandidateNotes({
      domainModule: input.domainModule,
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
    domainModule: input.domainModule,
    rule: input.rule,
    sourceRef,
    observedText: input.observedText,
    targetText: input.targetText,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    candidateHypothesis,
  } satisfies WritingEngineStage6aGrammarProofreadingCandidate;
}

function buildUnresolvedResult(input: {
  normalization: WritingEngineAuthenticSubmissionNormalization;
  domainModule: WritingEngineStage6aCandidateDomainModule;
  reason: WritingEngineStage6aUnsupportedReason;
  observedText: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  notes: string;
}) {
  const metadata = buildMetadata({
    normalization: input.normalization,
    status: "unresolved",
    domainModule: input.domainModule,
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
    domainModule: input.domainModule,
    reason: input.reason,
    sourceRef,
    observedText: input.observedText,
    targetText: null,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    notes: input.notes,
  } satisfies WritingEngineStage6aGrammarProofreadingUnresolvedResult;
}

function detectStandaloneLowercasePronounI(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage6aGrammarProofreadingCandidate[] = [];
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
        buildCandidateResult({
          normalization,
          domainModule: "grammar",
          rule: "standalone_lowercase_i",
          observedText: match[0],
          targetText: "I",
          contextText: buildContextText(text, match.index, match.index + 1),
          positionStart: match.index,
          positionEnd: match.index + 1,
          confidence: 0.98,
        }),
      );
    }

    match = lowercasePronounPattern.exec(text);
  }

  return results;
}

function detectRepeatedInternalSpacing(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage6aGrammarProofreadingCandidate[] = [];
  const repeatedSpacingPattern = /\b([A-Za-z0-9']+)( {2,})([A-Za-z0-9']+)\b/g;
  let match: RegExpExecArray | null = repeatedSpacingPattern.exec(text);

  while (match) {
    const observedText = match[0];
    const targetText = `${match[1]} ${match[3]}`;
    const positionStart = match.index;
    const positionEnd = match.index + observedText.length;

    results.push(
      buildCandidateResult({
        normalization,
        domainModule: "proofreading",
        rule: "repeated_internal_spacing",
        observedText,
        targetText,
        contextText: buildContextText(text, positionStart, positionEnd),
        positionStart,
        positionEnd,
        confidence: 0.99,
      }),
    );

    match = repeatedSpacingPattern.exec(text);
  }

  return results;
}

function detectUndocumentedGrammarTaxonomyCases(
  text: string,
  normalization: WritingEngineAuthenticSubmissionNormalization,
) {
  const results: WritingEngineStage6aGrammarProofreadingUnresolvedResult[] = [];
  const articleChoicePattern = /\b(a [aeiou][a-z']*|an [bcdfghjklmnpqrstvwxyz][a-z']*)\b/gi;
  let match: RegExpExecArray | null = articleChoicePattern.exec(text);

  while (match) {
    results.push(
      buildUnresolvedResult({
        normalization,
        domainModule: "grammar",
        reason: "requires_undocumented_taxonomy_truth",
        observedText: match[0],
        contextText: buildContextText(
          text,
          match.index,
          match.index + match[0].length,
        ),
        positionStart: match.index,
        positionEnd: match.index + match[0].length,
        notes:
          "Stage 6A detected an article-choice pattern that would require undocumented grammar taxonomy truth outside this bounded pass.",
      }),
    );

    match = articleChoicePattern.exec(text);
  }

  return results;
}

function detectBroadProofreadingCases(
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
        domainModule: "proofreading",
        reason: "requires_broad_proofreading_ownership",
        observedText: "\"",
        contextText: buildContextText(text, unmatchedIndex, unmatchedIndex + 1),
        positionStart: unmatchedIndex,
        positionEnd: unmatchedIndex + 1,
        notes:
          "Stage 6A detected a quotation-mark pattern that would require broad proofreading ownership outside this bounded pass.",
      }),
    ];
  }

  return [];
}

function sortResults(results: WritingEngineStage6aGrammarProofreadingResult[]) {
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

    if (left.domainModule !== right.domainModule) {
      return left.domainModule.localeCompare(right.domainModule);
    }

    const leftKey = left.status === "candidate" ? left.rule : left.reason;
    const rightKey = right.status === "candidate" ? right.rule : right.reason;

    return leftKey.localeCompare(rightKey);
  });
}

export function analyzeStage6aAuthenticSubmissionGrammarProofreading(
  input: WritingEngineStage6aGrammarProofreadingAnalysisInput,
): WritingEngineStage6aGrammarProofreadingAnalysisResult {
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
    ...detectStandaloneLowercasePronounI(analysisText, normalization),
    ...detectRepeatedInternalSpacing(analysisText, normalization),
    ...detectUndocumentedGrammarTaxonomyCases(analysisText, normalization),
    ...detectBroadProofreadingCases(analysisText, normalization),
  ]);

  return {
    sourceType: "authentic_writing",
    normalization,
    results,
  };
}
