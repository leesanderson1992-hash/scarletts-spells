import approval from "@/data/adle/candidates/d4-hom/v4/content-approval.json";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { validateAdleCurriculumReleaseManifestV2, type AdleCurriculumReleaseManifestV2 } from "../curriculum-release-authority";
import { HOMOPHONE_LESSONS, homophoneContentApproved } from "./lesson";

export interface HomophoneReleasePackageV1 {
  schemaVersion: 1;
  activation: "inactive";
  manifest: AdleCurriculumReleaseManifestV2;
  authorities: { authorityKey: string; authorityType: "homophone_lesson_content"; schemaVersion: 1;
    semanticProjection: Record<string, unknown>; semanticFingerprint: string }[];
  packageSha256: string;
}

/** Builds an inactive, reviewed release. Publication and activation are separate. */
export function buildHomophoneReleasePackage(params: { releaseKey: string; approvalRefs: readonly string[];
  canonicalWords: Readonly<Record<string, Readonly<Record<string, string>>>> }): HomophoneReleasePackageV1 {
  if (!homophoneContentApproved() || !params.releaseKey.trim() || !params.approvalRefs.length || params.approvalRefs.some(ref => !ref.trim())) {
    throw new Error("homophone_release_approval_missing");
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const authorities = HOMOPHONE_LESSONS.map(lesson => {
    const canonicalWords = lesson.words.map(({ word }) => ({ word, canonicalWordId: params.canonicalWords[lesson.microSkillKey]?.[word] }));
    if (canonicalWords.some(binding => !uuid.test(binding.canonicalWordId ?? ""))
      || new Set(canonicalWords.map(binding => binding.canonicalWordId)).size !== canonicalWords.length) {
      throw new Error(`homophone_release_canonical_words_missing:${lesson.microSkillKey}`);
    }
    const semanticProjection = { schemaVersion: 1, microSkillKey: lesson.microSkillKey,
      contentVersion: approval.contentVersion, contentSha256: approval.contentSha256,
      imageAssetManifestSha256: approval.imageAssetManifestSha256, lesson, canonicalWords };
    return { authorityKey: `${params.releaseKey}:${lesson.microSkillKey}:homophone_lesson_content`, authorityType: "homophone_lesson_content" as const,
      schemaVersion: 1 as const, semanticProjection, semanticFingerprint: fingerprintSnapshotValue(semanticProjection) };
  });
  const manifest: AdleCurriculumReleaseManifestV2 = { schemaVersion: 2, releaseKey: params.releaseKey,
    route: { routeId: "homophone_word_lab", routeVersion: "v2", activationRouteKey: "homophone_word_lab:v2", payloadVersion: 2 },
    approvalRefs: [...params.approvalRefs].sort(),
    microSkills: authorities.map(authority => ({ microSkillKey: authority.semanticProjection.microSkillKey,
      dependencies: [{ authorityKey: authority.authorityKey, authorityType: authority.authorityType,
        authoritySchemaVersion: 1 as const, semanticFingerprint: authority.semanticFingerprint }] })).sort((a, b) => a.microSkillKey.localeCompare(b.microSkillKey)),
  };
  const validation = validateAdleCurriculumReleaseManifestV2(manifest);
  if (!validation.valid) throw new Error(validation.errors.join(","));
  const body = { schemaVersion: 1 as const, activation: "inactive" as const, manifest, authorities };
  return { ...body, packageSha256: fingerprintSnapshotValue(body) };
}
