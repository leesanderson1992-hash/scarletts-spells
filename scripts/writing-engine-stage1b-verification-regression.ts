import assert from "node:assert/strict";

import type { ParentVerificationRepository } from "../lib/writing-engine/core/verification";
import { diagnoseManualSpelling } from "../lib/writing-engine/spelling/manual-diagnostic";
import {
  persistManualSpellingDiagnosticVerification,
  verifyManualSpellingDiagnostic,
} from "../lib/writing-engine/spelling/manual-diagnostic-verification";

function buildDiagnostic() {
  return diagnoseManualSpelling({
    targetWord: "make",
    childSpelling: "mak",
    sentenceContext: "I can make a cake.",
  });
}

function createParentVerificationRepository() {
  const inserted: Array<Record<string, unknown>> = [];

  return {
    inserted,
    repository: {
      async insert(record) {
        inserted.push(record);

        return {
          id: "verification-1",
          ...record,
          created_at: "2026-05-11T10:00:00.000Z",
          updated_at: "2026-05-11T10:00:00.000Z",
        };
      },
    } satisfies ParentVerificationRepository,
  };
}

function testOverriddenWithNoOverrideFieldsIsInvalid() {
  const diagnostic = buildDiagnostic();

  assert.throws(
    () =>
      verifyManualSpellingDiagnostic({
        childId: "child-1",
        parentUserId: "parent-1",
        diagnosticResult: diagnostic,
        decision: "overridden",
        nowIso: "2026-05-11T10:00:00.000Z",
      }),
    /must include at least one meaningful verified override field/i,
  );
}

function testOverriddenWithOnlyParentNoteIsInvalid() {
  const diagnostic = buildDiagnostic();

  assert.throws(
    () =>
      verifyManualSpellingDiagnostic({
        childId: "child-1",
        parentUserId: "parent-1",
        diagnosticResult: diagnostic,
        decision: "overridden",
        note: "Parent disagrees in principle.",
        nowIso: "2026-05-11T10:00:00.000Z",
      }),
    /must include at least one meaningful verified override field/i,
  );
}

function testAcceptedOutcomesPreserveSuggestion() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "accepted",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(result.originalSuggestion, diagnostic.candidateHypothesis);
  assert.equal(
    result.verifiedOutcome.categoryCode,
    diagnostic.candidateHypothesis.suggestedCategoryCode,
  );
  assert.equal(
    result.verifiedOutcome.microSkillKey,
    diagnostic.candidateHypothesis.suggestedMicroSkillKey,
  );
  assert.equal(
    result.verifiedOutcome.templateKey,
    diagnostic.candidateHypothesis.suggestedTemplateKey,
  );
  assert.equal(result.verifiedOutcome.verification.sourceRef.sourceType, "manual_diagnostic");
}

function testAcceptedWithOverrideFieldsIsInvalid() {
  const diagnostic = buildDiagnostic();

  assert.throws(
    () =>
      verifyManualSpellingDiagnostic({
        childId: "child-1",
        parentUserId: "parent-1",
        diagnosticResult: diagnostic,
        decision: "accepted",
        verifiedTemplateKey: "T08",
        nowIso: "2026-05-11T10:00:00.000Z",
      }),
    /accepted manual diagnostic verification cannot include verified override fields/i,
  );
}

function testAcceptedWithParentNoteRemainsValid() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "accepted",
    note: "Parent agrees with the suggestion.",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(result.parentDecision, "accepted");
  assert.equal(
    result.verifiedOutcome.categoryCode,
    diagnostic.candidateHypothesis.suggestedCategoryCode,
  );
  assert.equal(result.verificationRecord.note, "Parent agrees with the suggestion.");
}

function testOverriddenOutcomesUseParentSelectedValues() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "overridden",
    verifiedCategoryCode: "Pattern/rule",
    verifiedMicroSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
    verifiedTemplateKey: "T08",
    note: "Parent wants a contrast lesson first.",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(result.parentDecision, "overridden");
  assert.equal(
    result.parentVerifiedTruth?.microSkillKey,
    "D4_PG_LONG_AI_A_E_CONTRAST",
  );
  assert.equal(result.verifiedOutcome.microSkillKey, "D4_PG_LONG_AI_A_E_CONTRAST");
  assert.equal(result.verifiedOutcome.templateKey, "T08");
}

function testFalsePositiveOutcomesNeverProduceMasteryUpdatingIntent() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "false_positive",
    note: "This was not a real spelling issue.",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
  assert.equal(result.parentVerifiedTruth, null);
}

function testFalsePositiveWithOverrideFieldsIsInvalid() {
  const diagnostic = buildDiagnostic();

  assert.throws(
    () =>
      verifyManualSpellingDiagnostic({
        childId: "child-1",
        parentUserId: "parent-1",
        diagnosticResult: diagnostic,
        decision: "false_positive",
        verifiedMicroSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
        nowIso: "2026-05-11T10:00:00.000Z",
      }),
    /false_positive manual diagnostic verification cannot include verified override fields/i,
  );
}

function testNotALearningIssueOutcomesNeverProduceMasteryUpdatingIntent() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "not_a_learning_issue",
    note: "Known word, no educational follow-up needed.",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
  assert.equal(result.parentVerifiedTruth, null);
}

function testNotALearningIssueWithOverrideFieldsIsInvalid() {
  const diagnostic = buildDiagnostic();

  assert.throws(
    () =>
      verifyManualSpellingDiagnostic({
        childId: "child-1",
        parentUserId: "parent-1",
        diagnosticResult: diagnostic,
        decision: "not_a_learning_issue",
        verifiedCategoryCode: "Pattern/rule",
        nowIso: "2026-05-11T10:00:00.000Z",
      }),
    /not_a_learning_issue manual diagnostic verification cannot include verified override fields/i,
  );
}

function testOriginalSuggestionRemainsAuditable() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "overridden",
    verifiedTemplateKey: "T08",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(
    result.verificationRecord.suggestion.suggestedTemplateKey,
    diagnostic.candidateHypothesis.suggestedTemplateKey,
  );
  assert.equal(result.verificationRecord.verifiedTemplateKey, "T08");
}

function testResultUsesManualDiagnosticSourceType() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "accepted",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.equal(result.sourceType, "manual_diagnostic");
  assert.equal(result.verificationRecord.sourceRef.sourceType, "manual_diagnostic");
  assert.equal(result.verifiedOutcome.verification.sourceRef.sourceType, "manual_diagnostic");
}

function testNoWritesAreIntroduced() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "accepted",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  assert.ok(!("learningItemId" in result));
  assert.ok(!("writingIssueId" in result.verificationRecord.metadata));
  assert.ok(!("evidenceId" in result.verifiedOutcome.metadata!));
  assert.ok(!("persisted" in result));
}

async function testAcceptedPersistencePreservesOriginalSuggestion() {
  const diagnostic = buildDiagnostic();
  const persistence = createParentVerificationRepository();
  const result = await persistManualSpellingDiagnosticVerification({
    verificationInput: {
      childId: "child-1",
      parentUserId: "parent-1",
      diagnosticResult: diagnostic,
      decision: "accepted",
      note: "Parent agrees.",
      nowIso: "2026-05-11T10:00:00.000Z",
    },
    repository: persistence.repository,
  });

  assert.equal(persistence.inserted.length, 1);
  assert.equal(
    result.verificationRecord.suggestion.suggestedTemplateKey,
    diagnostic.candidateHypothesis.suggestedTemplateKey,
  );
  assert.equal(result.verificationRecord.sourceRef.sourceType, "manual_diagnostic");
  assert.equal(result.verifiedOutcome.verification.sourceRef.sourceType, "manual_diagnostic");
}

async function testOverridePersistencePreservesVerifiedFields() {
  const diagnostic = buildDiagnostic();
  const persistence = createParentVerificationRepository();
  const result = await persistManualSpellingDiagnosticVerification({
    verificationInput: {
      childId: "child-1",
      parentUserId: "parent-1",
      diagnosticResult: diagnostic,
      decision: "overridden",
      verifiedCategoryCode: "Pattern/rule",
      verifiedMicroSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
      verifiedTemplateKey: "T08",
      note: "Parent wants a contrast lesson first.",
      nowIso: "2026-05-11T10:00:00.000Z",
    },
    repository: persistence.repository,
  });

  assert.equal(persistence.inserted.length, 1);
  assert.equal(
    result.verificationRecord.verifiedMicroSkillKey,
    "D4_PG_LONG_AI_A_E_CONTRAST",
  );
  assert.equal(result.parentVerifiedTruth?.templateKey, "T08");
  assert.equal(result.verifiedOutcome.templateKey, "T08");
}

async function testRejectedPersistenceDoesNotIntroduceMasteryWrites() {
  const diagnostic = buildDiagnostic();
  const persistence = createParentVerificationRepository();
  const falsePositive = await persistManualSpellingDiagnosticVerification({
    verificationInput: {
      childId: "child-1",
      parentUserId: "parent-1",
      diagnosticResult: diagnostic,
      decision: "false_positive",
      note: "Not a real issue.",
      nowIso: "2026-05-11T10:00:00.000Z",
    },
    repository: persistence.repository,
  });
  const notALearningIssue = await persistManualSpellingDiagnosticVerification({
    verificationInput: {
      childId: "child-1",
      parentUserId: "parent-1",
      diagnosticResult: diagnostic,
      decision: "not_a_learning_issue",
      note: "No educational follow-up needed.",
      nowIso: "2026-05-11T10:00:00.000Z",
    },
    repository: persistence.repository,
  });

  assert.equal(falsePositive.hasMasteryUpdatingIntent, false);
  assert.equal(falsePositive.verifiedOutcome.shouldUpdateMastery, false);
  assert.equal(falsePositive.parentVerifiedTruth, null);
  assert.equal(notALearningIssue.hasMasteryUpdatingIntent, false);
  assert.equal(notALearningIssue.verifiedOutcome.shouldUpdateMastery, false);
  assert.equal(notALearningIssue.parentVerifiedTruth, null);
  assert.equal(persistence.inserted.length, 2);
  assert.ok(!("learningItemId" in falsePositive));
  assert.ok(!("writingIssueId" in falsePositive.verificationRecord.metadata));
  assert.ok(!("evidenceId" in falsePositive.verifiedOutcome.metadata!));
}

async function main() {
  testOverriddenWithNoOverrideFieldsIsInvalid();
  testOverriddenWithOnlyParentNoteIsInvalid();
  testAcceptedOutcomesPreserveSuggestion();
  testAcceptedWithOverrideFieldsIsInvalid();
  testAcceptedWithParentNoteRemainsValid();
  testOverriddenOutcomesUseParentSelectedValues();
  testFalsePositiveOutcomesNeverProduceMasteryUpdatingIntent();
  testFalsePositiveWithOverrideFieldsIsInvalid();
  testNotALearningIssueOutcomesNeverProduceMasteryUpdatingIntent();
  testNotALearningIssueWithOverrideFieldsIsInvalid();
  testOriginalSuggestionRemainsAuditable();
  testResultUsesManualDiagnosticSourceType();
  testNoWritesAreIntroduced();
  await testAcceptedPersistencePreservesOriginalSuggestion();
  await testOverridePersistencePreservesVerifiedFields();
  await testRejectedPersistenceDoesNotIntroduceMasteryWrites();

  console.log("writing-engine-stage1b-verification-regression: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
