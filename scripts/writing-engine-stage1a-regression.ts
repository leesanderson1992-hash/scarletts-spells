import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createAssignmentItemCandidate } from "../lib/writing-engine/assignments/candidates";
import { appendAssignmentItemToDailyAssignment } from "../lib/writing-engine/assignments/service";
import { buildParentVerificationRecordedEvent } from "../lib/writing-engine/analytics/events";
import { recordParentVerification } from "../lib/writing-engine/core/verification";
import { buildMasteryEvidenceCommand } from "../lib/writing-engine/mastery/evidence";
import { createOrStrengthenLearningItemFromVerifiedOutcome } from "../lib/writing-engine/mastery/service";
import type {
  AssignmentItemCandidate,
  ParentVerificationRecord,
  VerifiedOutcome,
} from "../lib/writing-engine/types";

async function testParentVerificationPreservesSuggestionAndDecision() {
  const command = {
    childId: "child-1",
    parentUserId: "parent-1",
    domainModule: "spelling" as const,
    sourceRef: {
      sourceType: "manual_diagnostic" as const,
      sourceEntityId: "diagnostic-1",
    },
    suggestion: {
      domainModule: "spelling" as const,
      suggestedCategoryCode: "drop_final_e",
      suggestedMicroSkillKey: "MS_DROP_E_ING",
      suggestedTemplateKey: "drop-e-lesson",
      confidence: 0.82,
      notes: "Likely drop-e before vowel suffix issue.",
      sourceRef: {
        sourceType: "manual_diagnostic" as const,
        sourceEntityId: "diagnostic-1",
      },
    },
    decision: "overridden" as const,
    verifiedCategoryCode: "drop_final_e",
    verifiedMicroSkillKey: "MS_DROP_E_ING",
    verifiedTemplateKey: "drop-e-contrast",
    note: "Parent agreed on the rule but chose the contrast lesson.",
  };

  const verification = await recordParentVerification({
    command,
    repository: {
      async insert(record) {
        return {
          id: "verification-1",
          ...record,
          created_at: "2026-05-11T10:00:00.000Z",
          updated_at: "2026-05-11T10:00:00.000Z",
        };
      },
    },
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(verification.suggestion.suggestedTemplateKey, "drop-e-lesson");
  assert.equal(verification.verifiedTemplateKey, "drop-e-contrast");
  assert.equal(verification.decision, "overridden");
}

function testRejectedSuggestionDoesNotUpdateMastery() {
  const verification = {
    id: "verification-2",
    childId: "child-1",
    parentUserId: "parent-1",
    domainModule: "spelling" as const,
    sourceRef: {
      sourceType: "manual_diagnostic" as const,
      sourceEntityId: "diagnostic-2",
    },
    suggestion: {
      domainModule: "spelling" as const,
      suggestedCategoryCode: "phonic",
      suggestedMicroSkillKey: "MS_AI_AY",
      suggestedTemplateKey: null,
      confidence: 0.44,
      notes: null,
      sourceRef: {
        sourceType: "manual_diagnostic" as const,
        sourceEntityId: "diagnostic-2",
      },
    },
    decision: "false_positive" as const,
    verifiedCategoryCode: null,
    verifiedMicroSkillKey: null,
    verifiedTemplateKey: null,
    note: "Name spelling, not a learning issue.",
    metadata: {},
    verifiedAt: "2026-05-11T10:00:00.000Z",
    createdAt: "2026-05-11T10:00:00.000Z",
    updatedAt: "2026-05-11T10:00:00.000Z",
  } satisfies ParentVerificationRecord;

  const outcome = {
    verification,
    shouldUpdateMastery: false,
    categoryCode: null,
    microSkillKey: null,
    templateKey: null,
  } satisfies VerifiedOutcome;

  assert.equal(buildMasteryEvidenceCommand(outcome), null);
}

async function testVerifiedOutcomeCanStrengthenLearningItem() {
  const outcome = {
    verification: {
      id: "verification-3",
      childId: "child-1",
      parentUserId: "parent-1",
      domainModule: "spelling" as const,
      sourceRef: {
        sourceType: "manual_diagnostic" as const,
        sourceEntityId: "diagnostic-3",
      },
      suggestion: {
        domainModule: "spelling" as const,
        suggestedCategoryCode: "drop_final_e",
        suggestedMicroSkillKey: "MS_DROP_E_ING",
        suggestedTemplateKey: "drop-e-lesson",
        confidence: 0.9,
        notes: null,
        sourceRef: {
          sourceType: "manual_diagnostic" as const,
          sourceEntityId: "diagnostic-3",
        },
      },
      decision: "accepted" as const,
      verifiedCategoryCode: "drop_final_e",
      verifiedMicroSkillKey: "MS_DROP_E_ING",
      verifiedTemplateKey: "drop-e-lesson",
      note: null,
      metadata: {},
      verifiedAt: "2026-05-11T10:00:00.000Z",
      createdAt: "2026-05-11T10:00:00.000Z",
      updatedAt: "2026-05-11T10:00:00.000Z",
    },
    shouldUpdateMastery: true,
    categoryCode: "drop_final_e",
    microSkillKey: "MS_DROP_E_ING",
    templateKey: "drop-e-lesson",
  } satisfies VerifiedOutcome;

  let appendedEvidence = 0;
  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome,
    repository: {
      async getMicroSkillCatalogEntry() {
        return {
          microSkillKey: "MS_DROP_E_ING",
          masteryDomainKey: "D4",
          skillFamilyKey: "D4_PG",
          skillClusterKey: "D4_PG_LONG_VOWELS",
          practiceRoute: "word_practice",
          isAssignable: true,
          isActive: true,
        };
      },
      async findActiveLearningItemByMicroSkill() {
        return null;
      },
      async createLearningItem() {
        return { id: "learning-item-1" };
      },
      async touchLearningItem() {
        throw new Error("Should not touch existing item when creating.");
      },
      async appendEvidence() {
        appendedEvidence += 1;
      },
    },
  });

  assert.equal(result.action, "created");
  assert.equal(result.learningItemId, "learning-item-1");
  assert.equal(appendedEvidence, 1);
}

async function testAssignmentItemsAreDomainGeneric() {
  const punctuationOutcome = {
    verification: {
      id: "verification-4",
      childId: "child-1",
      parentUserId: "parent-1",
      domainModule: "punctuation" as const,
      sourceRef: {
        sourceType: "authentic_writing" as const,
        sourceEntityId: "submission-4",
      },
      suggestion: {
        domainModule: "punctuation" as const,
        suggestedCategoryCode: "missing_full_stop",
        suggestedMicroSkillKey: "MS_FULL_STOP_END_SENTENCE",
        suggestedTemplateKey: "punctuation-fix",
        confidence: 0.73,
        notes: null,
        sourceRef: {
          sourceType: "authentic_writing" as const,
          sourceEntityId: "submission-4",
        },
      },
      decision: "accepted" as const,
      verifiedCategoryCode: "missing_full_stop",
      verifiedMicroSkillKey: "MS_FULL_STOP_END_SENTENCE",
      verifiedTemplateKey: "punctuation-fix",
      note: null,
      metadata: {},
      verifiedAt: "2026-05-11T10:00:00.000Z",
      createdAt: "2026-05-11T10:00:00.000Z",
      updatedAt: "2026-05-11T10:00:00.000Z",
    },
    shouldUpdateMastery: true,
    categoryCode: "missing_full_stop",
    microSkillKey: "MS_FULL_STOP_END_SENTENCE",
    templateKey: "punctuation-fix",
  } satisfies VerifiedOutcome;

  const punctuationCandidate = createAssignmentItemCandidate({
    outcome: punctuationOutcome,
    promptData: {
      sentence: "I went to the park",
      instruction: "Add the missing end punctuation.",
    },
    expectedAnswer: {
      correctedSentence: "I went to the park.",
    },
  });

  assert.equal(punctuationCandidate.domainModule, "punctuation");
  assert.equal(punctuationCandidate.itemType, "punctuation_correction");
  assert.equal(punctuationCandidate.targetWord, null);
}

async function testAssignmentItemsAppendWithoutWordProgress() {
  const candidate = {
    domainModule: "sentence_boundaries",
    itemType: "sentence_splitting",
    sourceRef: {
      sourceType: "authentic_writing" as const,
      sourceEntityId: "submission-5",
    },
    learningItemId: "learning-item-2",
    templateKey: "sentence-split",
    promptData: {
      text: "I went home it was raining",
    },
    expectedAnswer: {
      correctedText: "I went home. It was raining.",
    },
    status: "ready",
    metadata: {},
  } satisfies AssignmentItemCandidate;

  const appended = await appendAssignmentItemToDailyAssignment({
    dailyAssignmentId: "assignment-1",
    childId: "child-1",
    parentUserId: "parent-1",
    candidate,
    repository: {
      async hasMatchingItem() {
        return false;
      },
      async getNextPosition() {
        return 3;
      },
      async appendItem(input) {
        assert.equal(input.candidate.domainModule, "sentence_boundaries");
        assert.equal(input.position, 3);
        return { id: "assignment-item-1", position: input.position };
      },
    },
  });

  assert.equal(appended.id, "assignment-item-1");
}

function testAnalyticsEventShape() {
  const event = buildParentVerificationRecordedEvent({
    id: "verification-6",
    childId: "child-1",
    parentUserId: "parent-1",
    domainModule: "grammar",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "diagnostic-6",
    },
    suggestion: {
      domainModule: "grammar",
      suggestedCategoryCode: "subject_verb_agreement",
      suggestedMicroSkillKey: "MS_SUBJECT_VERB_AGREEMENT",
      suggestedTemplateKey: "grammar-reteach",
      confidence: 0.6,
      notes: null,
      sourceRef: {
        sourceType: "manual_diagnostic",
        sourceEntityId: "diagnostic-6",
      },
    },
    decision: "accepted",
    verifiedCategoryCode: "subject_verb_agreement",
    verifiedMicroSkillKey: "MS_SUBJECT_VERB_AGREEMENT",
    verifiedTemplateKey: "grammar-reteach",
    note: null,
    metadata: {},
    verifiedAt: "2026-05-11T10:00:00.000Z",
    createdAt: "2026-05-11T10:00:00.000Z",
    updatedAt: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(event.eventType, "parent_verification_recorded");
  assert.equal(event.domainModule, "grammar");
}

function testRetiredRuntimeSurfacesAreGone() {
  const retiredFiles = [
    "app/analyse/actions.ts",
    "app/analyse/analysis.ts",
    "app/analyse/types.ts",
    "app/practice/actions.ts",
    "app/practice/practice-session.tsx",
    "components/analyse-bulk-review.tsx",
    "lib/spelling/ensureDailyAssignment.ts",
    "lib/spelling/generateDailyAssignment.ts",
  ];

  for (const file of retiredFiles) {
    assert.equal(
      fs.existsSync(path.join(process.cwd(), file)),
      false,
      `${file} should be retired in Stage 1A`,
    );
  }
}

function testNoNewCanonicalWordProgressOwnership() {
  const writingEngineFiles = [
    "lib/writing-engine/core/verification.ts",
    "lib/writing-engine/mastery/evidence.ts",
    "lib/writing-engine/mastery/service.ts",
    "lib/writing-engine/assignments/candidates.ts",
    "lib/writing-engine/assignments/service.ts",
    "lib/writing-engine/analytics/events.ts",
  ];

  for (const file of writingEngineFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.equal(
      source.includes("word_progress"),
      false,
      `${file} must not reference word_progress`,
    );
  }
}

async function main() {
  await testParentVerificationPreservesSuggestionAndDecision();
  testRejectedSuggestionDoesNotUpdateMastery();
  await testVerifiedOutcomeCanStrengthenLearningItem();
  await testAssignmentItemsAreDomainGeneric();
  await testAssignmentItemsAppendWithoutWordProgress();
  testAnalyticsEventShape();
  testRetiredRuntimeSurfacesAreGone();
  testNoNewCanonicalWordProgressOwnership();
  console.log("writing-engine Stage 1A regression passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
