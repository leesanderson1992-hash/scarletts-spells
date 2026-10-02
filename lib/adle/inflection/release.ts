import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { validateAdleCurriculumReleaseManifestV2, type AdleCurriculumReleaseManifestV2 } from "../curriculum-release-authority";
import { adjectiveFamilyBlockers, COMPARATIVE_MICRO_SKILLS, COMPARATIVE_ROUTE_KEY, type AdjectiveFamilyV1 } from "./contracts";
import { comparativeTeachingPages } from "./presentation";
import { DEGREE_RULE_COPY } from "./content";

export interface ComparativeReleasePackageV1 {
  schemaVersion: 1;
  activation: "inactive";
  manifest: AdleCurriculumReleaseManifestV2;
  authorities: { authorityKey: string; authorityType: "adjective_degree_families" | "teaching_content" | "teaching_dictionary_closure"; schemaVersion: 1; semanticProjection: Record<string, unknown>; semanticFingerprint: string }[];
  packageSha256: string;
}
/** Pure packaging only. A reviewer must resolve identities and approve every family. */
export function buildComparativeReleasePackage(families: readonly AdjectiveFamilyV1[], releaseKey: string, approvalRefs: readonly string[]): ComparativeReleasePackageV1 {
  if (!releaseKey.trim() || !approvalRefs.length || approvalRefs.some(ref => !ref.trim())) throw new Error("comparative_release_approval_missing");
  if (families.length !== 24 || new Set(families.map(f => f.familyKey)).size !== 24
    || families.some(f => adjectiveFamilyBlockers(f).length)) throw new Error("comparative_release_requires_24_reviewed_complete_families");
  const authorities: ComparativeReleasePackageV1["authorities"] = [];
  for (const skill of COMPARATIVE_MICRO_SKILLS) {
    const members = families.filter(f => f.microSkillKey === skill);
    if (members.length !== 6 || new Set(members.flatMap(f => f.words.map(w => w.canonicalWordId))).size !== 18) throw new Error("comparative_release_pool_incomplete");
    const sample = { families: [members[0], members[1]] as const, words: members.slice(0, 2).flatMap(f => f.words.map(w => ({ ...w, familyKey: f.familyKey, learningItemId: null }))) };
    const teaching = comparativeTeachingPages(sample);
    const projections = [
      { authorityType: "adjective_degree_families" as const, semanticProjection: { schemaVersion: 1, microSkillKey: skill, families: members } },
      { authorityType: "teaching_content" as const, semanticProjection: { schemaVersion: 1, microSkillKey: skill, sharedPage: teaching.pages[0], rulePage: teaching.pages[1], reflectionPrompt: DEGREE_RULE_COPY[members[0].rule].reflection } },
      { authorityType: "teaching_dictionary_closure" as const, semanticProjection: { schemaVersion: 1, microSkillKey: skill, capability: "paired_degree_word_audio", words: members.flatMap(f => f.words), pairedSentences: members.map(f => f.content.pairedSentence) } },
    ];
    for (const projection of projections) authorities.push({ ...projection, schemaVersion: 1, authorityKey: `${releaseKey}:${skill}:${projection.authorityType}`, semanticFingerprint: fingerprintSnapshotValue(projection.semanticProjection) });
  }
  const manifest: AdleCurriculumReleaseManifestV2 = { schemaVersion: 2, releaseKey,
    route: { routeId: "comparative_superlative_word_lab", routeVersion: "v1", activationRouteKey: COMPARATIVE_ROUTE_KEY, payloadVersion: 1 }, approvalRefs: [...approvalRefs],
    microSkills: [...COMPARATIVE_MICRO_SKILLS].sort().map(microSkillKey => ({ microSkillKey, dependencies: authorities.filter(a => a.semanticProjection.microSkillKey === microSkillKey).map(a => ({ authorityKey: a.authorityKey, authorityType: a.authorityType, authoritySchemaVersion: a.schemaVersion, semanticFingerprint: a.semanticFingerprint })) })) };
  const validation = validateAdleCurriculumReleaseManifestV2(manifest);
  if (!validation.valid) throw new Error(validation.errors.join(","));
  const body = { schemaVersion: 1 as const, activation: "inactive" as const, manifest, authorities };
  return { ...body, packageSha256: fingerprintSnapshotValue(body) };
}
export function comparativeReleasePackageValid(value: unknown): value is ComparativeReleasePackageV1 {
  try {
    const p = value as ComparativeReleasePackageV1;
    if (!p || p.schemaVersion !== 1 || p.activation !== "inactive" || !Array.isArray(p.authorities)) return false;
    const families = p.authorities.filter(a => a.authorityType === "adjective_degree_families").flatMap(a => a.semanticProjection.families as AdjectiveFamilyV1[]);
    return fingerprintSnapshotValue(buildComparativeReleasePackage(families, p.manifest.releaseKey, p.manifest.approvalRefs)) === fingerprintSnapshotValue(p);
  } catch { return false; }
}
