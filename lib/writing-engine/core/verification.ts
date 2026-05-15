import {
  type ParentVerificationRecord,
  type RecordParentVerificationCommand,
  type VerifiedOutcome,
  type WritingEngineSourceMetadata,
} from "../types";

type ParentVerificationPersistenceRecord = {
  id: string;
  child_id: string;
  parent_user_id: string;
  domain_module: ParentVerificationRecord["domainModule"];
  source_type: ParentVerificationRecord["sourceRef"]["sourceType"];
  source_entity_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  suggested_category_code: string | null;
  suggested_micro_skill_key: string | null;
  suggested_template_key: string | null;
  suggestion_payload: Record<string, unknown>;
  decision: ParentVerificationRecord["decision"];
  verified_category_code: string | null;
  verified_micro_skill_key: string | null;
  verified_template_key: string | null;
  verification_notes: string | null;
  metadata: WritingEngineSourceMetadata;
  verified_at: string;
  created_at: string;
  updated_at: string;
};

export type ParentVerificationRepository = {
  insert(
    record: Omit<
      ParentVerificationPersistenceRecord,
      "id" | "created_at" | "updated_at"
    >,
  ): Promise<ParentVerificationPersistenceRecord>;
};

function normaliseSuggestionPayload(command: RecordParentVerificationCommand) {
  return {
    domainModule: command.suggestion.domainModule,
    suggestedCategoryCode: command.suggestion.suggestedCategoryCode,
    suggestedMicroSkillKey: command.suggestion.suggestedMicroSkillKey,
    suggestedTemplateKey: command.suggestion.suggestedTemplateKey,
    confidence: command.suggestion.confidence,
    notes: command.suggestion.notes,
    sourceRef: command.suggestion.sourceRef,
    metadata: command.suggestion.metadata ?? {},
  } satisfies Record<string, unknown>;
}

function toPersistenceRecord(
  command: RecordParentVerificationCommand,
  verifiedAt: string,
) {
  return {
    child_id: command.childId,
    parent_user_id: command.parentUserId,
    domain_module: command.domainModule,
    source_type: command.sourceRef.sourceType,
    source_entity_id: command.sourceRef.sourceEntityId,
    task_submission_id: command.sourceRef.taskSubmissionId ?? null,
    writing_sample_id: command.sourceRef.writingSampleId ?? null,
    suggested_category_code: command.suggestion.suggestedCategoryCode,
    suggested_micro_skill_key: command.suggestion.suggestedMicroSkillKey,
    suggested_template_key: command.suggestion.suggestedTemplateKey,
    suggestion_payload: normaliseSuggestionPayload(command),
    decision: command.decision,
    verified_category_code: command.verifiedCategoryCode ?? null,
    verified_micro_skill_key: command.verifiedMicroSkillKey ?? null,
    verified_template_key: command.verifiedTemplateKey ?? null,
    verification_notes: command.note ?? null,
    metadata: command.metadata ?? {},
    verified_at: verifiedAt,
  };
}

function toDomainRecord(
  persisted: ParentVerificationPersistenceRecord,
  command: RecordParentVerificationCommand,
): ParentVerificationRecord {
  return {
    id: persisted.id,
    childId: persisted.child_id,
    parentUserId: persisted.parent_user_id,
    domainModule: persisted.domain_module,
    sourceRef: {
      sourceType: persisted.source_type,
      sourceEntityId: persisted.source_entity_id,
      taskSubmissionId: persisted.task_submission_id,
      writingSampleId: persisted.writing_sample_id,
      metadata: command.sourceRef.metadata ?? {},
    },
    suggestion: command.suggestion,
    decision: persisted.decision,
    verifiedCategoryCode: persisted.verified_category_code,
    verifiedMicroSkillKey: persisted.verified_micro_skill_key,
    verifiedTemplateKey: persisted.verified_template_key,
    note: persisted.verification_notes,
    metadata: persisted.metadata,
    verifiedAt: persisted.verified_at,
    createdAt: persisted.created_at,
    updatedAt: persisted.updated_at,
  };
}

export function createInMemoryParentVerificationRecord(input: {
  command: RecordParentVerificationCommand;
  verificationId?: string;
  nowIso?: string;
}): ParentVerificationRecord {
  const nowIso = input.nowIso ?? new Date().toISOString();

  return {
    id:
      input.verificationId ??
      `in_memory_verification::${input.command.sourceRef.sourceEntityId}::${input.command.decision}`,
    childId: input.command.childId,
    parentUserId: input.command.parentUserId,
    domainModule: input.command.domainModule,
    sourceRef: input.command.sourceRef,
    suggestion: input.command.suggestion,
    decision: input.command.decision,
    verifiedCategoryCode: input.command.verifiedCategoryCode ?? null,
    verifiedMicroSkillKey: input.command.verifiedMicroSkillKey ?? null,
    verifiedTemplateKey: input.command.verifiedTemplateKey ?? null,
    note: input.command.note ?? null,
    metadata: input.command.metadata ?? {},
    verifiedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function createVerifiedOutcomeFromParentVerification(
  verification: ParentVerificationRecord,
): VerifiedOutcome {
  const shouldUpdateMastery =
    verification.decision === "accepted" || verification.decision === "overridden";

  return {
    verification,
    shouldUpdateMastery,
    categoryCode: shouldUpdateMastery
      ? verification.verifiedCategoryCode ??
        verification.suggestion.suggestedCategoryCode
      : null,
    microSkillKey: shouldUpdateMastery
      ? verification.verifiedMicroSkillKey ??
        verification.suggestion.suggestedMicroSkillKey
      : null,
    templateKey: shouldUpdateMastery
      ? verification.verifiedTemplateKey ??
        verification.suggestion.suggestedTemplateKey
      : null,
    metadata: {
      verification_decision: verification.decision,
      parent_note: verification.note,
      ...verification.metadata,
    },
  };
}

export async function recordParentVerification(input: {
  command: RecordParentVerificationCommand;
  repository: ParentVerificationRepository;
  nowIso?: string;
}) {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const persisted = await input.repository.insert(
    toPersistenceRecord(input.command, nowIso),
  );

  return toDomainRecord(persisted, input.command);
}
