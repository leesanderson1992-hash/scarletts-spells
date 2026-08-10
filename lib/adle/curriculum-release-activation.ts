import type { PersistedCurriculumReleaseAuthorityV2 } from "./composable-lesson/contracts";

export const BASE_WORD_RELEASE_DEPENDENCY_TYPES = [
  "family_membership",
  "teaching_content",
  "teaching_dictionary_closure",
] as const;

export type BaseWordReleaseDependencyType = (typeof BASE_WORD_RELEASE_DEPENDENCY_TYPES)[number];

interface BaseWordFamilyAuthorityMemberCommon {
  memberId: string;
  canonicalWordId: string;
  assignmentEligible: boolean;
  complexityLevel: number | null;
  wordSum: string;
  morphologyParts: unknown[];
  morphologyJoins: unknown[];
  morphologyTransformations: unknown[];
  transformationNotes: string;
  childFriendlyMeaning: string;
}

export interface BaseWordFamilyAuthorityMemberV1 extends BaseWordFamilyAuthorityMemberCommon {
  memberRole: "base" | "authentic_target" | "transfer" | "optional_transfer_check";
}

export interface BaseWordFamilyAuthorityMemberV2 extends BaseWordFamilyAuthorityMemberCommon {
  structuralRole: "base" | "family_member";
  applicableMicroSkillKeys: string[];
  morphologySource: {
    sourceKind: "base_word_family_member" | "approved_repository_analysis";
    sourceId: string;
    sourceFingerprint: string;
    sourceAuthorityKey: string;
  };
}

export type BaseWordFamilyAuthorityMember =
  | BaseWordFamilyAuthorityMemberV1
  | BaseWordFamilyAuthorityMemberV2;

export interface BaseWordFamilyAuthorityFamily {
  familyId: string;
  baseFamilyKey: string;
  baseWordId: string;
  baseMeaning: string;
  etymologyRoute: Record<string, unknown>;
  /** Required and verified for schema v2; absent from historical v1. */
  sourceFingerprint?: string;
  members: BaseWordFamilyAuthorityMember[];
}

export interface BaseWordFamilyAuthorityProjectionV1 {
  schemaVersion: 1;
  microSkillKey: string;
  importBatchId: string;
  families: BaseWordFamilyAuthorityFamily[];
}

/** Cluster-shared family truth. Learner authenticity and assignment role are
 * deliberately absent; exact micro-skill applicability remains reviewed and
 * immutable per member. */
export interface BaseWordFamilyAuthorityProjectionV2 {
  schemaVersion: 2;
  skillClusterKey: "D4_MOR_BASE_WORDS";
  sourceAuthorities: Array<{
    authorityKey: string;
    sourceKind: "teaching_dictionary_import_batch" | "approved_repository_artifact";
    sourceId: string;
    sourceFingerprint: string;
  }>;
  families: BaseWordFamilyAuthorityFamily[];
}

export type BaseWordFamilyAuthorityProjection =
  | BaseWordFamilyAuthorityProjectionV1
  | BaseWordFamilyAuthorityProjectionV2;

export function baseWordFamilyAuthorityAppliesToMicroSkill(
  authority: BaseWordFamilyAuthorityProjection,
  microSkillKey: string,
): boolean {
  return authority.schemaVersion === 1
    ? authority.microSkillKey === microSkillKey
    : authority.families.some((family) => family.members.some((member) =>
      "applicableMicroSkillKeys" in member && member.applicableMicroSkillKeys.includes(microSkillKey),
    ));
}

export function baseWordFamilyMemberAppliesToMicroSkill(
  authority: BaseWordFamilyAuthorityProjection,
  member: BaseWordFamilyAuthorityMember,
  microSkillKey: string,
): boolean {
  return authority.schemaVersion === 1
    ? authority.microSkillKey === microSkillKey
    : "applicableMicroSkillKeys" in member && member.applicableMicroSkillKeys.includes(microSkillKey);
}

export function baseWordFamilyMemberStructuralRole(
  member: BaseWordFamilyAuthorityMember,
): "base" | "family_member" {
  return "structuralRole" in member
    ? member.structuralRole
    : member.memberRole === "base" ? "base" : "family_member";
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
