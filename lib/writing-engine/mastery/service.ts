import { buildMasteryEvidenceCommand } from "./evidence";
import type {
  LearningItemCommandResult,
  MasteryEvidenceCommand,
  VerifiedOutcome,
  WritingEngineMicroSkillCatalogEntry,
  WritingEnginePracticeRoute,
} from "../types";

export type WritingEngineLearningItemRepository = {
  getMicroSkillCatalogEntry(input: {
    microSkillKey: string;
  }): Promise<WritingEngineMicroSkillCatalogEntry | null>;
  findActiveLearningItemByMicroSkill(input: {
    childId: string;
    parentUserId: string;
    microSkillKey: string;
    practiceRoute: WritingEnginePracticeRoute;
  }): Promise<{ id: string; metadata: Record<string, unknown> } | null>;
  createLearningItem(input: {
    childId: string;
    parentUserId: string;
    microSkillKey: string;
    masteryDomainKey: string;
    skillFamilyKey: string;
    skillClusterKey: string | null;
    practiceRoute: WritingEnginePracticeRoute;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string }>;
  touchLearningItem(input: {
    learningItemId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  appendEvidence(input: {
    learningItemId: string;
    command: MasteryEvidenceCommand;
  }): Promise<void>;
};

function getSkipReason(outcome: VerifiedOutcome) {
  if (!outcome.shouldUpdateMastery) {
    return "verification_rejected_for_mastery";
  }

  if (!outcome.microSkillKey) {
    return "no_verified_mini_skill";
  }

  return "no_evidence_command";
}

function buildLearningItemMetadata(input: {
  outcome: VerifiedOutcome;
  existingMetadata?: Record<string, unknown>;
  reason: "created" | "strengthened";
}) {
  const baseMetadata = input.existingMetadata ?? {};

  return {
    ...baseMetadata,
    parent_verification_id: input.outcome.verification.id,
    verification_decision: input.outcome.verification.decision,
    source_type: input.outcome.verification.sourceRef.sourceType,
    source_entity_id: input.outcome.verification.sourceRef.sourceEntityId,
    created_from_writing_engine_stage: "1C",
    created_from_domain_module: input.outcome.verification.domainModule,
    created_from_source_type: input.outcome.verification.sourceRef.sourceType,
    last_mastery_bridge_action: input.reason,
  };
}

export async function createOrStrengthenLearningItemFromVerifiedOutcome(input: {
  outcome: VerifiedOutcome;
  repository: WritingEngineLearningItemRepository;
}): Promise<LearningItemCommandResult> {
  const evidenceCommand = buildMasteryEvidenceCommand(input.outcome);

  if (!evidenceCommand) {
    return {
      action: "skipped",
      learningItemId: null,
      reason: getSkipReason(input.outcome),
    };
  }

  const catalogEntry = await input.repository.getMicroSkillCatalogEntry({
    microSkillKey: evidenceCommand.microSkillKey,
  });

  if (!catalogEntry || !catalogEntry.isActive) {
    return {
      action: "skipped",
      learningItemId: null,
      reason: "uncatalogued_micro_skill",
    };
  }

  if (!catalogEntry.isAssignable) {
    return {
      action: "skipped",
      learningItemId: null,
      reason: "non_assignable_micro_skill",
    };
  }

  const existing = await input.repository.findActiveLearningItemByMicroSkill({
    childId: input.outcome.verification.childId,
    parentUserId: input.outcome.verification.parentUserId,
    microSkillKey: evidenceCommand.microSkillKey,
    practiceRoute: catalogEntry.practiceRoute,
  });

  if (existing) {
    await input.repository.touchLearningItem({
      learningItemId: existing.id,
      metadata: buildLearningItemMetadata({
        outcome: input.outcome,
        existingMetadata: existing.metadata,
        reason: "strengthened",
      }),
    });
    await input.repository.appendEvidence({
      learningItemId: existing.id,
      command: evidenceCommand,
    });

    return {
      action: "strengthened",
      learningItemId: existing.id,
      reason: null,
    };
  }

  const created = await input.repository.createLearningItem({
    childId: input.outcome.verification.childId,
    parentUserId: input.outcome.verification.parentUserId,
    microSkillKey: evidenceCommand.microSkillKey,
    masteryDomainKey: catalogEntry.masteryDomainKey,
    skillFamilyKey: catalogEntry.skillFamilyKey,
    skillClusterKey: catalogEntry.skillClusterKey,
    practiceRoute: catalogEntry.practiceRoute,
    metadata: buildLearningItemMetadata({
      outcome: input.outcome,
      reason: "created",
    }),
  });
  await input.repository.appendEvidence({
    learningItemId: created.id,
    command: evidenceCommand,
  });

  return {
    action: "created",
    learningItemId: created.id,
    reason: null,
  };
}
