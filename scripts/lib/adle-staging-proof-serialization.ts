import { fingerprintSnapshotValue } from "../../lib/adle/composable-lesson/canonical-fingerprint";
import { COMPOSER_POLICY_V1 } from "../../lib/adle/composer-policy";
import { REVIEW_POLICY_V1 } from "../../lib/adle/review-scheduler";

export function activeAdlePolicyProofProjection() {
  return {
    composerPolicyVersion: COMPOSER_POLICY_V1.composerPolicyVersion,
    schedulePolicyVersion: REVIEW_POLICY_V1.schedulePolicyVersion,
  };
}

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

export function assignmentItemProjectionMismatchPaths(
  expected: readonly Record<string, unknown>[],
  persisted: readonly Record<string, unknown>[],
): string[] {
  const mismatches: string[] = [];
  const serialise = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;
  const visit = (expectedValue: unknown, persistedValue: unknown, path: string): void => {
    if (fingerprintSerializableProofValue(expectedValue) === fingerprintSerializableProofValue(persistedValue)) return;
    const expectedObject = expectedValue !== null && typeof expectedValue === "object";
    const persistedObject = persistedValue !== null && typeof persistedValue === "object";
    if (!expectedObject || !persistedObject || Array.isArray(expectedValue) !== Array.isArray(persistedValue)) {
      mismatches.push(path);
      return;
    }
    if (Array.isArray(expectedValue) && Array.isArray(persistedValue)) {
      const length = Math.max(expectedValue.length, persistedValue.length);
      for (let index = 0; index < length; index += 1) {
        visit(expectedValue[index], persistedValue[index], `${path}[${index}]`);
      }
      return;
    }
    const expectedRecord = expectedValue as Record<string, unknown>;
    const persistedRecord = persistedValue as Record<string, unknown>;
    for (const key of new Set([...Object.keys(expectedRecord), ...Object.keys(persistedRecord)])) {
      visit(expectedRecord[key], persistedRecord[key], path ? `${path}.${key}` : key);
    }
  };
  visit(serialise(expected), serialise(persisted), "");
  return mismatches;
}
