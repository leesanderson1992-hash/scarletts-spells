import {
  fingerprintSnapshotValue,
} from "../composable-lesson/canonical-fingerprint";
import {
  DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION,
  DYNAMIC_AFFIX_WORD_LAB_PROFILE,
  type DynamicAffixProfile,
  type DynamicAffixSelection,
  type DynamicAffixWord,
} from "./affix-word-lab";
import {
  DYNAMIC_AFFIX_TRANSFER_SELECTION_POLICY_VERSION,
  dynamicAffixSemanticWordKey,
} from "./dynamic-affix-transfer-selection";
import {
  SHARED_AFFIX_COMPILER_VERSION,
  SHARED_AFFIX_FINGERPRINT_VERSION,
  SHARED_AFFIX_PROFILE_VERSION,
} from "./shared-affix-contracts";
import { getSharedAffixProfileMapping } from "./shared-affix-profile-registry";

export const DYNAMIC_AFFIX_ENVIRONMENT_INTEGRITY_FINGERPRINT_CONTRACT =
  "dynamic_affix_environment_integrity_fingerprint_v1" as const;
export const DYNAMIC_AFFIX_SEMANTIC_FINGERPRINT_CONTRACT =
  "shared_affix_profile_semantic_fingerprint_v2" as const;

function compareStableSemanticText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function serialisable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const OPERATIONAL_PROVENANCE_KEYS = new Set([
  "id",
  "row_id",
  "rowId",
  "uuid",
  "canonical_word_id",
  "canonicalWordId",
  "import_batch_id",
  "importBatchId",
  "project_id",
  "projectId",
  "request_id",
  "requestId",
  "deployment_id",
  "deploymentId",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "timestamp",
]);

function semanticProvenance(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticProvenance);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !OPERATIONAL_PROVENANCE_KEYS.has(key))
      .sort(([left], [right]) => compareStableSemanticText(left, right))
      .map(([key, entry]) => [key, semanticProvenance(entry)]),
  );
}

export function projectDynamicAffixSemanticWordV2(word: DynamicAffixWord) {
  return serialisable({
    semanticWordIdentity: {
      dialect: "en-GB",
      normalisedWord: dynamicAffixSemanticWordKey(word),
      displayWord: word.displayWord,
    },
    transferEligible: word.approvedTransfer,
    audioText: word.audioText,
    semanticBaseText: word.semanticBaseText,
    semanticBaseKind: word.semanticBaseKind,
    teachingBaseText: word.teachingBaseText,
    baseMeaning: word.baseMeaning,
    derivedMeaning: word.derivedMeaning,
    meaningGroupId: word.effect,
    affixForm: word.affixVariant,
    affixMeaning: word.affixMeaning ?? null,
    teachingParts: word.parts,
    teachingJoins: word.joins,
    cutPositions: word.splitPoints,
    dictation: {
      sentence: word.dictationSentence,
      targetTokenIndex: word.dictationTargetTokenIndex,
    },
    trueMorphology: {
      parts: word.trueMorphology.parts,
      joins: word.trueMorphology.joins,
      transformations: word.trueMorphology.transformations,
      notes: word.trueMorphology.notes,
      provenance: semanticProvenance(word.trueMorphology.provenance),
    },
  });
}

export function projectDynamicAffixSemanticProfileV2(profile: DynamicAffixProfile) {
  const mapping = getSharedAffixProfileMapping(profile.microSkillKey);
  return {
    profileKey: profile.microSkillKey,
    microSkillKey: profile.microSkillKey,
    route: mapping ? { id: mapping.routeId, version: mapping.routeVersion } : null,
    recipe: mapping ? { key: mapping.recipeKey, version: mapping.recipeVersion } : null,
    productionEligible: profile.productionEnabled,
    position: profile.position,
    forms: mapping?.forms ?? [],
    header: {
      text: profile.affixText,
      label: profile.affixLabel,
      meaning: profile.affixMeaning,
    },
    meaningGroups: profile.meaningBins,
    includeMeaningSort: profile.includeMeaningSort,
    choices: profile.choices,
    introduction: profile.introduction,
    reflection: profile.reflection,
    activityPolicy: mapping?.policy ?? null,
    candidates: [...profile.wordsByCanonicalId.values()]
      .map(projectDynamicAffixSemanticWordV2)
      .sort((left, right) => compareStableSemanticText(
        left.semanticWordIdentity.normalisedWord,
        right.semanticWordIdentity.normalisedWord,
      )),
  };
}

export function projectDynamicAffixSemanticFingerprintV2(
  profiles: readonly DynamicAffixProfile[],
) {
  return {
    contract: DYNAMIC_AFFIX_SEMANTIC_FINGERPRINT_CONTRACT,
    selectionPolicyVersion: DYNAMIC_AFFIX_TRANSFER_SELECTION_POLICY_VERSION,
    compilerContract: {
      sharedCompilerVersion: SHARED_AFFIX_COMPILER_VERSION,
      sharedProfileVersion: SHARED_AFFIX_PROFILE_VERSION,
      sharedFingerprintVersion: SHARED_AFFIX_FINGERPRINT_VERSION,
      publicProfileVersion: DYNAMIC_AFFIX_WORD_LAB_PROFILE,
      publicContentVersion: DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION,
    },
    profiles: profiles
      .map(projectDynamicAffixSemanticProfileV2)
      .sort((left, right) => compareStableSemanticText(left.profileKey, right.profileKey)),
  };
}

export function fingerprintDynamicAffixSemanticProfilesV2(
  profiles: readonly DynamicAffixProfile[],
): string {
  return fingerprintSnapshotValue(projectDynamicAffixSemanticFingerprintV2(profiles));
}

/**
 * Environment integrity intentionally preserves IDs and loader relation order.
 * It is compared only with an earlier fingerprint from the same environment.
 */
export function projectDynamicAffixEnvironmentIntegrityV1(
  profiles: readonly DynamicAffixProfile[],
  operationalIdentity: unknown,
) {
  return {
    contract: DYNAMIC_AFFIX_ENVIRONMENT_INTEGRITY_FINGERPRINT_CONTRACT,
    operationalIdentity,
    profiles: profiles.map((profile) => ({
      profileKey: profile.microSkillKey,
      productionEnabled: profile.productionEnabled,
      memberIds: [...profile.wordsByCanonicalId.keys()],
      memberWords: [...profile.wordsByCanonicalId.values()].map((word) => word.displayWord),
    })),
  };
}

export function fingerprintDynamicAffixEnvironmentIntegrityV1(
  profiles: readonly DynamicAffixProfile[],
  operationalIdentity: unknown,
): string {
  return fingerprintSnapshotValue(
    projectDynamicAffixEnvironmentIntegrityV1(profiles, operationalIdentity),
  );
}

/** Selected order remains semantic after the environment-neutral pool gate. */
export function projectDynamicAffixSemanticSelectionV2(
  selection: DynamicAffixSelection,
) {
  const sourceById = new Map([
    ...selection.authenticTargets.map((item) => [item.canonicalWordId, "authentic"] as const),
    ...selection.transfers.map((word) => [word.canonicalWordId, "transfer"] as const),
  ]);
  return serialisable({
    contract: DYNAMIC_AFFIX_SEMANTIC_FINGERPRINT_CONTRACT,
    selectionPolicyVersion: DYNAMIC_AFFIX_TRANSFER_SELECTION_POLICY_VERSION,
    profileKey: selection.profile.microSkillKey,
    lesson: [
      ...selection.authenticTargets.map((item) => item.canonicalWordId),
      ...selection.transfers.map((word) => word.canonicalWordId),
    ].map((id) => ({
      source: sourceById.get(id),
      word: projectDynamicAffixSemanticWordV2(selection.profile.wordsByCanonicalId.get(id)!),
    })),
  });
}
