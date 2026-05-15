import assert from "node:assert/strict";

import { diagnoseManualSpelling } from "../lib/writing-engine/spelling/manual-diagnostic";
import type { WritingEngineLearningItemRepository } from "../lib/writing-engine/mastery/service";
import { verifyManualSpellingDiagnostic } from "../lib/writing-engine/spelling/manual-diagnostic-verification";
import { createOrStrengthenLearningItemFromVerifiedOutcome } from "../lib/writing-engine/mastery/service";
import type {
  MasteryEvidenceCommand,
  WritingEngineMicroSkillCatalogEntry,
} from "../lib/writing-engine/types";

type StoredLearningItem = {
  id: string;
  childId: string;
  parentUserId: string;
  microSkillKey: string;
  practiceRoute: string;
  sourceWritingIssueId: string | null;
  metadata: Record<string, unknown>;
};

function buildDiagnostic() {
  return diagnoseManualSpelling({
    targetWord: "make",
    childSpelling: "mak",
    sentenceContext: "I can make a cake.",
  });
}

function buildAcceptedOutcome() {
  const diagnostic = buildDiagnostic();
  const verification = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "accepted",
    nowIso: "2026-05-11T10:00:00.000Z",
  });

  return {
    diagnostic,
    outcome: verification.verifiedOutcome,
  };
}

function createRepository(input?: {
  catalogEntries?: WritingEngineMicroSkillCatalogEntry[];
  existingLearningItems?: StoredLearningItem[];
}) {
  const catalogEntries = new Map(
    (input?.catalogEntries ?? []).map((entry) => [entry.microSkillKey, entry]),
  );
  const learningItems = [...(input?.existingLearningItems ?? [])];
  const createdLearningItems: StoredLearningItem[] = [];
  const touchedLearningItems: Array<{ id: string; metadata: Record<string, unknown> }> =
    [];
  const evidenceRows: Array<{ learningItemId: string; command: MasteryEvidenceCommand }> = [];

  const repository: WritingEngineLearningItemRepository = {
    async getMicroSkillCatalogEntry({ microSkillKey }) {
      return catalogEntries.get(microSkillKey) ?? null;
    },
    async findActiveLearningItemByMicroSkill(input) {
      const existing = learningItems.find(
        (item) =>
          item.childId === input.childId &&
          item.parentUserId === input.parentUserId &&
          item.microSkillKey === input.microSkillKey &&
          item.practiceRoute === input.practiceRoute,
      );

      if (!existing) {
        return null;
      }

      return {
        id: existing.id,
        metadata: existing.metadata,
      };
    },
    async createLearningItem(input) {
      const row = {
        id: `learning-item-${learningItems.length + 1}`,
        childId: input.childId,
        parentUserId: input.parentUserId,
        microSkillKey: input.microSkillKey,
        practiceRoute: input.practiceRoute,
        sourceWritingIssueId: null,
        metadata: input.metadata,
      } satisfies StoredLearningItem;

      learningItems.push(row);
      createdLearningItems.push(row);

      return { id: row.id };
    },
    async touchLearningItem(input) {
      const existing = learningItems.find((item) => item.id === input.learningItemId);

      if (!existing) {
        throw new Error("Missing learning item.");
      }

      existing.metadata = input.metadata;
      touchedLearningItems.push({
        id: input.learningItemId,
        metadata: input.metadata,
      });
    },
    async appendEvidence(input) {
      evidenceRows.push(input);
    },
  };

  return {
    repository,
    createdLearningItems,
    touchedLearningItems,
    evidenceRows,
  };
}

function buildCatalogEntry(microSkillKey: string, overrides?: Partial<WritingEngineMicroSkillCatalogEntry>) {
  return {
    microSkillKey,
    masteryDomainKey: "D4",
    skillFamilyKey: "D4_PG",
    skillClusterKey: "D4_PG_CVC_SHORT_VOWELS",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    ...overrides,
  } satisfies WritingEngineMicroSkillCatalogEntry;
}

async function testAcceptedVerifiedOutcomeCreatesLearningItemAndEvidence() {
  const { diagnostic, outcome } = buildAcceptedOutcome();
  const microSkillKey = outcome.microSkillKey;

  assert.ok(microSkillKey);

  const persistence = createRepository({
    catalogEntries: [buildCatalogEntry(microSkillKey)],
  });

  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome,
    repository: persistence.repository,
  });

  assert.equal(result.action, "created");
  assert.equal(persistence.createdLearningItems.length, 1);
  assert.equal(persistence.evidenceRows.length, 1);
  assert.equal(persistence.createdLearningItems[0].sourceWritingIssueId, null);
  assert.equal(
    persistence.evidenceRows[0].command.sourceContext,
    "parent_verified_manual_diagnostic",
  );
  assert.notEqual(
    persistence.evidenceRows[0].command.sourceContext,
    "finalised_issue_outcome",
  );
  assert.equal(
    persistence.evidenceRows[0].command.metadata.original_suggested_micro_skill_key,
    diagnostic.candidateHypothesis.suggestedMicroSkillKey,
  );
  assert.equal(
    persistence.evidenceRows[0].command.metadata.verified_micro_skill_key,
    outcome.microSkillKey,
  );
}

async function testOverriddenVerifiedOutcomeUsesParentVerifiedMicroSkill() {
  const diagnostic = buildDiagnostic();
  const result = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "overridden",
    verifiedCategoryCode: "Pattern/rule",
    verifiedMicroSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    verifiedTemplateKey: "T08",
    nowIso: "2026-05-11T10:00:00.000Z",
  });
  const persistence = createRepository({
    catalogEntries: [buildCatalogEntry("D4_PG_CVC_SHORT_VOWELS_SHORT_A")],
  });

  const bridgeResult = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome: result.verifiedOutcome,
    repository: persistence.repository,
  });

  assert.equal(bridgeResult.action, "created");
  assert.equal(persistence.createdLearningItems[0].microSkillKey, "D4_PG_CVC_SHORT_VOWELS_SHORT_A");
  assert.equal(
    persistence.evidenceRows[0].command.metadata.original_suggested_micro_skill_key,
    diagnostic.candidateHypothesis.suggestedMicroSkillKey,
  );
  assert.equal(
    persistence.evidenceRows[0].command.metadata.verified_micro_skill_key,
    "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
  );
}

async function testFalsePositiveSkipsMasteryWrites() {
  const diagnostic = buildDiagnostic();
  const verification = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "false_positive",
    nowIso: "2026-05-11T10:00:00.000Z",
  });
  const persistence = createRepository();

  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome: verification.verifiedOutcome,
    repository: persistence.repository,
  });

  assert.equal(result.action, "skipped");
  assert.equal(result.reason, "verification_rejected_for_mastery");
  assert.equal(persistence.createdLearningItems.length, 0);
  assert.equal(persistence.evidenceRows.length, 0);
}

async function testNotALearningIssueSkipsMasteryWrites() {
  const diagnostic = buildDiagnostic();
  const verification = verifyManualSpellingDiagnostic({
    childId: "child-1",
    parentUserId: "parent-1",
    diagnosticResult: diagnostic,
    decision: "not_a_learning_issue",
    nowIso: "2026-05-11T10:00:00.000Z",
  });
  const persistence = createRepository();

  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome: verification.verifiedOutcome,
    repository: persistence.repository,
  });

  assert.equal(result.action, "skipped");
  assert.equal(result.reason, "verification_rejected_for_mastery");
  assert.equal(persistence.createdLearningItems.length, 0);
  assert.equal(persistence.evidenceRows.length, 0);
}

async function testExistingActiveLearningItemIsStrengthenedNotDuplicated() {
  const { outcome } = buildAcceptedOutcome();
  const microSkillKey = outcome.microSkillKey;

  assert.ok(microSkillKey);

  const persistence = createRepository({
    catalogEntries: [buildCatalogEntry(microSkillKey)],
    existingLearningItems: [
      {
        id: "learning-item-existing",
        childId: "child-1",
        parentUserId: "parent-1",
        microSkillKey,
        practiceRoute: "word_practice",
        sourceWritingIssueId: null,
        metadata: { existing: true },
      },
    ],
  });

  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome,
    repository: persistence.repository,
  });

  assert.equal(result.action, "strengthened");
  assert.equal(result.learningItemId, "learning-item-existing");
  assert.equal(persistence.createdLearningItems.length, 0);
  assert.equal(persistence.touchedLearningItems.length, 1);
  assert.equal(persistence.evidenceRows.length, 1);
}

async function testEvidenceMetadataPreservesOriginalSuggestionAndVerifiedTruthSeparately() {
  const { outcome } = buildAcceptedOutcome();
  const microSkillKey = outcome.microSkillKey;

  assert.ok(microSkillKey);

  const persistence = createRepository({
    catalogEntries: [buildCatalogEntry(microSkillKey)],
  });

  await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome,
    repository: persistence.repository,
  });

  const metadata = persistence.evidenceRows[0].command.metadata;

  assert.equal(typeof metadata.original_suggestion, "object");
  assert.equal(typeof metadata.verified_truth, "object");
  assert.equal(
    (metadata.original_suggestion as { microSkillKey: string | null }).microSkillKey,
    outcome.verification.suggestion.suggestedMicroSkillKey,
  );
  assert.equal(
    (metadata.verified_truth as { microSkillKey: string | null }).microSkillKey,
    outcome.microSkillKey,
  );
}

async function testUncataloguedVerifiedMicroSkillIsSkippedExplicitly() {
  const { outcome } = buildAcceptedOutcome();
  const persistence = createRepository();

  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome,
    repository: persistence.repository,
  });

  assert.equal(result.action, "skipped");
  assert.equal(result.reason, "uncatalogued_micro_skill");
  assert.equal(persistence.createdLearningItems.length, 0);
  assert.equal(persistence.evidenceRows.length, 0);
}

async function testNonAssignableVerifiedMicroSkillIsSkippedExplicitly() {
  const { outcome } = buildAcceptedOutcome();
  const microSkillKey = outcome.microSkillKey;

  assert.ok(microSkillKey);

  const persistence = createRepository({
    catalogEntries: [
      buildCatalogEntry(microSkillKey, {
        isAssignable: false,
      }),
    ],
  });

  const result = await createOrStrengthenLearningItemFromVerifiedOutcome({
    outcome,
    repository: persistence.repository,
  });

  assert.equal(result.action, "skipped");
  assert.equal(result.reason, "non_assignable_micro_skill");
  assert.equal(persistence.createdLearningItems.length, 0);
  assert.equal(persistence.evidenceRows.length, 0);
}

async function main() {
  await testAcceptedVerifiedOutcomeCreatesLearningItemAndEvidence();
  await testOverriddenVerifiedOutcomeUsesParentVerifiedMicroSkill();
  await testFalsePositiveSkipsMasteryWrites();
  await testNotALearningIssueSkipsMasteryWrites();
  await testExistingActiveLearningItemIsStrengthenedNotDuplicated();
  await testEvidenceMetadataPreservesOriginalSuggestionAndVerifiedTruthSeparately();
  await testUncataloguedVerifiedMicroSkillIsSkippedExplicitly();
  await testNonAssignableVerifiedMicroSkillIsSkippedExplicitly();

  console.log("writing-engine-stage1c-mastery-bridge-regression: ok");
}

void main();
