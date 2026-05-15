import type {
  ParentVerificationRecord,
  RecordParentVerificationCommand,
  VerifiedOutcome,
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineSourceRef,
  WritingEngineVerificationDecision,
} from "../types";
import type { ParentVerificationRepository } from "../core/verification";
import type { SpellingCategory } from "../../spelling/categoriseError";
import type { ErrorPattern } from "../../spelling/errorPatterns";
import type { WordFamilyId } from "../../spelling/wordFamilies";

export type ManualSpellingDiagnosticInput = {
  targetWord: string;
  childSpelling: string;
  sentenceContext?: string | null;
};

export type ManualSpellingDiagnosticRuleKey =
  | "exact_match"
  | "cvc_short_vowel_substitution"
  | "consonant_blend_omission"
  | "detected_error_pattern"
  | "category_fallback";

export type ManualSpellingDiagnosticPrerequisiteGapKey =
  | "sound_to_spelling_mapping"
  | "vowel_discrimination"
  | "blend_segmentation"
  | "grapheme_choice"
  | "long_vowel_pattern_awareness"
  | "suffix_awareness"
  | "base_word_awareness"
  | "syllable_awareness"
  | "meaning_choice"
  | "proofreading_attention";

export type ManualSpellingDiagnosticRuleMetadata = {
  ruleKey: ManualSpellingDiagnosticRuleKey;
  explanation: string;
  errorPattern: ErrorPattern | null;
  teachingFamilyId: WordFamilyId | null;
  matchedCatalogKey: string | null;
  categoryReason: string;
  confidenceReasons: string[];
  metadata: WritingEngineSourceMetadata;
};

export type ManualSpellingDiagnosticResolvedSuggestion = {
  suggestedMicroSkillKey: string | null;
  recommendedLessonTemplateKey: string | null;
  possiblePrerequisiteGapKeys: ManualSpellingDiagnosticPrerequisiteGapKey[];
  similarPracticeWords: string[];
  matchedCatalogKey: string | null;
};

export type ManualSpellingDiagnosticInterpretation = {
  likelyErrorCategory: SpellingCategory | null;
  errorPattern: ErrorPattern | null;
  teachingFamilyId: WordFamilyId | null;
  confidenceScore: number;
  explanation: string;
  ruleMetadata: ManualSpellingDiagnosticRuleMetadata;
  resolvedSuggestion: ManualSpellingDiagnosticResolvedSuggestion;
  hasDiagnosticConcern: boolean;
};

export type ManualSpellingDiagnosticResult = {
  sourceType: "manual_diagnostic";
  sourceRef: WritingEngineSourceRef;
  targetWord: string;
  childSpelling: string;
  sentenceContext: string | null;
  likelyErrorCategory: SpellingCategory | null;
  suggestedMicroSkillKey: string | null;
  possiblePrerequisiteGapKeys: ManualSpellingDiagnosticPrerequisiteGapKey[];
  recommendedLessonTemplateKey: string | null;
  similarPracticeWords: string[];
  confidenceScore: number;
  explanation: string;
  ruleMetadata: ManualSpellingDiagnosticRuleMetadata;
  hasDiagnosticConcern: boolean;
  candidateHypothesis: WritingEngineCandidateHypothesis;
};

export type ManualSpellingDiagnosticVerificationInput = {
  childId: string;
  parentUserId: string;
  diagnosticResult: ManualSpellingDiagnosticResult;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode?: string | null;
  verifiedMicroSkillKey?: string | null;
  verifiedTemplateKey?: string | null;
  note?: string | null;
  metadata?: WritingEngineSourceMetadata;
  verificationId?: string;
  nowIso?: string;
};

export type ManualSpellingDiagnosticVerificationPersistenceInput = {
  verificationInput: ManualSpellingDiagnosticVerificationInput;
  repository: ParentVerificationRepository;
  nowIso?: string;
};

export type ManualSpellingDiagnosticVerificationResult = {
  sourceType: "manual_diagnostic";
  diagnosticResult: ManualSpellingDiagnosticResult;
  originalSuggestion: WritingEngineCandidateHypothesis;
  parentDecision: WritingEngineVerificationDecision;
  parentVerifiedTruth: {
    categoryCode: string | null;
    microSkillKey: string | null;
    templateKey: string | null;
  } | null;
  verificationRecord: ParentVerificationRecord;
  verifiedOutcome: VerifiedOutcome;
  hasMasteryUpdatingIntent: boolean;
};

export type ManualSpellingDiagnosticVerificationBuildResult = {
  command: RecordParentVerificationCommand;
  result: ManualSpellingDiagnosticVerificationResult;
};
