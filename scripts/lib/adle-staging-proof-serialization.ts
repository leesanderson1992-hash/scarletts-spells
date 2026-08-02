import { fingerprintSnapshotValue } from "../../lib/adle/composable-lesson/canonical-fingerprint";

/** Match the JSONB boundary: optional undefined properties are not persisted. */
export function fingerprintSerializableProofValue(value: unknown): string {
  return fingerprintSnapshotValue(JSON.parse(JSON.stringify(value)) as unknown);
}

type ExpectedAssignmentItem = {
  sourceEntityId: string;
  templateKey: string;
  targetWord: string | null;
  position: number;
  status: string;
  promptData: unknown;
  metadata: unknown;
};

type PersistedAssignmentItem = {
  source_entity_id: string;
  template_key: string;
  target_word: string | null;
  position: number;
  status: string;
  prompt_data: unknown;
  metadata: unknown;
};

export function expectedAssignmentItemProofProjection(item: ExpectedAssignmentItem) {
  return {
    sourceEntityId: item.sourceEntityId,
    templateKey: item.templateKey,
    targetWord: item.targetWord,
    position: item.position,
    status: item.status,
    promptData: item.promptData,
    metadata: item.metadata,
  };
}

export function persistedAssignmentItemProofProjection(item: PersistedAssignmentItem) {
  return {
    sourceEntityId: item.source_entity_id,
    templateKey: item.template_key,
    targetWord: item.target_word,
    position: item.position,
    status: item.status,
    promptData: item.prompt_data,
    metadata: item.metadata,
  };
}
