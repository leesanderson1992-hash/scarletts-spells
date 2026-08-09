import type { PersistedCurriculumReleaseAuthorityV2 } from "./composable-lesson/contracts";

export const BASE_WORD_RELEASE_DEPENDENCY_TYPES = [
  "family_membership",
  "teaching_content",
  "teaching_dictionary_closure",
] as const;

export type BaseWordReleaseDependencyType = (typeof BASE_WORD_RELEASE_DEPENDENCY_TYPES)[number];

export interface BaseWordFamilyAuthorityMember {
  memberId: string;
  canonicalWordId: string;
  memberRole: "base" | "authentic_target" | "transfer" | "optional_transfer_check";
  assignmentEligible: boolean;
  complexityLevel: number | null;
  wordSum: string;
  morphologyParts: unknown[];
  morphologyJoins: unknown[];
  morphologyTransformations: unknown[];
  transformationNotes: string;
  childFriendlyMeaning: string;
}

export interface BaseWordFamilyAuthorityFamily {
  familyId: string;
  baseFamilyKey: string;
  baseWordId: string;
  baseMeaning: string;
  etymologyRoute: Record<string, unknown>;
  members: BaseWordFamilyAuthorityMember[];
}

export interface BaseWordFamilyAuthorityProjection {
  schemaVersion: 1;
  microSkillKey: string;
  importBatchId: string;
  families: BaseWordFamilyAuthorityFamily[];
}

export interface BaseWordTeachingContentAuthorityProjection {
  schemaVersion: 1;
  microSkillKey: string;
  contentVersionId: string;
  contentVersion: string;
  teachingObjective: string;
  childFriendlyExplanation: string;
  ruleExplanation: string;
  memoryTip: string;
  commonMisconceptions: string;
  firstExposureProgression: unknown[];
  guidedPracticeProgression: unknown[];
  reviewProofreadingProgression: unknown[];
  exampleSelectionGuidance: string;
  contrastPolicyGuidance: string;
}

export interface BaseWordDictionaryClosureWord {
  canonicalWordId: string;
  wordKey: string;
  normalisedWord: string;
  displayWord: string;
  dialectCode: string;
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  audioText: string;
}

export interface ActivatedBaseWordReleaseAuthority {
  activationRevisionId: string;
  environmentKey: string;
  microSkillKey: string;
  releaseManifestId: string;
  releaseKey: string;
  releaseManifestSha256: string;
  dependencyFingerprint: string;
  familyAuthorityId: string;
  familyAuthorityFingerprint: string;
  family: BaseWordFamilyAuthorityProjection;
  teachingContentAuthorityId: string;
  teachingContentAuthorityFingerprint: string;
  teachingContent: BaseWordTeachingContentAuthorityProjection;
  dictionaryClosureAuthorityId: string;
  dictionaryClosureAuthorityFingerprint: string;
  dictionaryWords: BaseWordDictionaryClosureWord[];
}

export function persistedReleaseAuthority(
  authority: ActivatedBaseWordReleaseAuthority,
): PersistedCurriculumReleaseAuthorityV2 {
  return {
    activationRevisionId: authority.activationRevisionId,
    releaseManifestId: authority.releaseManifestId,
    releaseKey: authority.releaseKey,
    releaseManifestSha256: authority.releaseManifestSha256,
    dependencyFingerprint: authority.dependencyFingerprint,
  };
}
