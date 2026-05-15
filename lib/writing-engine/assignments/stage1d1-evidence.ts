import type {
  WritingEngineSourceRef,
  WritingEngineSourceType,
} from "../types";

type Stage1d1EvidenceRowLike = {
  id: string;
  learning_item_id: string;
  task_submission_id: string | null;
  metadata: Record<string, unknown>;
};

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function buildStage1d1SourceRefFromEvidenceRow(
  row: Stage1d1EvidenceRowLike,
): WritingEngineSourceRef | null {
  const sourceType = readStringMetadata(row.metadata, "source_type");
  const sourceEntityId = readStringMetadata(row.metadata, "source_entity_id");

  if (!sourceType || !sourceEntityId) {
    return null;
  }

  return {
    sourceType: sourceType as WritingEngineSourceType,
    sourceEntityId,
    taskSubmissionId: row.task_submission_id,
  };
}

export function isStage1d1RelevantEvidenceRow(row: Stage1d1EvidenceRowLike) {
  const sourceRef = buildStage1d1SourceRefFromEvidenceRow(row);
  const targetWord = readStringMetadata(row.metadata ?? {}, "target_word");
  const verifiedTemplateKey = readStringMetadata(row.metadata ?? {}, "verified_template_key");
  const originalSuggestedTemplateKey = readStringMetadata(
    row.metadata ?? {},
    "original_suggested_template_key",
  );

  return Boolean(
    sourceRef &&
      targetWord &&
      (verifiedTemplateKey || originalSuggestedTemplateKey),
  );
}

export function selectStage1d1RelevantEvidenceRows<T extends Stage1d1EvidenceRowLike>(rows: T[]) {
  const latestRelevantByLearningItemId = new Map<string, T>();

  for (const row of rows) {
    if (latestRelevantByLearningItemId.has(row.learning_item_id)) {
      continue;
    }

    if (isStage1d1RelevantEvidenceRow(row)) {
      latestRelevantByLearningItemId.set(row.learning_item_id, row);
    }
  }

  return Array.from(latestRelevantByLearningItemId.values());
}
