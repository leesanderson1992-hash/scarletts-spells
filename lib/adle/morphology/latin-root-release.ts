import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { validateAdleCurriculumReleaseManifestV2, type AdleCurriculumReleaseManifestV2 } from "../curriculum-release-authority";
import { latinRootWordBlocker, LATIN_ROOT_SKILL, type CanonicalLatinRootFamily, type CanonicalLatinRootWord } from "./latin-root-canonical";
import { latinRootTeachingPages } from "./latin-root-teaching-pages";
import { LATIN_ROOT_INTRO_GUIDE } from "./latin-root-introduction";

export function latinRootDictionaryProjection(input: { families: readonly CanonicalLatinRootFamily[]; words: readonly CanonicalLatinRootWord[] }) {
  return { families: [...input.families].sort((a, b) => a.familyKey.localeCompare(b.familyKey)),
    words: [...input.words].filter(word => input.families.some(family => family.familyKey === word.familyKey &&
      word.partOfSpeech !== "root" && !(word.canonicalWordId === family.rootWordId && word.senseId === family.rootSenseId)))
      .sort((a, b) => a.canonicalWordId.localeCompare(b.canonicalWordId) || a.senseId.localeCompare(b.senseId)) };
}
export function latinRootTeachingAuthority() {
  return { pages: latinRootTeachingPages({ id: "shared", families: [] }).pages,
    guide: LATIN_ROOT_INTRO_GUIDE, wordCount: [5, 6], familyCount: [1, 2],
    reflectionPrompt: "How did finding the Latin root help you understand or spell a word?",
    creativeEndings: ["o", "os", "is", "um"], version: "latin_root_word_lab:v1" };
}
export function buildLatinRootReleasePackage(input: {
  releaseKey: string; approvalRefs: string[]; families: readonly CanonicalLatinRootFamily[];
  words: readonly CanonicalLatinRootWord[];
}) {
  if (!input.releaseKey || !input.approvalRefs.length || input.approvalRefs.some(ref => !ref.trim())) throw new Error("latin_root_release_approval_missing");
  const dictionary = latinRootDictionaryProjection(input);
  const familySizes = dictionary.families.map(family => dictionary.words.filter(word => word.familyKey === family.familyKey).length);
  const combinedCapacity = familySizes.sort((a, b) => b - a).slice(0, 2).reduce((sum, count) => sum + count, 0);
  if (!dictionary.families.length || combinedCapacity < 5 || dictionary.families.some(family => dictionary.words.filter(word =>
    word.familyKey === family.familyKey && !latinRootWordBlocker(word, family)).length < 2) ||
    dictionary.words.some(word => {
      const family = dictionary.families.find(f => f.familyKey === word.familyKey);
      return !family || latinRootWordBlocker(word, family);
    })) throw new Error("latin_root_release_dictionary_not_complete");
  const common = { schemaVersion: 1 as const, microSkillKey: LATIN_ROOT_SKILL, routeId: "latin_root_word_lab" as const };
  const projections = [
    { type: "family_membership" as const, projection: { ...common, families: dictionary.families } },
    { type: "teaching_content" as const, projection: { ...common, teaching: latinRootTeachingAuthority() } },
    { type: "teaching_dictionary_closure" as const, projection: { ...common, dictionary, dictionaryFingerprint: fingerprintSnapshotValue(dictionary) } },
  ];
  const authorities = projections.map(({ type, projection }) => ({
    authorityKey: `${input.releaseKey}:${LATIN_ROOT_SKILL}:${type}`, authorityType: type,
    schemaVersion: 1 as const, semanticProjection: projection,
    semanticFingerprint: fingerprintSnapshotValue(projection),
  }));
  const manifest: AdleCurriculumReleaseManifestV2 = { schemaVersion: 2, releaseKey: input.releaseKey,
    route: { routeId: "latin_root_word_lab", routeVersion: "v1", activationRouteKey: "latin_root_word_lab:v1", payloadVersion: 1 },
    approvalRefs: input.approvalRefs, microSkills: [{ microSkillKey: LATIN_ROOT_SKILL, dependencies: authorities.map(authority => ({
      authorityKey: authority.authorityKey, authorityType: authority.authorityType, authoritySchemaVersion: 1,
      semanticFingerprint: authority.semanticFingerprint })) }] };
  const validation = validateAdleCurriculumReleaseManifestV2(manifest);
  if (!validation.valid) throw new Error(`latin_root_release_invalid:${validation.errors.join(",")}`);
  const body = { schemaVersion: 1 as const, activation: "inactive" as const, manifest, authorities };
  return { ...body, packageSha256: fingerprintSnapshotValue(body) };
}
export type LatinRootReleasePackage = ReturnType<typeof buildLatinRootReleasePackage>;

export interface LatinRootDictionaryClosure {
  schemaVersion: 1; microSkillKey: typeof LATIN_ROOT_SKILL; routeId: "latin_root_word_lab";
  dictionary: ReturnType<typeof latinRootDictionaryProjection>; dictionaryFingerprint: string;
}
