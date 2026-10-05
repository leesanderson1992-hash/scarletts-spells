import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { validateAdleCurriculumReleaseManifestV2, type AdleCurriculumReleaseManifestV2 } from "../curriculum-release-authority";
import { ING_MICRO_SKILLS, ING_ROUTE_KEY, ingWordBlockers, type IngDictionaryWordV1 } from "./contracts";
import { compileIngLesson } from "./lesson";

export interface IngReleasePackageV1 {
  schemaVersion: 1;
  activation: "inactive";
  manifest: AdleCurriculumReleaseManifestV2;
  authorities: { authorityKey: string; authorityType: "ing_word_members" | "teaching_content" | "teaching_dictionary_closure"; schemaVersion: 1; semanticProjection: Record<string, unknown>; semanticFingerprint: string }[];
  packageSha256: string;
}

/** Package reviewed facts only. This function cannot publish or activate them. */
export function buildIngReleasePackage(words: readonly IngDictionaryWordV1[], releaseKey: string, approvalRefs: readonly string[]): IngReleasePackageV1 {
  if (!releaseKey.trim() || !approvalRefs.length || approvalRefs.some(ref => !ref.trim())) throw new Error("ing_release_approval_missing");
  if (words.some(word => ingWordBlockers(word).length) || new Set(words.map(word => word.canonicalWordId)).size !== words.length || new Set(words.map(word => word.word)).size !== words.length) throw new Error("ing_release_words_not_reviewed_or_distinct");
  const authorities: IngReleasePackageV1["authorities"] = [];
  for (const skill of ING_MICRO_SKILLS) {
    const members = words.filter(word => word.microSkillKey === skill).sort((a, b) => a.word.localeCompare(b.word, "en-GB") || a.canonicalWordId.localeCompare(b.canonicalWordId));
    if (members.length < 6) throw new Error(`ing_release_six_reviewed_words_required:${skill}`);
    const sample = compileIngLesson({ ok: true, words: members.slice(0, 6).map((word, index) => ({ ...word, learningItemId: index === 0 ? "release:sample" : null })),
      queuedTargets: [{ canonicalWordId: members[0].canonicalWordId, learningItemId: "release:sample" }], deferredLearningItemIds: [] }, `release:${skill}`);
    const projections = [
      { authorityType: "ing_word_members" as const, semanticProjection: { schemaVersion: 1, microSkillKey: skill, words: members } },
      { authorityType: "teaching_content" as const, semanticProjection: { schemaVersion: 1, microSkillKey: skill, sharedPage: sample.teaching.pages[0], rulePage: sample.teaching.pages[1], reflectionPrompt: sample.reflectionPrompt } },
      { authorityType: "teaching_dictionary_closure" as const, semanticProjection: { schemaVersion: 1, microSkillKey: skill, capability: "single_ing_word_audio", words: members.map(word => ({ canonicalWordId: word.canonicalWordId, word: word.word, sentence: word.dictationSentence, audioText: word.audioText })) } },
    ];
    for (const projection of projections) authorities.push({ ...projection, schemaVersion: 1, authorityKey: `${releaseKey}:${skill}:${projection.authorityType}`, semanticFingerprint: fingerprintSnapshotValue(projection.semanticProjection) });
  }
  const manifest: AdleCurriculumReleaseManifestV2 = { schemaVersion: 2, releaseKey,
    route: { routeId: "ing_endings_word_lab", routeVersion: "v1", activationRouteKey: ING_ROUTE_KEY, payloadVersion: 1 }, approvalRefs: [...approvalRefs].sort(),
    microSkills: [...ING_MICRO_SKILLS].sort().map(microSkillKey => ({ microSkillKey, dependencies: authorities.filter(authority => authority.semanticProjection.microSkillKey === microSkillKey)
      .map(authority => ({ authorityKey: authority.authorityKey, authorityType: authority.authorityType, authoritySchemaVersion: authority.schemaVersion as 1, semanticFingerprint: authority.semanticFingerprint })) })) };
  const result = validateAdleCurriculumReleaseManifestV2(manifest);
  if (!result.valid) throw new Error(result.errors.join(","));
  const body = { schemaVersion: 1 as const, activation: "inactive" as const, manifest, authorities };
  return { ...body, packageSha256: fingerprintSnapshotValue(body) };
}
