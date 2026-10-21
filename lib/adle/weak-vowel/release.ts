import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { validateAdleCurriculumReleaseManifestV2, type AdleCurriculumReleaseManifestV2 } from "../curriculum-release-authority";
import { WEAK_VOWEL_MICRO_SKILLS } from "../word-lab/weak-vowel-dinner";
import { weakVowelTeaching, type WeakVowelMicroSkill } from "./lesson";

export interface WeakVowelReleasePackageV1 {
  schemaVersion: 1;
  activation: "inactive";
  manifest: AdleCurriculumReleaseManifestV2;
  authorities: Array<{ authorityKey: string; authorityType: "weak_vowel_lesson_content";
    schemaVersion: 1; semanticProjection: { schemaVersion: 1; microSkillKey: WeakVowelMicroSkill;
      teachingTemplate: ReturnType<typeof weakVowelTeaching>; teachingTemplateSha256: string };
    semanticFingerprint: string }>;
  packageSha256: string;
}

/** The release freezes the eight teaching templates. Published word facts stay
 * independent, so a later approved word can join without another code release. */
export function buildWeakVowelReleasePackage(input: { releaseKey: string; approvalRefs: readonly string[] }): WeakVowelReleasePackageV1 {
  if (!input.releaseKey.trim() || !input.approvalRefs.length || input.approvalRefs.some((ref) => !ref.trim()))
    throw new Error("weak_vowel_release_approval_missing");
  const authorities = [...WEAK_VOWEL_MICRO_SKILLS].sort().map((microSkillKey) => {
    const teachingTemplate = weakVowelTeaching(microSkillKey, []);
    const semanticProjection = { schemaVersion: 1 as const, microSkillKey,
      teachingTemplate, teachingTemplateSha256: fingerprintSnapshotValue(teachingTemplate) };
    return { authorityKey: `${input.releaseKey}:${microSkillKey}:weak_vowel_lesson_content`,
      authorityType: "weak_vowel_lesson_content" as const, schemaVersion: 1 as const,
      semanticProjection, semanticFingerprint: fingerprintSnapshotValue(semanticProjection) };
  });
  const manifest: AdleCurriculumReleaseManifestV2 = {
    schemaVersion: 2, releaseKey: input.releaseKey,
    route: { routeId: "weak_vowel_word_lab", routeVersion: "v1", activationRouteKey: "weak_vowel_word_lab:v1", payloadVersion: 1 },
    approvalRefs: [...input.approvalRefs].sort(),
    microSkills: authorities.map((authority) => ({ microSkillKey: authority.semanticProjection.microSkillKey,
      dependencies: [{ authorityKey: authority.authorityKey, authorityType: authority.authorityType,
        authoritySchemaVersion: 1, semanticFingerprint: authority.semanticFingerprint }] })),
  };
  const validation = validateAdleCurriculumReleaseManifestV2(manifest);
  if (!validation.valid) throw new Error(`weak_vowel_release_invalid:${validation.errors.join(",")}`);
  const body = { schemaVersion: 1 as const, activation: "inactive" as const, manifest, authorities };
  return { ...body, packageSha256: fingerprintSnapshotValue(body) };
}
