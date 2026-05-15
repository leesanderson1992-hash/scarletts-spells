import type {
  AssignmentItemCandidate,
  ControlledSpellingAssignmentExpectedAnswer,
  ControlledSpellingAssignmentPromptData,
  VerifiedOutcome,
  WritingEngineAssignmentItemType,
  WritingEngineSourceMetadata,
  WritingEngineStage1d1AssignmentInput,
  WritingEngineStage1d1CandidateResult,
} from "../types";
import { resolveStage2dLessonTemplateKey } from "../spelling/stage2d-lesson-template-registry";

function getDefaultItemType(
  domainModule: VerifiedOutcome["verification"]["domainModule"],
): WritingEngineAssignmentItemType {
  switch (domainModule) {
    case "spelling":
      return "controlled_spelling";
    case "punctuation":
      return "punctuation_correction";
    case "sentence_boundaries":
      return "sentence_splitting";
    case "grammar":
      return "grammar_transformation";
    case "proofreading":
      return "proofreading";
    case "paragraph_revision":
      return "paragraph_revision";
    case "writing_transfer":
      return "writing_transfer_prompt";
    case "vocabulary":
      return "contrast_practice";
  }
}

export function createAssignmentItemCandidate(input: {
  outcome: VerifiedOutcome;
  itemType?: WritingEngineAssignmentItemType;
  learningItemId?: string | null;
  promptData?: Record<string, unknown>;
  expectedAnswer?: Record<string, unknown> | null;
  targetWord?: string | null;
}) {
  const { outcome } = input;

  return {
    domainModule: outcome.verification.domainModule,
    itemType: input.itemType ?? getDefaultItemType(outcome.verification.domainModule),
    sourceRef: outcome.verification.sourceRef,
    learningItemId: input.learningItemId ?? null,
    templateKey: outcome.templateKey,
    targetWord: input.targetWord ?? null,
    promptData:
      input.promptData ?? {
        categoryCode: outcome.categoryCode,
        microSkillKey: outcome.microSkillKey,
        note: outcome.verification.note,
      },
    expectedAnswer: input.expectedAnswer ?? null,
    status: "ready",
    metadata: {
      parent_verification_id: outcome.verification.id,
      decision: outcome.verification.decision,
      ...outcome.metadata,
    },
  } satisfies AssignmentItemCandidate;
}

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function readStarterWordBankWords(metadata: WritingEngineSourceMetadata) {
  const starterWordBank = metadata.starter_word_bank;

  if (!Array.isArray(starterWordBank)) {
    return [] as string[];
  }

  return starterWordBank.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const word = "word" in entry ? entry.word : null;
    return typeof word === "string" ? [word] : [];
  });
}

function readExampleWords(metadata: WritingEngineSourceMetadata) {
  const exampleWords = metadata.example_words;

  if (!Array.isArray(exampleWords)) {
    return [] as string[];
  }

  return exampleWords.filter((word): word is string => typeof word === "string");
}

function readContrastWords(metadata: WritingEngineSourceMetadata) {
  const contrastWordBank = metadata.contrast_word_bank;

  if (!Array.isArray(contrastWordBank)) {
    return [] as string[];
  }

  return contrastWordBank.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const word = "word" in entry ? entry.word : null;
    return typeof word === "string" ? [word] : [];
  });
}

function getPracticeWords(input: {
  targetWord: string;
  metadata: WritingEngineSourceMetadata;
}) {
  return dedupeWords([
    input.targetWord,
    ...readStarterWordBankWords(input.metadata),
    ...readExampleWords(input.metadata),
  ]);
}

function hasGroupedWordMetadata(metadata: WritingEngineSourceMetadata) {
  return Array.isArray(metadata.starter_word_bank) || Array.isArray(metadata.example_words);
}

function getGroupedSetPracticeWords(metadata: WritingEngineSourceMetadata) {
  return dedupeWords([
    ...readStarterWordBankWords(metadata),
    ...readExampleWords(metadata),
  ]);
}

function hasContrastWordMetadata(metadata: WritingEngineSourceMetadata) {
  return (
    Array.isArray(metadata.contrast_word_bank) ||
    Array.isArray(metadata.starter_word_bank) ||
    Array.isArray(metadata.example_words)
  );
}

function getContrastPracticeWords(metadata: WritingEngineSourceMetadata) {
  return dedupeWords([
    ...readContrastWords(metadata),
    ...readStarterWordBankWords(metadata),
    ...readExampleWords(metadata),
  ]);
}

function readOptionalStringMetadata(
  metadata: WritingEngineSourceMetadata,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function inferStage1d1DomainModule(input: WritingEngineStage1d1AssignmentInput) {
  const metadataDomainModule = input.learningItem.domainModule;

  if (metadataDomainModule === "spelling") {
    return metadataDomainModule;
  }

  return input.catalogEntry.masteryDomainKey === "D4" ? "spelling" : null;
}

export function createStage1d1AssignmentCandidate(
  input: WritingEngineStage1d1AssignmentInput,
): WritingEngineStage1d1CandidateResult {
  if (inferStage1d1DomainModule(input) !== "spelling") {
    return {
      status: "skipped",
      reason: "unsupported_domain_module",
    };
  }

  if (
    input.learningItem.practiceRoute !== "word_practice" &&
    input.learningItem.practiceRoute !== "grouped_set_practice" &&
    input.learningItem.practiceRoute !== "contrast_practice" &&
    input.learningItem.practiceRoute !== "dictation"
  ) {
    return {
      status: "skipped",
      reason: "unsupported_practice_route",
    };
  }

  if (!input.catalogEntry.isActive) {
    return {
      status: "skipped",
      reason: "inactive_micro_skill",
    };
  }

  if (!input.catalogEntry.isAssignable) {
    return {
      status: "skipped",
      reason: "non_assignable_micro_skill",
    };
  }

  if (!input.evidence) {
    return {
      status: "skipped",
      reason: "missing_evidence",
    };
  }

  if (!input.evidence.sourceRef) {
    return {
      status: "skipped",
      reason: "missing_source_provenance",
    };
  }

  const targetWord = input.evidence.targetWord?.trim().toLowerCase() ?? null;

  if (!targetWord) {
    return {
      status: "skipped",
      reason: "missing_target_word",
    };
  }

  const templateResolution = resolveStage2dLessonTemplateKey({
    catalogEntry: input.catalogEntry,
    practiceRoute: input.learningItem.practiceRoute,
    preferredTemplateKeys: [
      input.evidence.verifiedTemplateKey,
      input.evidence.originalSuggestedTemplateKey,
    ],
  });

  const selectedTemplateKey =
    templateResolution.status === "resolved"
      ? templateResolution.templateKey
      : null;

  if (!selectedTemplateKey) {
    return {
      status: "skipped",
      reason: "missing_template_key",
    };
  }

  if (input.learningItem.practiceRoute === "grouped_set_practice") {
    if (!hasGroupedWordMetadata(input.catalogEntry.metadata)) {
      return {
        status: "skipped",
        reason: "missing_grouped_metadata",
      };
    }

    const practiceWords = getGroupedSetPracticeWords(input.catalogEntry.metadata);

    if (practiceWords.length < 2) {
      return {
        status: "skipped",
        reason: "insufficient_grouped_words",
      };
    }

    const promptData = {
      instruction: "Spell each practice word.",
      microSkillKey: input.learningItem.microSkillKey,
      microSkillLabel: input.catalogEntry.displayName,
      targetWord,
      practiceWords,
      teachingPoint:
        typeof input.catalogEntry.metadata.teaching_point === "string"
          ? input.catalogEntry.metadata.teaching_point
          : null,
    } satisfies ControlledSpellingAssignmentPromptData;

    const expectedAnswer = {
      correctSpelling: targetWord,
      correctSpellings: practiceWords,
    } satisfies ControlledSpellingAssignmentExpectedAnswer;

    return {
      status: "candidate",
      candidate: {
        domainModule: "spelling",
        itemType: "controlled_spelling",
        sourceRef: input.evidence.sourceRef,
        learningItemId: input.learningItem.learningItemId,
        templateKey: selectedTemplateKey,
        targetWord,
        promptData,
        expectedAnswer,
        status: "ready",
        metadata: {
          learning_item_id: input.learningItem.learningItemId,
          micro_skill_key: input.learningItem.microSkillKey,
          parent_verification_id: input.evidence.parentVerificationId,
          verification_decision: input.evidence.verificationDecision,
          source_context: input.evidence.sourceContext,
          evidence_id: input.evidence.evidenceId,
          evidence_type: input.evidence.evidenceType,
        },
      },
    };
  }

  if (input.learningItem.practiceRoute === "contrast_practice") {
    if (!hasContrastWordMetadata(input.catalogEntry.metadata)) {
      return {
        status: "skipped",
        reason: "missing_contrast_metadata",
      };
    }

    const contrastWords = getContrastPracticeWords(input.catalogEntry.metadata);
    const contrastWord =
      contrastWords.find((word) => word !== targetWord) ?? null;

    if (!contrastWord) {
      return {
        status: "skipped",
        reason: "insufficient_contrast_words",
      };
    }

    const promptData = {
      instruction: "Spell each contrast word.",
      microSkillKey: input.learningItem.microSkillKey,
      microSkillLabel: input.catalogEntry.displayName,
      targetWord,
      practiceWords: [targetWord, contrastWord],
      contrastWord,
      teachingPoint:
        typeof input.catalogEntry.metadata.teaching_point === "string"
          ? input.catalogEntry.metadata.teaching_point
          : null,
    } satisfies ControlledSpellingAssignmentPromptData;

    const expectedAnswer = {
      correctSpelling: targetWord,
      correctSpellings: [targetWord, contrastWord],
    } satisfies ControlledSpellingAssignmentExpectedAnswer;

    return {
      status: "candidate",
      candidate: {
        domainModule: "spelling",
        itemType: "controlled_spelling",
        sourceRef: input.evidence.sourceRef,
        learningItemId: input.learningItem.learningItemId,
        templateKey: selectedTemplateKey,
        targetWord,
        promptData,
        expectedAnswer,
        status: "ready",
        metadata: {
          learning_item_id: input.learningItem.learningItemId,
          micro_skill_key: input.learningItem.microSkillKey,
          parent_verification_id: input.evidence.parentVerificationId,
          verification_decision: input.evidence.verificationDecision,
          source_context: input.evidence.sourceContext,
          evidence_id: input.evidence.evidenceId,
          evidence_type: input.evidence.evidenceType,
        },
      },
    };
  }

  if (input.learningItem.practiceRoute === "dictation") {
    const promptData = {
      instruction: "Spell the dictation word.",
      microSkillKey: input.learningItem.microSkillKey,
      microSkillLabel: input.catalogEntry.displayName,
      targetWord,
      practiceWords: [targetWord],
      supportText: readOptionalStringMetadata(
        input.catalogEntry.metadata,
        "dictation_support_text",
      ),
      teachingPoint:
        typeof input.catalogEntry.metadata.teaching_point === "string"
          ? input.catalogEntry.metadata.teaching_point
          : null,
    } satisfies ControlledSpellingAssignmentPromptData;

    const expectedAnswer = {
      correctSpelling: targetWord,
    } satisfies ControlledSpellingAssignmentExpectedAnswer;

    return {
      status: "candidate",
      candidate: {
        domainModule: "spelling",
        itemType: "controlled_spelling",
        sourceRef: input.evidence.sourceRef,
        learningItemId: input.learningItem.learningItemId,
        templateKey: selectedTemplateKey,
        targetWord,
        promptData,
        expectedAnswer,
        status: "ready",
        metadata: {
          learning_item_id: input.learningItem.learningItemId,
          micro_skill_key: input.learningItem.microSkillKey,
          parent_verification_id: input.evidence.parentVerificationId,
          verification_decision: input.evidence.verificationDecision,
          source_context: input.evidence.sourceContext,
          evidence_id: input.evidence.evidenceId,
          evidence_type: input.evidence.evidenceType,
        },
      },
    };
  }

  const promptData = {
    instruction: "Spell the target word.",
    microSkillKey: input.learningItem.microSkillKey,
    microSkillLabel: input.catalogEntry.displayName,
    targetWord,
    practiceWords: getPracticeWords({
      targetWord,
      metadata: input.catalogEntry.metadata,
    }),
    teachingPoint:
      typeof input.catalogEntry.metadata.teaching_point === "string"
        ? input.catalogEntry.metadata.teaching_point
        : null,
  } satisfies ControlledSpellingAssignmentPromptData;

  const expectedAnswer = {
    correctSpelling: targetWord,
  } satisfies ControlledSpellingAssignmentExpectedAnswer;

  return {
    status: "candidate",
    candidate: {
      domainModule: "spelling",
      itemType: "controlled_spelling",
      sourceRef: input.evidence.sourceRef,
      learningItemId: input.learningItem.learningItemId,
      templateKey: selectedTemplateKey,
      targetWord,
      promptData,
      expectedAnswer,
      status: "ready",
      metadata: {
        learning_item_id: input.learningItem.learningItemId,
        micro_skill_key: input.learningItem.microSkillKey,
        parent_verification_id: input.evidence.parentVerificationId,
        verification_decision: input.evidence.verificationDecision,
        source_context: input.evidence.sourceContext,
        evidence_id: input.evidence.evidenceId,
        evidence_type: input.evidence.evidenceType,
      },
    },
  };
}
