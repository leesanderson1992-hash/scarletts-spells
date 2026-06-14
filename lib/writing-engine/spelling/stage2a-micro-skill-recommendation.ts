import type { WritingEngineStage1d1CatalogEntry } from "../types";

export const WRITING_ENGINE_STAGE2A_RECOMMENDATION_STATUSES = [
  "recommended",
  "low_confidence",
  "no_matching_skill_candidate",
  "word_level_only_candidate",
  "likely_false_positive",
  "conflict",
  "insufficient_evidence",
] as const;

export type WritingEngineStage2aRecommendationStatus =
  (typeof WRITING_ENGINE_STAGE2A_RECOMMENDATION_STATUSES)[number];

export type WritingEngineStage2aConfidenceLevel =
  | "high"
  | "medium"
  | "low"
  | "none";

export type WritingEngineStage2aRecommendationAuthority =
  | "known_match"
  | "your_match"
  | "possible_match"
  | "no_match_yet"
  | "check_manually"
  | "none";

export type WritingEngineStage2aSourceSignalType =
  | "exact_active_canonical_mapping"
  | "same_scope_parent_local_promoted_mapping"
  | "correction_word_pattern_support"
  | "deterministic_spelling_difference"
  | "active_assignable_d4_micro_skill_metadata"
  | "historical_reviewed_evidence"
  | "slice1_audit_frequency"
  | "canonical_word_map_metadata";

export type WritingEngineStage2aFallbackReason =
  | "missing_spelling_pair"
  | "no_active_assignable_d4_candidates"
  | "low_confidence"
  | "low_margin"
  | "conflicting_candidates"
  | "word_level_only"
  | "likely_false_positive"
  | "insufficient_evidence"
  | null;

export type WritingEngineStage2aSourceSignal = {
  type: WritingEngineStage2aSourceSignalType;
  microSkillKey: string | null;
  weight: number;
  reason: string;
  sourceRef?: string | null;
};

export type WritingEngineStage2aRankedMicroSkillCandidate = {
  microSkillKey: string;
  familyKey: string;
  clusterKey: string | null;
  displayName: string;
  score: number;
  confidence: WritingEngineStage2aConfidenceLevel;
  confidencePercent: number;
  reason: string;
  sourceSignals: WritingEngineStage2aSourceSignal[];
};

export type WritingEngineStage2aRecommendationResult = {
  recommendationStatus: WritingEngineStage2aRecommendationStatus;
  recommendationAuthority: WritingEngineStage2aRecommendationAuthority;
  recommendedFamilyKey: string | null;
  recommendedClusterKey: string | null;
  recommendedMicroSkillKey: string | null;
  rankedMicroSkillCandidates: WritingEngineStage2aRankedMicroSkillCandidate[];
  confidence: WritingEngineStage2aConfidenceLevel;
  confidencePercent: number;
  reason: string;
  sourceSignals: WritingEngineStage2aSourceSignal[];
  fallbackReason: WritingEngineStage2aFallbackReason;
  isPrefillAllowed: boolean;
};

export type WritingEngineStage2aCanonicalMappingSignal = {
  mappingId?: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  mappingStatus: "active" | string;
};

export type WritingEngineStage2aParentLocalPromotedMappingSignal = {
  mappingId?: string | null;
  parentUserId: string;
  childId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  candidateStatus: "parent_local_promoted" | string;
  promotionScope: "parent_local" | "child_local" | string;
};

export type WritingEngineStage2aReviewedEvidenceSignal = {
  sourceId?: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  finalClassification?: string | null;
  reviewStatus?: string | null;
};

export type WritingEngineStage2aAuditFrequencySignal = {
  sourceId?: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  evidenceCount: number;
};

export type WritingEngineStage2aWordMapMetadataSignal = {
  sourceId?: string | null;
  misspellingNormalized?: string | null;
  correctSpellingNormalized?: string | null;
  wordNormalized?: string | null;
  microSkillKey: string;
  confidence?: "high" | "medium" | "low" | string | null;
};

export type WritingEngineStage2aRecommendationInput = {
  misspelling: string | null | undefined;
  correction: string | null | undefined;
  contextText?: string | null;
  parentUserId?: string | null;
  childId?: string | null;
  taskSubmissionId?: string | null;
  writingSampleId?: string | null;
  catalogEntries: WritingEngineStage1d1CatalogEntry[];
  canonicalMappings?: WritingEngineStage2aCanonicalMappingSignal[];
  parentLocalPromotedMappings?: WritingEngineStage2aParentLocalPromotedMappingSignal[];
  historicalReviewedEvidence?: WritingEngineStage2aReviewedEvidenceSignal[];
  auditFrequencySignals?: WritingEngineStage2aAuditFrequencySignal[];
  wordMapMetadataSignals?: WritingEngineStage2aWordMapMetadataSignal[];
};

type SpellingFeature =
  | "missing_final_e"
  | "added_final_e"
  | "final_consonant_doubling"
  | "vowel_substitution"
  | "vowel_omission"
  | "letter_transposition"
  | "suffix_issue"
  | "prefix_issue"
  | "schwa_unstressed_vowel_issue"
  | "homophone_confusable"
  | "high_edit_distance";

const HIGH_CONFIDENCE_THRESHOLD = 90;
const MEDIUM_CONFIDENCE_THRESHOLD = 45;
const LOW_CONFIDENCE_THRESHOLD = 18;
const TRUSTED_PREFILL_THRESHOLD = 80;
const VIABLE_INFERRED_PREFILL_THRESHOLD = 35;
const POSSIBLE_MATCH_MAX_CONFIDENCE_PERCENT = 89;
const DETERMINISTIC_FEATURE_WEIGHT = 35;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const FEATURE_TERMS: Record<SpellingFeature, string[]> = {
  missing_final_e: ["missing_final_e", "final_e", "final e", "magic e", "split digraph"],
  added_final_e: ["added_final_e", "extra final e", "final_e"],
  final_consonant_doubling: [
    "final_consonant_doubling",
    "consonant doubling",
    "double final consonant",
    "double consonant",
  ],
  vowel_substitution: ["vowel_substitution", "vowel choice", "vowel", "grapheme choice"],
  vowel_omission: ["vowel_omission", "missing vowel", "vowel"],
  letter_transposition: ["letter_transposition", "transposition", "letter order"],
  suffix_issue: ["suffix_issue", "suffix", "ending"],
  prefix_issue: ["prefix_issue", "prefix"],
  schwa_unstressed_vowel_issue: ["schwa", "unstressed vowel", "unstressed_vowel"],
  homophone_confusable: ["homophone", "confusable", "meaning choice"],
  high_edit_distance: ["word_level", "word-specific", "irregular", "tricky"],
};

function normalizeWord(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function isActiveAssignableD4(entry: WritingEngineStage1d1CatalogEntry) {
  return (
    entry.masteryDomainKey === "D4" &&
    entry.isActive === true &&
    entry.isAssignable === true
  );
}

function levenshteinDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_value, column) =>
      row === 0 ? column : column === 0 ? row : 0,
    ),
  );

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return rows[left.length][right.length];
}

function hasAdjacentTransposition(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length - 1; index += 1) {
    const swapped =
      left.slice(0, index) +
      left[index + 1] +
      left[index] +
      left.slice(index + 2);

    if (swapped === right) {
      return true;
    }
  }

  return false;
}

function detectSpellingFeatures(input: {
  misspelling: string;
  correction: string;
  contextText?: string | null;
}): SpellingFeature[] {
  const features = new Set<SpellingFeature>();
  const { misspelling, correction } = input;

  if (correction.endsWith("e") && correction.slice(0, -1) === misspelling) {
    features.add("missing_final_e");
  }

  if (misspelling.endsWith("e") && misspelling.slice(0, -1) === correction) {
    features.add("added_final_e");
  }

  for (let index = 1; index < correction.length; index += 1) {
    if (
      correction[index] === correction[index - 1] &&
      misspelling === correction.slice(0, index) + correction.slice(index + 1)
    ) {
      features.add("final_consonant_doubling");
    }
  }

  if (misspelling.length === correction.length) {
    const differingIndexes = [...correction].flatMap((letter, index) =>
      letter === misspelling[index] ? [] : [index],
    );

    if (
      differingIndexes.length > 0 &&
      differingIndexes.every(
        (index) => VOWELS.has(correction[index]) && VOWELS.has(misspelling[index]),
      )
    ) {
      features.add("vowel_substitution");
    }
  }

  if (
    correction.length === misspelling.length + 1 &&
    [...correction].some((letter, index) => {
      if (!VOWELS.has(letter)) {
        return false;
      }

      return correction.slice(0, index) + correction.slice(index + 1) === misspelling;
    })
  ) {
    features.add("vowel_omission");
  }

  if (hasAdjacentTransposition(misspelling, correction)) {
    features.add("letter_transposition");
  }

  if (
    correction.endsWith("ing") ||
    correction.endsWith("ed") ||
    correction.endsWith("ly") ||
    correction.endsWith("tion") ||
    misspelling.endsWith("ing") ||
    misspelling.endsWith("ed") ||
    misspelling.endsWith("ly")
  ) {
    features.add("suffix_issue");
  }

  if (
    correction.startsWith("un") ||
    correction.startsWith("in") ||
    correction.startsWith("im") ||
    correction.startsWith("dis") ||
    misspelling.startsWith("un") ||
    misspelling.startsWith("in") ||
    misspelling.startsWith("im") ||
    misspelling.startsWith("dis")
  ) {
    features.add("prefix_issue");
  }

  if (
    /[aeiou]r|er|or|ar/.test(correction) &&
    levenshteinDistance(misspelling, correction) <= 3
  ) {
    features.add("schwa_unstressed_vowel_issue");
  }

  if (
    input.contextText &&
    /\b(to|too|two|there|their|they're|where|wear|weather|whether|would|wood)\b/i.test(
      `${input.contextText} ${misspelling} ${correction}`,
    )
  ) {
    features.add("homophone_confusable");
  }

  const editDistance = levenshteinDistance(misspelling, correction);
  if (editDistance >= 4 || (editDistance >= 3 && Math.max(misspelling.length, correction.length) >= 8)) {
    features.add("high_edit_distance");
  }

  return [...features];
}

function flattenMetadataTerms(value: unknown): string[] {
  if (typeof value === "string") {
    return [value.toLowerCase()];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenMetadataTerms);
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => [
      key.toLowerCase(),
      ...flattenMetadataTerms(nested),
    ]);
  }

  return [];
}

function catalogEntryMatchesFeature(
  entry: WritingEngineStage1d1CatalogEntry,
  feature: SpellingFeature,
) {
  const haystack = [
    entry.microSkillKey,
    entry.displayName,
    entry.skillFamilyKey,
    entry.skillClusterKey ?? "",
    ...flattenMetadataTerms(entry.metadata),
  ]
    .join(" ")
    .toLowerCase();

  return FEATURE_TERMS[feature].some((term) => haystack.includes(term));
}

function confidenceFromScore(score: number): WritingEngineStage2aConfidenceLevel {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) {
    return "high";
  }

  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return "medium";
  }

  if (score >= LOW_CONFIDENCE_THRESHOLD) {
    return "low";
  }

  return "none";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function candidateHasTrustedExactSignal(
  candidate: Pick<WritingEngineStage2aRankedMicroSkillCandidate, "sourceSignals">,
) {
  return candidate.sourceSignals.some(
    (signal) =>
      signal.type === "exact_active_canonical_mapping" ||
      signal.type === "same_scope_parent_local_promoted_mapping",
  );
}

function confidencePercentForCandidate(input: {
  candidate: Pick<WritingEngineStage2aRankedMicroSkillCandidate, "score" | "sourceSignals">;
  scoreMargin: number;
  hasSecondCandidate: boolean;
}) {
  if (candidateHasTrustedExactSignal(input.candidate)) {
    return 100;
  }

  const marginPenalty = input.hasSecondCandidate
    ? input.scoreMargin === 0
      ? 20
      : input.scoreMargin < 5
        ? 14
        : input.scoreMargin < 10
          ? 10
          : input.scoreMargin < 20
            ? 5
            : 0
    : 0;

  return clampPercent(
    Math.min(
      POSSIBLE_MATCH_MAX_CONFIDENCE_PERCENT,
      input.candidate.score - marginPenalty,
    ),
  );
}

function isPairMatch(input: {
  misspelling: string;
  correction: string;
  rowMisspelling: string | null | undefined;
  rowCorrection: string | null | undefined;
}) {
  return (
    normalizeWord(input.rowMisspelling) === input.misspelling &&
    normalizeWord(input.rowCorrection) === input.correction
  );
}

function addCandidateSignal(
  signalsByMicroSkill: Map<string, WritingEngineStage2aSourceSignal[]>,
  microSkillKey: string,
  signal: WritingEngineStage2aSourceSignal,
) {
  signalsByMicroSkill.set(microSkillKey, [
    ...(signalsByMicroSkill.get(microSkillKey) ?? []),
    signal,
  ]);
}

function candidateReason(signals: WritingEngineStage2aSourceSignal[]) {
  const ordered = [...signals].sort((left, right) => right.weight - left.weight);
  return ordered
    .slice(0, 3)
    .map((signal) => signal.reason)
    .join("; ");
}

function candidateIsWordLevelOnly(input: {
  features: SpellingFeature[];
  trustedSignalCount: number;
  candidateCount: number;
}) {
  return (
    input.candidateCount === 0 &&
    input.features.includes("high_edit_distance") &&
    input.trustedSignalCount === 0
  );
}

function buildFallbackResult(input: {
  status: WritingEngineStage2aRecommendationStatus;
  reason: string;
  fallbackReason: WritingEngineStage2aFallbackReason;
  candidates?: WritingEngineStage2aRankedMicroSkillCandidate[];
  sourceSignals?: WritingEngineStage2aSourceSignal[];
}): WritingEngineStage2aRecommendationResult {
  return {
    recommendationStatus: input.status,
    recommendationAuthority:
      input.status === "conflict"
        ? "check_manually"
        : input.fallbackReason === "missing_spelling_pair"
          ? "none"
          : "no_match_yet",
    recommendedFamilyKey: null,
    recommendedClusterKey: null,
    recommendedMicroSkillKey: null,
    rankedMicroSkillCandidates: input.candidates ?? [],
    confidence: input.candidates?.[0]?.confidence ?? "none",
    confidencePercent: input.candidates?.[0]?.confidencePercent ?? 0,
    reason: input.reason,
    sourceSignals: input.sourceSignals ?? [],
    fallbackReason: input.fallbackReason,
    isPrefillAllowed: false,
  };
}

function authorityForRecommendedCandidate(
  candidate: WritingEngineStage2aRankedMicroSkillCandidate,
): WritingEngineStage2aRecommendationAuthority {
  if (
    candidate.sourceSignals.some(
      (signal) => signal.type === "exact_active_canonical_mapping",
    )
  ) {
    return "known_match";
  }

  if (
    candidate.sourceSignals.some(
      (signal) => signal.type === "same_scope_parent_local_promoted_mapping",
    )
  ) {
    return "your_match";
  }

  return "possible_match";
}

export function recommendStage2aMicroSkillForSpellingPair(
  input: WritingEngineStage2aRecommendationInput,
): WritingEngineStage2aRecommendationResult {
  const misspelling = normalizeWord(input.misspelling);
  const correction = normalizeWord(input.correction);

  if (!misspelling || !correction || misspelling === correction) {
    return buildFallbackResult({
      status: "insufficient_evidence",
      reason: "A distinct misspelling and correction are required.",
      fallbackReason: "missing_spelling_pair",
    });
  }

  const eligibleCatalogEntries = input.catalogEntries.filter(isActiveAssignableD4);
  const eligibleMicroSkillKeys = new Set(
    eligibleCatalogEntries.map((entry) => entry.microSkillKey),
  );
  const catalogByKey = new Map(
    eligibleCatalogEntries.map((entry) => [entry.microSkillKey, entry]),
  );

  if (eligibleCatalogEntries.length === 0) {
    return buildFallbackResult({
      status: "no_matching_skill_candidate",
      reason: "No active assignable D4 micro-skills are available to recommend.",
      fallbackReason: "no_active_assignable_d4_candidates",
    });
  }

  const features = detectSpellingFeatures({
    misspelling,
    correction,
    contextText: input.contextText,
  });
  const signalsByMicroSkill = new Map<string, WritingEngineStage2aSourceSignal[]>();
  const falsePositiveEvidence = (input.historicalReviewedEvidence ?? []).find((evidence) => (
    evidence.finalClassification === "not_an_issue" &&
    isPairMatch({
      misspelling,
      correction,
      rowMisspelling: evidence.misspellingNormalized,
      rowCorrection: evidence.correctSpellingNormalized,
    })
  ));

  if (falsePositiveEvidence) {
    return buildFallbackResult({
      status: "likely_false_positive",
      reason: "Historical reviewed evidence marked this spelling pair as not a learning issue.",
      fallbackReason: "likely_false_positive",
      sourceSignals: [{
        type: "historical_reviewed_evidence",
        microSkillKey: eligibleMicroSkillKeys.has(falsePositiveEvidence.microSkillKey)
          ? falsePositiveEvidence.microSkillKey
          : null,
        weight: 0,
        reason: "Historical reviewed evidence marked this pair as not a learning issue.",
        sourceRef: falsePositiveEvidence.sourceId ?? null,
      }],
    });
  }

  for (const mapping of input.canonicalMappings ?? []) {
    if (
      mapping.mappingStatus === "active" &&
      eligibleMicroSkillKeys.has(mapping.microSkillKey) &&
      isPairMatch({
        misspelling,
        correction,
        rowMisspelling: mapping.misspellingNormalized,
        rowCorrection: mapping.correctSpellingNormalized,
      })
    ) {
      addCandidateSignal(signalsByMicroSkill, mapping.microSkillKey, {
        type: "exact_active_canonical_mapping",
        microSkillKey: mapping.microSkillKey,
        weight: 110,
        reason: "Exact active canonical mapping match.",
        sourceRef: mapping.mappingId ?? null,
      });
    }
  }

  for (const mapping of input.parentLocalPromotedMappings ?? []) {
    const hasScope =
      Boolean(input.parentUserId && input.childId) &&
      mapping.parentUserId === input.parentUserId &&
      mapping.childId === input.childId;

    if (
      hasScope &&
      mapping.candidateStatus === "parent_local_promoted" &&
      mapping.promotionScope === "parent_local" &&
      eligibleMicroSkillKeys.has(mapping.microSkillKey) &&
      isPairMatch({
        misspelling,
        correction,
        rowMisspelling: mapping.misspellingNormalized,
        rowCorrection: mapping.correctSpellingNormalized,
      })
    ) {
      addCandidateSignal(signalsByMicroSkill, mapping.microSkillKey, {
        type: "same_scope_parent_local_promoted_mapping",
        microSkillKey: mapping.microSkillKey,
        weight: 95,
        reason: "Same-scope parent-local promoted exact mapping.",
        sourceRef: mapping.mappingId ?? null,
      });
    }
  }

  for (const evidence of input.historicalReviewedEvidence ?? []) {
    if (
      eligibleMicroSkillKeys.has(evidence.microSkillKey) &&
      evidence.finalClassification !== "not_an_issue" &&
      isPairMatch({
        misspelling,
        correction,
        rowMisspelling: evidence.misspellingNormalized,
        rowCorrection: evidence.correctSpellingNormalized,
      })
    ) {
      addCandidateSignal(signalsByMicroSkill, evidence.microSkillKey, {
        type: "historical_reviewed_evidence",
        microSkillKey: evidence.microSkillKey,
        weight: 45,
        reason: "Historical reviewed evidence supports this micro-skill.",
        sourceRef: evidence.sourceId ?? null,
      });
    }
  }

  for (const frequency of input.auditFrequencySignals ?? []) {
    if (
      eligibleMicroSkillKeys.has(frequency.microSkillKey) &&
      isPairMatch({
        misspelling,
        correction,
        rowMisspelling: frequency.misspellingNormalized,
        rowCorrection: frequency.correctSpellingNormalized,
      })
    ) {
      addCandidateSignal(signalsByMicroSkill, frequency.microSkillKey, {
        type: "slice1_audit_frequency",
        microSkillKey: frequency.microSkillKey,
        weight: Math.min(15, Math.max(1, frequency.evidenceCount)),
        reason: `Slice 1 frequency signal from ${frequency.evidenceCount} evidence row(s).`,
        sourceRef: frequency.sourceId ?? null,
      });
    }
  }

  for (const signal of input.wordMapMetadataSignals ?? []) {
    const exactPair = isPairMatch({
      misspelling,
      correction,
      rowMisspelling: signal.misspellingNormalized,
      rowCorrection: signal.correctSpellingNormalized,
    });
    const correctionWordMatch = normalizeWord(signal.wordNormalized) === correction;

    if (
      eligibleMicroSkillKeys.has(signal.microSkillKey) &&
      (exactPair || correctionWordMatch)
    ) {
      addCandidateSignal(signalsByMicroSkill, signal.microSkillKey, {
        type: "canonical_word_map_metadata",
        microSkillKey: signal.microSkillKey,
        weight: signal.confidence === "high" ? 30 : signal.confidence === "medium" ? 20 : 12,
        reason: exactPair
          ? "Canonical word-map diagnostic metadata supports this pair."
          : "Canonical word-map content metadata supports this correction word.",
        sourceRef: signal.sourceId ?? null,
      });
    }
  }

  for (const entry of eligibleCatalogEntries) {
    if (catalogEntryMatchesFeature(entry, "high_edit_distance")) {
      continue;
    }

    for (const feature of features) {
      if (catalogEntryMatchesFeature(entry, feature)) {
        addCandidateSignal(signalsByMicroSkill, entry.microSkillKey, {
          type: "deterministic_spelling_difference",
          microSkillKey: entry.microSkillKey,
          weight: feature === "high_edit_distance" ? 8 : DETERMINISTIC_FEATURE_WEIGHT,
          reason: `Deterministic spelling-difference feature: ${feature}.`,
        });
      }
    }

    if (
      catalogEntryMatchesFeature(entry, "vowel_substitution") &&
      (correction.includes("a") ||
        correction.includes("e") ||
        correction.includes("i") ||
        correction.includes("o") ||
        correction.includes("u"))
    ) {
      addCandidateSignal(signalsByMicroSkill, entry.microSkillKey, {
        type: "correction_word_pattern_support",
        microSkillKey: entry.microSkillKey,
        weight: 16,
        reason: "Correction-word pattern support matches catalog metadata.",
      });
    }

    if (
      features.some((feature) => catalogEntryMatchesFeature(entry, feature)) &&
      flattenMetadataTerms(entry.metadata).length > 0
    ) {
      addCandidateSignal(signalsByMicroSkill, entry.microSkillKey, {
        type: "active_assignable_d4_micro_skill_metadata",
        microSkillKey: entry.microSkillKey,
        weight: 14,
        reason: "Active assignable D4 micro-skill metadata supports this pattern.",
      });
    }
  }

  const trustedSignalCount = [...signalsByMicroSkill.values()].flat().filter(
    (signal) =>
      signal.type === "exact_active_canonical_mapping" ||
      signal.type === "same_scope_parent_local_promoted_mapping" ||
      signal.type === "historical_reviewed_evidence",
  ).length;

  const candidates = [...signalsByMicroSkill.entries()]
    .flatMap(([microSkillKey, sourceSignals]) => {
      const entry = catalogByKey.get(microSkillKey);

      if (!entry) {
        return [];
      }

      const score = sourceSignals.reduce((total, signal) => total + signal.weight, 0);
      const confidence = confidenceFromScore(score);

      return [{
        microSkillKey,
        familyKey: entry.skillFamilyKey,
        clusterKey: entry.skillClusterKey,
        displayName: entry.displayName,
        score,
        confidence,
        confidencePercent: clampPercent(score),
        reason: candidateReason(sourceSignals),
        sourceSignals,
      }];
    })
    .sort((left, right) => right.score - left.score || left.microSkillKey.localeCompare(right.microSkillKey));

  if (
    candidateIsWordLevelOnly({
      features,
      trustedSignalCount,
      candidateCount: candidates.length,
    })
  ) {
    return buildFallbackResult({
      status: "word_level_only_candidate",
      reason: "The spelling pair is too noisy or word-specific for a confident micro-skill recommendation.",
      fallbackReason: "word_level_only",
    });
  }

  if (candidates.length === 0) {
    return buildFallbackResult({
      status: features.length > 0 ? "low_confidence" : "insufficient_evidence",
      reason: "No existing active assignable D4 micro-skill candidate matched the safe read-only signals.",
      fallbackReason: features.length > 0 ? "low_confidence" : "insufficient_evidence",
    });
  }

  const rankedCandidates = candidates.map((candidate, index) => {
    const nextCandidate = candidates[index + 1];
    return {
      ...candidate,
      confidencePercent: confidencePercentForCandidate({
        candidate,
        scoreMargin: candidate.score - (nextCandidate?.score ?? 0),
        hasSecondCandidate: Boolean(nextCandidate),
      }),
    };
  });
  const [topCandidate, secondCandidate] = rankedCandidates;
  const scoreMargin = topCandidate.score - (secondCandidate?.score ?? 0);

  const recommendationAuthority = authorityForRecommendedCandidate(topCandidate);
  const isTrustedExactPrefill =
    recommendationAuthority === "known_match" || recommendationAuthority === "your_match";
  const isPrefillAllowed = isTrustedExactPrefill
    ? topCandidate.score >= TRUSTED_PREFILL_THRESHOLD
    : topCandidate.score >= VIABLE_INFERRED_PREFILL_THRESHOLD;

  if (!isPrefillAllowed) {
    return buildFallbackResult({
      status: topCandidate.score < LOW_CONFIDENCE_THRESHOLD ? "insufficient_evidence" : "low_confidence",
      reason: "The strongest candidate is below the viability threshold for table prefill.",
      fallbackReason: topCandidate.score < LOW_CONFIDENCE_THRESHOLD ? "insufficient_evidence" : "low_confidence",
      candidates: rankedCandidates,
      sourceSignals: topCandidate.sourceSignals,
    });
  }

  return {
    recommendationStatus: "recommended",
    recommendationAuthority,
    recommendedFamilyKey: topCandidate.familyKey,
    recommendedClusterKey: topCandidate.clusterKey,
    recommendedMicroSkillKey: topCandidate.microSkillKey,
    rankedMicroSkillCandidates: rankedCandidates,
    confidence: topCandidate.confidence,
    confidencePercent: topCandidate.confidencePercent,
    reason: scoreMargin === 0 && secondCandidate && !isTrustedExactPrefill
      ? `${topCandidate.reason}; exact score tie resolved by deterministic micro-skill key ordering.`
      : topCandidate.reason,
    sourceSignals: topCandidate.sourceSignals,
    fallbackReason: null,
    isPrefillAllowed: true,
  };
}
