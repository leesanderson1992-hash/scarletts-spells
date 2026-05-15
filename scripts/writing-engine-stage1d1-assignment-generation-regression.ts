import assert from "node:assert/strict";

import { createStage1d1AssignmentCandidate } from "../lib/writing-engine/assignments/candidates";
import {
  assignmentItemExistsInDailyAssignment,
  appendStage1d2AssignmentItemsToDailyAssignment,
  selectStage1d2OrderedCandidates,
  type WritingEngineAssignmentItemRepository,
} from "../lib/writing-engine/assignments/service";
import { selectStage1d1RelevantEvidenceRows } from "../lib/writing-engine/assignments/stage1d1-evidence";
import type {
  AssignmentItemCandidate,
  WritingEngineStage1d1CandidateResult,
  WritingEngineStage1d1CatalogEntry,
  WritingEngineStage1d1Evidence,
  WritingEngineStage1d1LearningItem,
} from "../lib/writing-engine/types";

type Stage1d1EvidenceRowFixture = {
  id: string;
  learning_item_id: string;
  task_submission_id: string | null;
  evidence_type: string;
  source_context: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function buildLearningItem(
  overrides?: Partial<WritingEngineStage1d1LearningItem>,
): WritingEngineStage1d1LearningItem {
  return {
    learningItemId: "learning-item-1",
    childId: "child-1",
    parentUserId: "parent-1",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    practiceRoute: "word_practice",
    domainModule: null,
    metadata: {},
    ...overrides,
  };
}

function buildCatalogEntry(
  overrides?: Partial<WritingEngineStage1d1CatalogEntry>,
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    masteryDomainKey: "D4",
    skillFamilyKey: "D4_PG",
    skillClusterKey: "D4_PG_CVC_SHORT_VOWELS",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    displayName: "Short /a/ in CVC words",
    allowedTemplateKeys: ["T03", "T05"],
    metadata: {
      teaching_point:
        "In CVC words, each spoken sound should be represented in order.",
      starter_word_bank: [{ word: "cat" }, { word: "map" }],
      example_words: ["sat", "pan"],
    },
    ...overrides,
  };
}

function buildEvidence(
  overrides?: Partial<WritingEngineStage1d1Evidence>,
): WritingEngineStage1d1Evidence {
  return {
    evidenceId: "evidence-1",
    learningItemId: "learning-item-1",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
      taskSubmissionId: null,
    },
    targetWord: "cat",
    verifiedTemplateKey: "T03",
    originalSuggestedTemplateKey: "T05",
    parentVerificationId: "verification-1",
    verificationDecision: "accepted",
    sourceContext: "parent_verified_manual_diagnostic",
    evidenceType: "incorrect_use",
    metadata: {
      target_word: "cat",
      verified_template_key: "T03",
      original_suggested_template_key: "T05",
      parent_verification_id: "verification-1",
    },
    createdAt: "2026-05-12T10:00:00.000Z",
    ...overrides,
  };
}

function buildEvidenceRow(
  overrides?: Partial<Stage1d1EvidenceRowFixture>,
): Stage1d1EvidenceRowFixture {
  return {
    id: "evidence-row-1",
    learning_item_id: "learning-item-1",
    task_submission_id: null,
    evidence_type: "incorrect_use",
    source_context: "parent_verified_manual_diagnostic",
    metadata: {
      source_type: "manual_diagnostic",
      source_entity_id: "manual_diagnostic::cat::cot",
      target_word: "cat",
      verified_template_key: "T03",
      original_suggested_template_key: "T05",
    },
    created_at: "2026-05-12T10:00:00.000Z",
    ...overrides,
  };
}

function buildCandidateResult(
  overrides?: {
    candidate?: Partial<AssignmentItemCandidate>;
  },
): WritingEngineStage1d1CandidateResult {
  return {
    status: "candidate",
    candidate: {
      domainModule: "spelling",
      itemType: "controlled_spelling",
      sourceRef: {
        sourceType: "manual_diagnostic",
        sourceEntityId: "manual_diagnostic::cat::cot",
        taskSubmissionId: null,
      },
      learningItemId: "learning-item-1",
      templateKey: "T03",
      targetWord: "cat",
      promptData: {
        instruction: "Spell the target word.",
      },
      expectedAnswer: {
        correctSpelling: "cat",
      },
      status: "ready",
      metadata: {},
      ...overrides?.candidate,
    },
  };
}

function buildCandidate(
  overrides?: Partial<AssignmentItemCandidate>,
): AssignmentItemCandidate {
  return {
    domainModule: "spelling",
    itemType: "controlled_spelling",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
      taskSubmissionId: null,
    },
    learningItemId: "learning-item-1",
    templateKey: "T03",
    targetWord: "cat",
    promptData: {
      instruction: "Spell the target word.",
    },
    expectedAnswer: {
      correctSpelling: "cat",
    },
    status: "ready",
    metadata: {},
    ...overrides,
  };
}

function buildGroupedSetCandidate(
  overrides?: Partial<AssignmentItemCandidate>,
): AssignmentItemCandidate {
  return {
    domainModule: "spelling",
    itemType: "controlled_spelling",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
      taskSubmissionId: null,
    },
    learningItemId: "learning-item-grouped-1",
    templateKey: "T03",
    targetWord: "cat",
    promptData: {
      instruction: "Spell each practice word.",
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
      microSkillLabel: "Full CVC sound-to-spelling mapping",
      targetWord: "cat",
      practiceWords: ["map", "cat", "sat", "pan"],
      teachingPoint: "Spell all sounds in order across the whole word.",
    },
    expectedAnswer: {
      correctSpelling: "cat",
      correctSpellings: ["map", "cat", "sat", "pan"],
    },
    status: "ready",
    metadata: {
      learning_item_id: "learning-item-grouped-1",
      micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
      parent_verification_id: "verification-1",
      verification_decision: "accepted",
      source_context: "parent_verified_manual_diagnostic",
      evidence_id: "evidence-1",
      evidence_type: "incorrect_use",
    },
    ...overrides,
  };
}

function buildContrastCandidate(
  overrides?: Partial<AssignmentItemCandidate>,
): AssignmentItemCandidate {
  return {
    domainModule: "spelling",
    itemType: "controlled_spelling",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
      taskSubmissionId: null,
    },
    learningItemId: "learning-item-contrast-1",
    templateKey: "T03",
    targetWord: "cat",
    promptData: {
      instruction: "Spell each contrast word.",
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      microSkillLabel: "Short /a/ in CVC words",
      targetWord: "cat",
      practiceWords: ["cat", "cot"],
      contrastWord: "cot",
      teachingPoint:
        "Listen for the vowel change and spell each word carefully.",
    },
    expectedAnswer: {
      correctSpelling: "cat",
      correctSpellings: ["cat", "cot"],
    },
    status: "ready",
    metadata: {
      learning_item_id: "learning-item-contrast-1",
      micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      parent_verification_id: "verification-1",
      verification_decision: "accepted",
      source_context: "parent_verified_manual_diagnostic",
      evidence_id: "evidence-1",
      evidence_type: "incorrect_use",
    },
    ...overrides,
  };
}

function buildDictationCandidate(
  overrides?: Partial<AssignmentItemCandidate>,
): AssignmentItemCandidate {
  return {
    domainModule: "spelling",
    itemType: "controlled_spelling",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
      taskSubmissionId: null,
    },
    learningItemId: "learning-item-dictation-1",
    templateKey: "DT01",
    targetWord: "cat",
    promptData: {
      instruction: "Spell the dictation word.",
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      microSkillLabel: "Short /a/ in CVC words",
      targetWord: "cat",
      practiceWords: ["cat"],
      supportText: "Say the word clearly, then write the whole word.",
      teachingPoint:
        "In CVC words, each spoken sound should be represented in order.",
    },
    expectedAnswer: {
      correctSpelling: "cat",
    },
    status: "ready",
    metadata: {
      learning_item_id: "learning-item-dictation-1",
      micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      parent_verification_id: "verification-1",
      verification_decision: "accepted",
      source_context: "parent_verified_manual_diagnostic",
      evidence_id: "evidence-1",
      evidence_type: "incorrect_use",
    },
    ...overrides,
  };
}

function buildGroupedSetCandidateResult(
  overrides?: {
    candidate?: Partial<AssignmentItemCandidate>;
  },
): WritingEngineStage1d1CandidateResult {
  return {
    status: "candidate",
    candidate: buildGroupedSetCandidate(overrides?.candidate),
  };
}

function buildContrastCandidateResult(
  overrides?: {
    candidate?: Partial<AssignmentItemCandidate>;
  },
): WritingEngineStage1d1CandidateResult {
  return {
    status: "candidate",
    candidate: buildContrastCandidate(overrides?.candidate),
  };
}

function buildDictationCandidateResult(
  overrides?: {
    candidate?: Partial<AssignmentItemCandidate>;
  },
): WritingEngineStage1d1CandidateResult {
  return {
    status: "candidate",
    candidate: buildDictationCandidate(overrides?.candidate),
  };
}

type AssignmentItemIdentityFixture = {
  dailyAssignmentId: string;
  parentUserId: string;
  learningItemId: string | null;
  itemType: AssignmentItemCandidate["itemType"];
  targetWord: string | null;
  templateKey: string | null;
  sourceType: AssignmentItemCandidate["sourceRef"]["sourceType"];
  sourceEntityId: string;
};

type AssignmentItemAppendCallFixture = {
  dailyAssignmentId: string;
  parentUserId: string;
  candidate: AssignmentItemCandidate;
  position: number;
};

function createAssignmentItemRepositoryFixture(
  rows: AssignmentItemIdentityFixture[],
): WritingEngineAssignmentItemRepository & {
  calls: {
    hasMatchingItem: number;
    getNextPosition: number;
    appendItem: number;
  };
} {
  const calls = {
    hasMatchingItem: 0,
    getNextPosition: 0,
    appendItem: 0,
  };

  return {
    calls,
    async hasMatchingItem(input) {
      calls.hasMatchingItem += 1;

      return rows.some((row) => {
        return (
          row.dailyAssignmentId === input.dailyAssignmentId &&
          row.parentUserId === input.parentUserId &&
          row.learningItemId === (input.candidate.learningItemId ?? null) &&
          row.itemType === input.candidate.itemType &&
          row.targetWord === (input.candidate.targetWord ?? null) &&
          row.templateKey === (input.candidate.templateKey ?? null) &&
          row.sourceType === input.candidate.sourceRef.sourceType &&
          row.sourceEntityId === input.candidate.sourceRef.sourceEntityId
        );
      });
    },
    async getNextPosition() {
      calls.getNextPosition += 1;
      throw new Error("getNextPosition should not be called during 1D.2B duplicate reads.");
    },
    async appendItem() {
      calls.appendItem += 1;
      throw new Error("appendItem should not be called during 1D.2B duplicate reads.");
    },
  };
}

function createAppendingAssignmentItemRepositoryFixture(input?: {
  existingRows?: AssignmentItemIdentityFixture[];
}) {
  const rows = [...(input?.existingRows ?? [])];
  const calls = {
    hasMatchingItem: 0,
    getNextPosition: 0,
    appendItem: 0,
  };
  const callSequence: string[] = [];
  const appendCalls: AssignmentItemAppendCallFixture[] = [];

  const repository: WritingEngineAssignmentItemRepository = {
    async hasMatchingItem(input) {
      calls.hasMatchingItem += 1;
      callSequence.push(`hasMatchingItem:${input.candidate.sourceRef.sourceEntityId}`);

      return rows.some((row) => {
        return (
          row.dailyAssignmentId === input.dailyAssignmentId &&
          row.parentUserId === input.parentUserId &&
          row.learningItemId === (input.candidate.learningItemId ?? null) &&
          row.itemType === input.candidate.itemType &&
          row.targetWord === (input.candidate.targetWord ?? null) &&
          row.templateKey === (input.candidate.templateKey ?? null) &&
          row.sourceType === input.candidate.sourceRef.sourceType &&
          row.sourceEntityId === input.candidate.sourceRef.sourceEntityId
        );
      });
    },
    async getNextPosition(input) {
      calls.getNextPosition += 1;
      callSequence.push(`getNextPosition:${input.dailyAssignmentId}`);

      const matchingRows = rows.filter(
        (row) =>
          row.dailyAssignmentId === input.dailyAssignmentId &&
          row.parentUserId === input.parentUserId,
      );

      return matchingRows.length;
    },
    async appendItem(input) {
      calls.appendItem += 1;
      callSequence.push(`appendItem:${input.candidate.sourceRef.sourceEntityId}:${input.position}`);

      rows.push({
        dailyAssignmentId: input.dailyAssignmentId,
        parentUserId: input.parentUserId,
        learningItemId: input.candidate.learningItemId ?? null,
        itemType: input.candidate.itemType,
        targetWord: input.candidate.targetWord ?? null,
        templateKey: input.candidate.templateKey ?? null,
        sourceType: input.candidate.sourceRef.sourceType,
        sourceEntityId: input.candidate.sourceRef.sourceEntityId,
      });

      appendCalls.push({
        dailyAssignmentId: input.dailyAssignmentId,
        parentUserId: input.parentUserId,
        candidate: input.candidate,
        position: input.position,
      });

      return {
        id: `assignment-item-${appendCalls.length}`,
        position: input.position,
      };
    },
  };

  return {
    repository,
    calls,
    callSequence,
    appendCalls,
    rows,
  };
}

function testCreatesControlledSpellingCandidateFromCanonicalTruth() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem(),
    catalogEntry: buildCatalogEntry(),
    evidence: buildEvidence(),
  });

  assert.equal(result.status, "candidate");

  if (result.status !== "candidate") {
    throw new Error("Expected candidate result.");
  }

  assert.equal(result.candidate.domainModule, "spelling");
  assert.equal(result.candidate.itemType, "controlled_spelling");
  assert.equal(result.candidate.learningItemId, "learning-item-1");
  assert.equal(result.candidate.templateKey, "T03");
  assert.equal(result.candidate.targetWord, "cat");
  assert.deepEqual(result.candidate.sourceRef, buildEvidence().sourceRef);
  assert.deepEqual(result.candidate.expectedAnswer, {
    correctSpelling: "cat",
  });
  assert.equal(
    (result.candidate.promptData as { microSkillLabel: string }).microSkillLabel,
    "Short /a/ in CVC words",
  );
  assert.deepEqual(
    (result.candidate.promptData as { practiceWords: string[] }).practiceWords,
    ["cat", "map", "sat", "pan"],
  );
  assert.equal(
    (result.candidate.metadata as { parent_verification_id: string })
      .parent_verification_id,
    "verification-1",
  );
}

function testUsesCatalogBackedSpellingDomainWhenLearningItemMetadataOmitsDomain() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      domainModule: null,
      metadata: {},
    }),
    catalogEntry: buildCatalogEntry({
      masteryDomainKey: "D4",
    }),
    evidence: buildEvidence(),
  });

  assert.equal(result.status, "candidate");
}

function testSkipsUnsupportedPracticeRouteExplicitly() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: null,
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "grouped_set_practice",
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "unsupported_practice_route",
  });
}

function testCreatesGroupedSetCandidateFromCatalogMetadataOnly() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      learningItemId: "learning-item-grouped-1",
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
      practiceRoute: "grouped_set_practice",
    }),
    catalogEntry: buildCatalogEntry({
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
      practiceRoute: "grouped_set_practice",
      displayName: "Full CVC sound-to-spelling mapping",
      metadata: {
        teaching_point: "Spell all sounds in order across the whole word.",
        starter_word_bank: [
          { word: "  Map " },
          { word: "cat" },
          { word: "map" },
        ],
        example_words: ["SAT", "cat", " pan ", "SAT"],
      },
    }),
    evidence: buildEvidence({
      learningItemId: "learning-item-grouped-1",
      targetWord: "cat",
      metadata: {
        target_word: "cat",
        verified_template_key: "T03",
        original_suggested_template_key: "T05",
        parent_verification_id: "verification-1",
      },
    }),
  });

  assert.equal(result.status, "candidate");

  if (result.status !== "candidate") {
    throw new Error("Expected grouped-set candidate result.");
  }

  assert.equal(result.candidate.itemType, "controlled_spelling");
  assert.equal(result.candidate.targetWord, "cat");
  assert.equal(
    (result.candidate.promptData as { instruction: string }).instruction,
    "Spell each practice word.",
  );
  assert.deepEqual(
    (result.candidate.promptData as { practiceWords: string[] }).practiceWords,
    ["map", "cat", "sat", "pan"],
  );
  assert.deepEqual(result.candidate.expectedAnswer, {
    correctSpelling: "cat",
    correctSpellings: ["map", "cat", "sat", "pan"],
  });
  assert.equal(
    (result.candidate.metadata as { evidence_id: string }).evidence_id,
    "evidence-1",
  );
}

function testSkipsGroupedSetWhenCatalogMetadataIsMissing() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "grouped_set_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "grouped_set_practice",
      metadata: {
        teaching_point: "Spell all sounds in order across the whole word.",
      },
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_grouped_metadata",
  });
}

function testSkipsGroupedSetWhenWordsCollapseBelowTwoUniqueEntries() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "grouped_set_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "grouped_set_practice",
      metadata: {
        starter_word_bank: [{ word: " Cat " }, { word: "cat" }],
        example_words: ["CAT"],
      },
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "insufficient_grouped_words",
  });
}

function testCreatesContrastCandidateFromCatalogMetadataOnly() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      learningItemId: "learning-item-contrast-1",
      practiceRoute: "contrast_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "contrast_practice",
      metadata: {
        teaching_point: "Listen for the vowel change and spell each word carefully.",
        contrast_word_bank: [" Cat ", "cot", "cat", "cut"],
        starter_word_bank: [{ word: "cot" }, { word: "cut" }],
        example_words: ["CUT", "cat"],
      },
    }),
    evidence: buildEvidence({
      learningItemId: "learning-item-contrast-1",
      targetWord: "cat",
    }),
  });

  assert.equal(result.status, "candidate");

  if (result.status !== "candidate") {
    throw new Error("Expected contrast candidate result.");
  }

  assert.equal(result.candidate.itemType, "controlled_spelling");
  assert.equal(result.candidate.targetWord, "cat");
  assert.equal(
    (result.candidate.promptData as { instruction: string }).instruction,
    "Spell each contrast word.",
  );
  assert.equal(
    (result.candidate.promptData as { contrastWord: string }).contrastWord,
    "cot",
  );
  assert.deepEqual(
    (result.candidate.promptData as { practiceWords: string[] }).practiceWords,
    ["cat", "cot"],
  );
  assert.deepEqual(result.candidate.expectedAnswer, {
    correctSpelling: "cat",
    correctSpellings: ["cat", "cot"],
  });
}

function testSkipsContrastWhenCatalogMetadataIsMissing() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "contrast_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "contrast_practice",
      metadata: {
        teaching_point: "Listen for the vowel change and spell each word carefully.",
      },
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_contrast_metadata",
  });
}

function testSkipsContrastWhenWordsCollapseToNoDistinctPartner() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "contrast_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "contrast_practice",
      metadata: {
        contrast_word_bank: [" Cat ", "cat"],
        starter_word_bank: [{ word: "CAT" }],
        example_words: ["cat"],
      },
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "insufficient_contrast_words",
  });
}

function testCreatesDictationCandidateFromCanonicalTruth() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      learningItemId: "learning-item-dictation-1",
      practiceRoute: "dictation",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "dictation",
      allowedTemplateKeys: ["T03", "DT01", "DT02"],
      metadata: {
        teaching_point:
          "In CVC words, each spoken sound should be represented in order.",
        dictation_template_key: "DT01",
        dictation_support_text: "Say the word clearly, then write the whole word.",
      },
    }),
    evidence: buildEvidence({
      learningItemId: "learning-item-dictation-1",
      targetWord: "cat",
    }),
  });

  assert.equal(result.status, "candidate");

  if (result.status !== "candidate") {
    throw new Error("Expected dictation candidate result.");
  }

  assert.equal(result.candidate.itemType, "controlled_spelling");
  assert.equal(result.candidate.templateKey, "DT01");
  assert.equal(result.candidate.targetWord, "cat");
  assert.deepEqual(result.candidate.expectedAnswer, {
    correctSpelling: "cat",
  });
  assert.deepEqual(result.candidate.sourceRef, buildEvidence().sourceRef);
  assert.deepEqual(result.candidate.promptData, {
    instruction: "Spell the dictation word.",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    microSkillLabel: "Short /a/ in CVC words",
    targetWord: "cat",
    practiceWords: ["cat"],
    supportText: "Say the word clearly, then write the whole word.",
    teachingPoint:
      "In CVC words, each spoken sound should be represented in order.",
  });
}

function testSelectsFirstAllowedDictationTemplateDeterministically() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "dictation",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "dictation",
      allowedTemplateKeys: ["T03", "DT02", "DT01"],
      metadata: {
        dictation_template_keys: ["  DT02 ", "DT01", "DT02", "T03"],
      },
    }),
    evidence: buildEvidence(),
  });

  assert.equal(result.status, "candidate");

  if (result.status !== "candidate") {
    throw new Error("Expected dictation candidate result.");
  }

  assert.equal(result.candidate.templateKey, "DT02");
}

function testSkipsDictationWhenTemplateTruthIsMissing() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "dictation",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "dictation",
      metadata: {
        teaching_point: "Spell the whole word from hearing it once.",
      },
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_template_key",
  });
}

function testSkipsDictationWhenProvenanceAnchorFieldsAreMissing() {
  const missingSourceResult = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "dictation",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "dictation",
      allowedTemplateKeys: ["DT01"],
      metadata: {
        dictation_template_key: "DT01",
      },
    }),
    evidence: buildEvidence({
      sourceRef: null,
    }),
  });

  assert.deepEqual(missingSourceResult, {
    status: "skipped",
    reason: "missing_source_provenance",
  });

  const missingTargetResult = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "dictation",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "dictation",
      allowedTemplateKeys: ["DT01"],
      metadata: {
        dictation_template_key: "DT01",
      },
    }),
    evidence: buildEvidence({
      targetWord: null,
    }),
  });

  assert.deepEqual(missingTargetResult, {
    status: "skipped",
    reason: "missing_target_word",
  });
}

function testSkipsMissingTargetWordExplicitly() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem(),
    catalogEntry: buildCatalogEntry(),
    evidence: buildEvidence({
      targetWord: null,
    }),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_target_word",
  });
}

function testSkipsWhenNoAllowedTemplateMatchesCanonicalEvidence() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem(),
    catalogEntry: buildCatalogEntry({
      allowedTemplateKeys: ["T08"],
    }),
    evidence: buildEvidence({
      verifiedTemplateKey: "T03",
      originalSuggestedTemplateKey: "T05",
    }),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_template_key",
  });
}

function testSkipsMissingSourceProvenanceExplicitly() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem(),
    catalogEntry: buildCatalogEntry(),
    evidence: buildEvidence({
      sourceRef: null,
    }),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_source_provenance",
  });
}

function testSkipsContrastWhenProvenanceAnchorFieldsAreMissing() {
  const missingSourceResult = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "contrast_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "contrast_practice",
      metadata: {
        contrast_word_bank: ["cot", "cut"],
      },
    }),
    evidence: buildEvidence({
      sourceRef: null,
    }),
  });

  assert.deepEqual(missingSourceResult, {
    status: "skipped",
    reason: "missing_source_provenance",
  });

  const missingTargetResult = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      practiceRoute: "contrast_practice",
    }),
    catalogEntry: buildCatalogEntry({
      practiceRoute: "contrast_practice",
      metadata: {
        contrast_word_bank: ["cot", "cut"],
      },
    }),
    evidence: buildEvidence({
      targetWord: null,
    }),
  });

  assert.deepEqual(missingTargetResult, {
    status: "skipped",
    reason: "missing_target_word",
  });
}

function testSkipsWhenNoContractBackedSpellingDomainExists() {
  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem({
      domainModule: null,
      metadata: {},
    }),
    catalogEntry: buildCatalogEntry({
      masteryDomainKey: "D5",
    }),
    evidence: buildEvidence(),
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "unsupported_domain_module",
  });
}

function testPrefersLatestRelevantEvidenceRowOverLatestRowOverall() {
  const rows = [
    buildEvidenceRow({
      id: "evidence-row-2",
      created_at: "2026-05-12T11:00:00.000Z",
      evidence_type: "controlled_practice_success",
      metadata: {
        target_word: "cat",
      },
    }),
    buildEvidenceRow({
      id: "evidence-row-1",
      created_at: "2026-05-12T10:00:00.000Z",
      metadata: {
        source_type: "manual_diagnostic",
        source_entity_id: "manual_diagnostic::cat::cot",
        target_word: "cat",
        verified_template_key: "T03",
      },
    }),
  ];

  const selected = selectStage1d1RelevantEvidenceRows(rows);

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, "evidence-row-1");
}

function testSkipsExplicitlyWhenNoRelevantEvidenceExists() {
  const selected = selectStage1d1RelevantEvidenceRows([
    buildEvidenceRow({
      id: "evidence-row-2",
      metadata: {
        target_word: "cat",
      },
    }),
  ]);

  assert.equal(selected.length, 0);

  const result = createStage1d1AssignmentCandidate({
    learningItem: buildLearningItem(),
    catalogEntry: buildCatalogEntry(),
    evidence: null,
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "missing_evidence",
  });
}

function testSelectStage1d2OrderedCandidatesUsesDocumentedAscendingOrder() {
  const ordered = selectStage1d2OrderedCandidates([
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-2",
        targetWord: "apple",
        templateKey: "T03",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::apple::aple",
          taskSubmissionId: null,
        },
      },
    }),
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-1",
        targetWord: "zebra",
        templateKey: "T03",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::zebra::zebar",
          taskSubmissionId: null,
        },
      },
    }),
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T04",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::apple::aple",
          taskSubmissionId: null,
        },
      },
    }),
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T03",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::apple::aple-2",
          taskSubmissionId: null,
        },
      },
    }),
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T03",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::apple::aple-1",
          taskSubmissionId: null,
        },
      },
    }),
  ]);

  assert.deepEqual(
    ordered.map((candidate) => ({
      learningItemId: candidate.learningItemId,
      targetWord: candidate.targetWord,
      templateKey: candidate.templateKey,
      sourceEntityId: candidate.sourceRef.sourceEntityId,
      itemType: candidate.itemType,
    })),
    [
      {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T03",
        sourceEntityId: "manual_diagnostic::apple::aple-1",
        itemType: "controlled_spelling",
      },
      {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T03",
        sourceEntityId: "manual_diagnostic::apple::aple-2",
        itemType: "controlled_spelling",
      },
      {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T04",
        sourceEntityId: "manual_diagnostic::apple::aple",
        itemType: "controlled_spelling",
      },
      {
        learningItemId: "learning-item-1",
        targetWord: "zebra",
        templateKey: "T03",
        sourceEntityId: "manual_diagnostic::zebra::zebar",
        itemType: "controlled_spelling",
      },
      {
        learningItemId: "learning-item-2",
        targetWord: "apple",
        templateKey: "T03",
        sourceEntityId: "manual_diagnostic::apple::aple",
        itemType: "controlled_spelling",
      },
    ],
  );
}

function testSelectStage1d2OrderedCandidatesIgnoresInputOrder() {
  const firstOrder = [
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-2",
        targetWord: "pear",
        templateKey: "T08",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::pear::per",
          taskSubmissionId: null,
        },
      },
    }),
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T03",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::apple::aple",
          taskSubmissionId: null,
        },
      },
    }),
  ];
  const secondOrder = [...firstOrder].reverse();

  assert.deepEqual(
    selectStage1d2OrderedCandidates(firstOrder),
    selectStage1d2OrderedCandidates(secondOrder),
  );
}

function testSelectStage1d2OrderedCandidatesDoesNotReinterpretSkippedResults() {
  const ordered = selectStage1d2OrderedCandidates([
    buildCandidateResult(),
    {
      status: "skipped",
      reason: "missing_target_word",
    },
  ]);

  assert.equal(ordered.length, 1);
  assert.equal(ordered[0]?.learningItemId, "learning-item-1");
}

async function testAssignmentItemExistsInDailyAssignmentDetectsExactCanonicalMatch() {
  const repository = createAssignmentItemRepositoryFixture([
    {
      dailyAssignmentId: "daily-assignment-1",
      parentUserId: "parent-1",
      learningItemId: "learning-item-1",
      itemType: "controlled_spelling",
      targetWord: "cat",
      templateKey: "T03",
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
    },
  ]);

  const exists = await assignmentItemExistsInDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    parentUserId: "parent-1",
    candidate: buildCandidate(),
    repository,
  });

  assert.equal(exists, true);
  assert.deepEqual(repository.calls, {
    hasMatchingItem: 1,
    getNextPosition: 0,
    appendItem: 0,
  });
}

async function testAssignmentItemExistsInDailyAssignmentRejectsDifferentIdentityField() {
  const repository = createAssignmentItemRepositoryFixture([
    {
      dailyAssignmentId: "daily-assignment-1",
      parentUserId: "parent-1",
      learningItemId: "learning-item-1",
      itemType: "controlled_spelling",
      targetWord: "cat",
      templateKey: "T08",
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
    },
  ]);

  const exists = await assignmentItemExistsInDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    parentUserId: "parent-1",
    candidate: buildCandidate(),
    repository,
  });

  assert.equal(exists, false);
  assert.deepEqual(repository.calls, {
    hasMatchingItem: 1,
    getNextPosition: 0,
    appendItem: 0,
  });
}

async function testAssignmentItemExistsInDailyAssignmentScopesToDestinationHeader() {
  const repository = createAssignmentItemRepositoryFixture([
    {
      dailyAssignmentId: "daily-assignment-2",
      parentUserId: "parent-1",
      learningItemId: "learning-item-1",
      itemType: "controlled_spelling",
      targetWord: "cat",
      templateKey: "T03",
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
    },
  ]);

  const exists = await assignmentItemExistsInDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    parentUserId: "parent-1",
    candidate: buildCandidate(),
    repository,
  });

  assert.equal(exists, false);
  assert.deepEqual(repository.calls, {
    hasMatchingItem: 1,
    getNextPosition: 0,
    appendItem: 0,
  });
}

async function testAssignmentItemExistsInDailyAssignmentUsesAnchorTargetWordForGroupedSetDuplicates() {
  const repository = createAssignmentItemRepositoryFixture([
    {
      dailyAssignmentId: "daily-assignment-1",
      parentUserId: "parent-1",
      learningItemId: "learning-item-grouped-1",
      itemType: "controlled_spelling",
      targetWord: "cat",
      templateKey: "T03",
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
    },
  ]);

  const exists = await assignmentItemExistsInDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    parentUserId: "parent-1",
    candidate: buildGroupedSetCandidate({
      promptData: {
        instruction: "Spell each practice word.",
        microSkillKey: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
        microSkillLabel: "Full CVC sound-to-spelling mapping",
        targetWord: "cat",
        practiceWords: ["sat", "pan", "map", "cat"],
        teachingPoint: "Spell all sounds in order across the whole word.",
      },
      expectedAnswer: {
        correctSpelling: "cat",
        correctSpellings: ["sat", "pan", "map", "cat"],
      },
    }),
    repository,
  });

  assert.equal(exists, true);
  assert.deepEqual(repository.calls, {
    hasMatchingItem: 1,
    getNextPosition: 0,
    appendItem: 0,
  });
}

async function testAppendStage1d2AssignmentItemsFirstRunAppendsInDeterministicOrder() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();

  const appended = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [
      buildCandidateResult({
        candidate: {
          learningItemId: "learning-item-2",
          targetWord: "pear",
          templateKey: "T08",
          sourceRef: {
            sourceType: "manual_diagnostic",
            sourceEntityId: "manual_diagnostic::pear::per",
            taskSubmissionId: null,
          },
        },
      }),
      {
        status: "skipped",
        reason: "missing_target_word",
      },
      buildCandidateResult({
        candidate: {
          learningItemId: "learning-item-1",
          targetWord: "apple",
          templateKey: "T03",
          sourceRef: {
            sourceType: "manual_diagnostic",
            sourceEntityId: "manual_diagnostic::apple::aple-2",
            taskSubmissionId: null,
          },
        },
      }),
      buildCandidateResult({
        candidate: {
          learningItemId: "learning-item-1",
          targetWord: "apple",
          templateKey: "T03",
          sourceRef: {
            sourceType: "manual_diagnostic",
            sourceEntityId: "manual_diagnostic::apple::aple-1",
            taskSubmissionId: null,
          },
        },
      }),
    ],
    repository: fixture.repository,
  });

  assert.deepEqual(
    fixture.appendCalls.map((call) => ({
      sourceEntityId: call.candidate.sourceRef.sourceEntityId,
      position: call.position,
    })),
    [
      {
        sourceEntityId: "manual_diagnostic::apple::aple-1",
        position: 0,
      },
      {
        sourceEntityId: "manual_diagnostic::apple::aple-2",
        position: 1,
      },
      {
        sourceEntityId: "manual_diagnostic::pear::per",
        position: 2,
      },
    ],
  );
  assert.deepEqual(
    appended.map((item) => item.position),
    [0, 1, 2],
  );
}

async function testAppendStage1d2AssignmentItemsSecondRunAppendsZeroDuplicates() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();
  const results = [
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-1",
        targetWord: "apple",
        templateKey: "T03",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::apple::aple",
          taskSubmissionId: null,
        },
      },
    }),
    buildCandidateResult({
      candidate: {
        learningItemId: "learning-item-2",
        targetWord: "pear",
        templateKey: "T08",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual_diagnostic::pear::per",
          taskSubmissionId: null,
        },
      },
    }),
  ] satisfies WritingEngineStage1d1CandidateResult[];

  const firstRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });
  const secondRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });

  assert.equal(firstRun.length, 2);
  assert.equal(secondRun.length, 0);
  assert.equal(fixture.appendCalls.length, 2);
}

async function testAppendStage1d2AssignmentItemsSkippedDuplicatesDoNotConsumePositions() {
  const fixture = createAppendingAssignmentItemRepositoryFixture({
    existingRows: [
      {
        dailyAssignmentId: "daily-assignment-1",
        parentUserId: "parent-1",
        learningItemId: "learning-item-1",
        itemType: "controlled_spelling",
        targetWord: "apple",
        templateKey: "T03",
        sourceType: "manual_diagnostic",
        sourceEntityId: "manual_diagnostic::apple::aple",
      },
    ],
  });

  await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [
      buildCandidateResult({
        candidate: {
          learningItemId: "learning-item-1",
          targetWord: "apple",
          templateKey: "T03",
          sourceRef: {
            sourceType: "manual_diagnostic",
            sourceEntityId: "manual_diagnostic::apple::aple",
            taskSubmissionId: null,
          },
        },
      }),
      buildCandidateResult({
        candidate: {
          learningItemId: "learning-item-2",
          targetWord: "pear",
          templateKey: "T08",
          sourceRef: {
            sourceType: "manual_diagnostic",
            sourceEntityId: "manual_diagnostic::pear::per",
            taskSubmissionId: null,
          },
        },
      }),
    ],
    repository: fixture.repository,
  });

  assert.deepEqual(
    fixture.appendCalls.map((call) => call.position),
    [1],
  );
}

async function testAppendStage1d2AssignmentItemsChecksDuplicatesBeforePositionAssignment() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();

  await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [
      buildCandidateResult({
        candidate: {
          learningItemId: "learning-item-1",
          targetWord: "apple",
          templateKey: "T03",
          sourceRef: {
            sourceType: "manual_diagnostic",
            sourceEntityId: "manual_diagnostic::apple::aple",
            taskSubmissionId: null,
          },
        },
      }),
    ],
    repository: fixture.repository,
  });

  assert.deepEqual(fixture.callSequence, [
    "hasMatchingItem:manual_diagnostic::apple::aple",
    "getNextPosition:daily-assignment-1",
    "appendItem:manual_diagnostic::apple::aple:0",
  ]);
}

async function testAppendStage1d2AssignmentItemsDoesNotCrossDedupeDestinations() {
  const fixture = createAppendingAssignmentItemRepositoryFixture({
    existingRows: [
      {
        dailyAssignmentId: "daily-assignment-2",
        parentUserId: "parent-1",
        learningItemId: "learning-item-1",
        itemType: "controlled_spelling",
        targetWord: "cat",
        templateKey: "T03",
        sourceType: "manual_diagnostic",
        sourceEntityId: "manual_diagnostic::cat::cot",
      },
    ],
  });

  const appended = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [buildCandidateResult()],
    repository: fixture.repository,
  });

  assert.equal(appended.length, 1);
  assert.deepEqual(
    fixture.appendCalls.map((call) => ({
      dailyAssignmentId: call.dailyAssignmentId,
      sourceEntityId: call.candidate.sourceRef.sourceEntityId,
    })),
    [
      {
        dailyAssignmentId: "daily-assignment-1",
        sourceEntityId: "manual_diagnostic::cat::cot",
      },
    ],
  );
}

async function testAppendStage1d2AssignmentItemsFirstRunAppendsGroupedSetCandidateSuccessfully() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();

  const appended = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [buildGroupedSetCandidateResult()],
    repository: fixture.repository,
  });

  assert.equal(appended.length, 1);
  assert.equal(fixture.appendCalls.length, 1);
  assert.deepEqual(fixture.appendCalls[0]?.candidate.promptData, {
    instruction: "Spell each practice word.",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
    microSkillLabel: "Full CVC sound-to-spelling mapping",
    targetWord: "cat",
    practiceWords: ["map", "cat", "sat", "pan"],
    teachingPoint: "Spell all sounds in order across the whole word.",
  });
  assert.deepEqual(fixture.appendCalls[0]?.candidate.expectedAnswer, {
    correctSpelling: "cat",
    correctSpellings: ["map", "cat", "sat", "pan"],
  });
  assert.equal(fixture.appendCalls[0]?.candidate.targetWord, "cat");
}

async function testAssignmentItemExistsInDailyAssignmentUsesAnchorTargetWordForContrastDuplicates() {
  const repository = createAssignmentItemRepositoryFixture([
    {
      dailyAssignmentId: "daily-assignment-1",
      parentUserId: "parent-1",
      learningItemId: "learning-item-contrast-1",
      itemType: "controlled_spelling",
      targetWord: "cat",
      templateKey: "T03",
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
    },
  ]);

  const exists = await assignmentItemExistsInDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    parentUserId: "parent-1",
    candidate: buildContrastCandidate({
      promptData: {
        instruction: "Spell each contrast word.",
        microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
        microSkillLabel: "Short /a/ in CVC words",
        targetWord: "cat",
        practiceWords: ["cat", "cut"],
        contrastWord: "cut",
        teachingPoint:
          "Listen for the vowel change and spell each word carefully.",
      },
      expectedAnswer: {
        correctSpelling: "cat",
        correctSpellings: ["cat", "cut"],
      },
    }),
    repository,
  });

  assert.equal(exists, true);
  assert.deepEqual(repository.calls, {
    hasMatchingItem: 1,
    getNextPosition: 0,
    appendItem: 0,
  });
}

async function testAppendStage1d2AssignmentItemsSecondRunAppendsZeroGroupedSetDuplicates() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();
  const results = [buildGroupedSetCandidateResult()];

  const firstRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });
  const secondRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });

  assert.equal(firstRun.length, 1);
  assert.equal(secondRun.length, 0);
  assert.equal(fixture.appendCalls.length, 1);
}

async function testAppendStage1d2AssignmentItemsFirstRunAppendsContrastCandidateSuccessfully() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();

  const appended = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [buildContrastCandidateResult()],
    repository: fixture.repository,
  });

  assert.equal(appended.length, 1);
  assert.equal(fixture.appendCalls.length, 1);
  assert.deepEqual(fixture.appendCalls[0]?.candidate.promptData, {
    instruction: "Spell each contrast word.",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    microSkillLabel: "Short /a/ in CVC words",
    targetWord: "cat",
    practiceWords: ["cat", "cot"],
    contrastWord: "cot",
    teachingPoint: "Listen for the vowel change and spell each word carefully.",
  });
  assert.deepEqual(fixture.appendCalls[0]?.candidate.expectedAnswer, {
    correctSpelling: "cat",
    correctSpellings: ["cat", "cot"],
  });
  assert.equal(fixture.appendCalls[0]?.candidate.targetWord, "cat");
}

async function testAppendStage1d2AssignmentItemsSecondRunAppendsZeroContrastDuplicates() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();
  const results = [buildContrastCandidateResult()];

  const firstRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });
  const secondRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });

  assert.equal(firstRun.length, 1);
  assert.equal(secondRun.length, 0);
  assert.equal(fixture.appendCalls.length, 1);
}

async function testAssignmentItemExistsInDailyAssignmentUsesAnchorTargetWordForDictationDuplicates() {
  const repository = createAssignmentItemRepositoryFixture([
    {
      dailyAssignmentId: "daily-assignment-1",
      parentUserId: "parent-1",
      learningItemId: "learning-item-dictation-1",
      itemType: "controlled_spelling",
      targetWord: "cat",
      templateKey: "DT01",
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual_diagnostic::cat::cot",
    },
  ]);

  const exists = await assignmentItemExistsInDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    parentUserId: "parent-1",
    candidate: buildDictationCandidate({
      promptData: {
        instruction: "Spell the dictation word.",
        microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
        microSkillLabel: "Short /a/ in CVC words",
        targetWord: "cat",
        practiceWords: ["cat"],
        supportText: "Say the word softly, then write it once.",
        teachingPoint:
          "In CVC words, each spoken sound should be represented in order.",
      },
    }),
    repository,
  });

  assert.equal(exists, true);
  assert.deepEqual(repository.calls, {
    hasMatchingItem: 1,
    getNextPosition: 0,
    appendItem: 0,
  });
}

async function testAppendStage1d2AssignmentItemsFirstRunAppendsDictationCandidateSuccessfully() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();

  const appended = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results: [buildDictationCandidateResult()],
    repository: fixture.repository,
  });

  assert.equal(appended.length, 1);
  assert.equal(fixture.appendCalls.length, 1);
  assert.deepEqual(fixture.appendCalls[0]?.candidate.promptData, {
    instruction: "Spell the dictation word.",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    microSkillLabel: "Short /a/ in CVC words",
    targetWord: "cat",
    practiceWords: ["cat"],
    supportText: "Say the word clearly, then write the whole word.",
    teachingPoint:
      "In CVC words, each spoken sound should be represented in order.",
  });
  assert.deepEqual(fixture.appendCalls[0]?.candidate.expectedAnswer, {
    correctSpelling: "cat",
  });
  assert.equal(fixture.appendCalls[0]?.candidate.targetWord, "cat");
  assert.equal(fixture.appendCalls[0]?.candidate.templateKey, "DT01");
}

async function testAppendStage1d2AssignmentItemsSecondRunAppendsZeroDictationDuplicates() {
  const fixture = createAppendingAssignmentItemRepositoryFixture();
  const results = [buildDictationCandidateResult()];

  const firstRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });
  const secondRun = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: "daily-assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    results,
    repository: fixture.repository,
  });

  assert.equal(firstRun.length, 1);
  assert.equal(secondRun.length, 0);
  assert.equal(fixture.appendCalls.length, 1);
}

async function main() {
  testCreatesControlledSpellingCandidateFromCanonicalTruth();
  testUsesCatalogBackedSpellingDomainWhenLearningItemMetadataOmitsDomain();
  testSkipsUnsupportedPracticeRouteExplicitly();
  testCreatesGroupedSetCandidateFromCatalogMetadataOnly();
  testSkipsGroupedSetWhenCatalogMetadataIsMissing();
  testSkipsGroupedSetWhenWordsCollapseBelowTwoUniqueEntries();
  testCreatesContrastCandidateFromCatalogMetadataOnly();
  testSkipsContrastWhenCatalogMetadataIsMissing();
  testSkipsContrastWhenWordsCollapseToNoDistinctPartner();
  testCreatesDictationCandidateFromCanonicalTruth();
  testSelectsFirstAllowedDictationTemplateDeterministically();
  testSkipsDictationWhenTemplateTruthIsMissing();
  testSkipsDictationWhenProvenanceAnchorFieldsAreMissing();
  testSkipsMissingTargetWordExplicitly();
  testSkipsWhenNoAllowedTemplateMatchesCanonicalEvidence();
  testSkipsMissingSourceProvenanceExplicitly();
  testSkipsContrastWhenProvenanceAnchorFieldsAreMissing();
  testSkipsWhenNoContractBackedSpellingDomainExists();
  testPrefersLatestRelevantEvidenceRowOverLatestRowOverall();
  testSkipsExplicitlyWhenNoRelevantEvidenceExists();
  testSelectStage1d2OrderedCandidatesUsesDocumentedAscendingOrder();
  testSelectStage1d2OrderedCandidatesIgnoresInputOrder();
  testSelectStage1d2OrderedCandidatesDoesNotReinterpretSkippedResults();
  await testAssignmentItemExistsInDailyAssignmentDetectsExactCanonicalMatch();
  await testAssignmentItemExistsInDailyAssignmentRejectsDifferentIdentityField();
  await testAssignmentItemExistsInDailyAssignmentScopesToDestinationHeader();
  await testAssignmentItemExistsInDailyAssignmentUsesAnchorTargetWordForGroupedSetDuplicates();
  await testAssignmentItemExistsInDailyAssignmentUsesAnchorTargetWordForContrastDuplicates();
  await testAppendStage1d2AssignmentItemsFirstRunAppendsInDeterministicOrder();
  await testAppendStage1d2AssignmentItemsSecondRunAppendsZeroDuplicates();
  await testAppendStage1d2AssignmentItemsSkippedDuplicatesDoNotConsumePositions();
  await testAppendStage1d2AssignmentItemsChecksDuplicatesBeforePositionAssignment();
  await testAppendStage1d2AssignmentItemsDoesNotCrossDedupeDestinations();
  await testAppendStage1d2AssignmentItemsFirstRunAppendsGroupedSetCandidateSuccessfully();
  await testAppendStage1d2AssignmentItemsSecondRunAppendsZeroGroupedSetDuplicates();
  await testAppendStage1d2AssignmentItemsFirstRunAppendsContrastCandidateSuccessfully();
  await testAppendStage1d2AssignmentItemsSecondRunAppendsZeroContrastDuplicates();
  await testAssignmentItemExistsInDailyAssignmentUsesAnchorTargetWordForDictationDuplicates();
  await testAppendStage1d2AssignmentItemsFirstRunAppendsDictationCandidateSuccessfully();
  await testAppendStage1d2AssignmentItemsSecondRunAppendsZeroDictationDuplicates();

  console.log("writing-engine-stage1d1-assignment-generation-regression: ok");
}

void main();
