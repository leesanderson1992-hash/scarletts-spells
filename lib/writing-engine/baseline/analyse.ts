import { performance } from "node:perf_hooks";

import { extractAuthenticUseCandidates } from "../../adle/authentic-use";
import { detectMisspellings } from "../../spelling/detectMisspellings";
import { tokenizeText } from "../../spelling/tokenize";
import { adaptBaselineSource, anchorOccurrence, extractOccurrences, fingerprint, type BaselineSourceInput } from "./source";

export type BaselineExpectation = {
  fieldKey: string;
  start: number;
  end: number;
  observedText: string;
  expected: "misspelling" | "valid" | "contextual_misuse" | "uncertain";
  intendedWord?: string;
};

export type BaselineCase = {
  id: string;
  source: BaselineSourceInput;
  /** Sparse human labels. Unlabelled text must never be scored as correct. */
  expectations?: BaselineExpectation[];
};

export function analyseBaselineCase(input: BaselineCase) {
  const started = performance.now();
  if (!input.id?.trim()) throw new Error("Case id is required");
  const source = adaptBaselineSource(input.source);
  const fields = source.fields.map((field) => {
    const occurrences = extractOccurrences(source, field);
    const detections = field.selectedForBaseline ? detectMisspellings(field.rawText).map((detection) => ({
      occurrence: anchorOccurrence(source, field.key, detection.token.start, detection.token.end),
      suggestedWord: detection.correction,
      detectorScore: detection.confidence,
      scoreMeaning: "UNCALIBRATED_HEURISTIC" as const,
    })) : [];
    const legacyTokens = tokenizeText(field.rawText);
    const tokenisationDifferences = field.selectedForBaseline ? occurrences.filter((occurrence) => {
      const spellingMatches = legacyTokens.some((token) => token.start === occurrence.start && token.end === occurrence.end);
      const auParts = occurrence.observedText.toLowerCase().match(/[a-z]+/g) ?? [];
      return !spellingMatches || auParts.length !== 1 || auParts[0] !== occurrence.observedText.toLowerCase();
    }).map((occurrence) => ({
      occurrenceId: occurrence.id,
      observedText: occurrence.observedText,
      spellingTokens: legacyTokens.filter((token) => token.start < occurrence.end && token.end > occurrence.start).map((token) => token.raw),
      authenticUseTokens: occurrence.observedText.toLowerCase().match(/[a-z]+/g) ?? [],
    })) : [];
    return { ...field, occurrences, detections, tokenisationDifferences };
  });
  const detections = fields.flatMap((field) => field.detections);
  // Reproduce the pure piece-level extractor, including unique-token collapse
  // and whole-form exclusion. Its output is NOT qualified evidence.
  const legacyAuthenticUseTokens = extractAuthenticUseCandidates({
    childId: "offline-baseline",
    writingSampleId: "offline-baseline",
    sampleText: fields.filter((field) => field.selectedForBaseline).map((field) => field.rawText).join("\n\n"),
    occurredOn: "1970-01-01",
    flaggedMisspellings: detections.map((item) => item.occurrence.observedText),
  }).map((candidate) => candidate.observedWord);

  const labelled = (input.expectations ?? []).map((label) => {
    const occurrence = anchorOccurrence(source, label.fieldKey, label.start, label.end);
    if (occurrence.observedText !== label.observedText) throw new Error(`Label text does not match source in case ${input.id}`);
    if (!["misspelling", "valid", "contextual_misuse", "uncertain"].includes(label.expected)) throw new Error("Invalid expectation category");
    const selected = fields.find((field) => field.key === label.fieldKey)!.selectedForBaseline;
    const detection = detections.find((item) => item.occurrence.id === occurrence.id);
    const outcome = !selected ? "EXCLUDED_FIELD"
      : label.expected === "contextual_misuse" || label.expected === "uncertain" ? "NOT_ASSESSED"
      : label.expected === "valid" ? detection ? "FALSE_POSITIVE" : "NO_FALSE_POSITIVE"
      : !detection ? "MISSED_MISSPELLING"
      : label.intendedWord && detection.suggestedWord !== label.intendedWord ? "WRONG_SUGGESTION"
      : "DETECTED";
    return { ...label, occurrenceId: occurrence.id, suggestedWord: detection?.suggestedWord ?? null, outcome };
  });
  if (new Set(labelled.map((label) => label.occurrenceId)).size !== labelled.length) throw new Error("Duplicate labels for one source span");
  const selectedOccurrences = fields.filter((field) => field.selectedForBaseline).flatMap((field) => field.occurrences);
  return {
    caseId: input.id,
    analysisVersion: "writing-baseline-v1",
    inputFingerprint: fingerprint(input),
    source, fields, labelled,
    legacyAuthenticUseTokens,
    qualification: "NOT_QUALIFIED" as const,
    summary: {
      selectedFields: fields.filter((field) => field.selectedForBaseline).length,
      excludedFields: fields.filter((field) => !field.selectedForBaseline).length,
      occurrences: selectedOccurrences.length,
      detections: detections.length,
      occurrencesWithoutExactDetection: selectedOccurrences.filter((item) => !detections.some((d) => d.occurrence.id === item.id)).length,
      contextNotAssessed: selectedOccurrences.length,
      tokenisationDifferences: fields.reduce((sum, field) => sum + field.tokenisationDifferences.length, 0),
      labelledMisses: labelled.filter((label) => label.outcome === "MISSED_MISSPELLING").length,
      labelledWrongSuggestions: labelled.filter((label) => label.outcome === "WRONG_SUGGESTION").length,
      labelledFalsePositives: labelled.filter((label) => label.outcome === "FALSE_POSITIVE").length,
      aiCalls: 0,
      qualifiedEvents: 0,
      processingMs: performance.now() - started,
    },
  };
}

export function runBaseline(cases: BaselineCase[]) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("Expected a non-empty case array");
  if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Duplicate case ids");
  return cases.map(analyseBaselineCase);
}
