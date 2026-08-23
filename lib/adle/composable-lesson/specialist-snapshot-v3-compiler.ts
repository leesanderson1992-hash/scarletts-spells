import { fingerprintSnapshotValue } from "./canonical-fingerprint";
import {
  SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
  SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
  SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
  type CompileCompoundWordSpecialistSnapshotV3Input,
  type CompiledCompoundWordSpecialistSnapshotV3,
  type SpecialistCanonicalActivitySnapshotV3,
  type SpecialistSnapshotAuthorityV3,
  type SpecialistSnapshotItemBindingV3,
} from "./specialist-snapshot-v3-contracts";
import { validateCompiledSpecialistSnapshotV3 } from "./specialist-snapshot-v3-validator";

function binding(
  input: CompileCompoundWordSpecialistSnapshotV3Input,
  activityId: string,
): SpecialistSnapshotItemBindingV3 {
  const item = input.items.find((candidate) => candidate.promptData.compoundWordActivityId === activityId);
  if (!item) throw new Error(`compileCompoundWordSpecialistSnapshotV3:missing_item:${activityId}`);
  return {
    sourceEntityId: item.sourceEntityId,
    position: item.position,
    inputSource: "assignment_items.prompt_data",
  };
}

function authorities(input: CompileCompoundWordSpecialistSnapshotV3Input): SpecialistSnapshotAuthorityV3[] {
  const release = input.releaseAuthority;
  return [
    { authorityType: "release_manifest", authorityId: release.releaseManifestId, version: release.releaseKey, sourceHash: release.releaseManifestSha256 },
    { authorityType: "activation_revision", authorityId: release.activationRevisionId, version: "1", sourceHash: release.releaseManifestSha256 },
    { authorityType: "dependency_set", authorityId: release.releaseManifestId, version: "1", sourceHash: release.dependencyFingerprint },
    { authorityType: "compound_structure", authorityId: release.structureAuthorityId, version: "1", sourceHash: release.structureAuthorityFingerprint },
    { authorityType: "teaching_content", authorityId: release.teachingContentAuthorityId, version: input.payload.contentVersion, sourceHash: release.teachingContentAuthorityFingerprint },
    { authorityType: "teaching_dictionary_closure", authorityId: release.dictionaryClosureAuthorityId, version: "1", sourceHash: release.dictionaryClosureAuthorityFingerprint },
    { authorityType: "recipe_content", authorityId: `${input.payload.microSkillKey}:compound_word_lab:v2`, version: input.payload.contentVersion, sourceHash: release.teachingContentAuthorityFingerprint },
  ];
}

function activities(input: CompileCompoundWordSpecialistSnapshotV3Input): SpecialistCanonicalActivitySnapshotV3[] {
  const resolved = input.payload;
  const wordIds = resolved.words.map((word) => word.canonicalWordId);
  const introBindings = [binding(input, "intro-root"), binding(input, "intro-words")];
  let order = 0;
  const activity = (
    value: Omit<SpecialistCanonicalActivitySnapshotV3, "contractVersion" | "order">,
  ): SpecialistCanonicalActivitySnapshotV3 => ({ contractVersion: 3, order: ++order, ...value });
  return [
    activity({
      activityId: "teaching-pages",
      label: "Teaching Pages",
      sectionKey: "lesson_intro",
      canonical: { concept: "INTRODUCTION", mode: "teaching_page", contractVersion: 1 },
      payload: { config: resolved.teaching },
      itemBindings: introBindings,
      wordSnapshotIds: wordIds,
      ownership: "assignment_items",
    }),
    activity({
      activityId: "compound-jigsaw",
      label: "Jigsaw",
      sectionKey: "guided_practice",
      canonical: { concept: "COMPOUND_JIGSAW", mode: "jigsaw_multi_target", contractVersion: 1 },
      payload: {
        targets: resolved.words.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          word: word.displayWord,
          components: word.components,
          joins: word.joins,
        })),
      },
      itemBindings: resolved.words.map((word) => binding(input, `jigsaw-${word.canonicalWordId}`)),
      wordSnapshotIds: wordIds,
      ownership: "assignment_items",
    }),
    activity({
      activityId: "meaning-match",
      label: "Meaning",
      sectionKey: "guided_practice",
      canonical: { concept: "MEANING_MATCH", mode: "component_clues", contractVersion: 1 },
      payload: {
        targets: resolved.words.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          word: word.displayWord,
          audioText: word.audioText,
          definition: word.childFriendlyDefinition,
          componentMeanings: word.componentMeanings,
          componentToWholeRelationship: word.componentToWholeRelationship,
        })),
      },
      itemBindings: resolved.words.map((word) => binding(input, `meaning-${word.canonicalWordId}`)),
      wordSnapshotIds: wordIds,
      ownership: "assignment_items",
    }),
    ...resolved.words.map((word) => activity({
      activityId: `cover-${word.canonicalWordId}`,
      label: "Cover Check",
      sectionKey: "lesson_production",
      canonical: { concept: "COVER_CHECK", mode: "whole_word", contractVersion: 1 },
      payload: {
        canonicalWordId: word.canonicalWordId,
        word: word.displayWord,
        splitPoints: word.splitPoints,
        components: word.components,
      },
      itemBindings: [binding(input, `controlled-${word.canonicalWordId}`)],
      wordSnapshotIds: [word.canonicalWordId],
      ownership: "assignment_items",
    })),
    ...resolved.words.map((word) => activity({
      activityId: `dictation-${word.canonicalWordId}`,
      label: "Sentence Dictation",
      sectionKey: "lesson_dictation",
      canonical: { concept: "DICTATION", mode: "whole_sentence", contractVersion: 1 },
      payload: {
        canonicalWordId: word.canonicalWordId,
        targetWord: word.displayWord,
        sentence: word.dictationSentence,
        audioText: word.audioText,
        targetBinding: word.dictationTargetSpan,
      },
      itemBindings: [binding(input, `dictation-${word.canonicalWordId}`)],
      wordSnapshotIds: [word.canonicalWordId],
      ownership: "assignment_items",
    })),
    activity({
      activityId: "lesson-reflection",
      label: "Lesson Reflection",
      sectionKey: "lesson_reflection",
      canonical: { concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1 },
      payload: {
        promptKey: resolved.reflection.promptKey,
        promptText: resolved.reflection.promptText,
        promptSource: resolved.reflection.source,
      },
      itemBindings: [],
      wordSnapshotIds: wordIds,
      ownership: "route_owned",
    }),
  ];
}

export function fingerprintCompiledSpecialistSnapshotV3(
  snapshot: Omit<CompiledCompoundWordSpecialistSnapshotV3, "provenance"> & {
    provenance: Omit<CompiledCompoundWordSpecialistSnapshotV3["provenance"], "sourceFingerprint">;
  },
): string {
  return fingerprintSnapshotValue(snapshot);
}

export function compileCompoundWordSpecialistSnapshotV3(
  input: CompileCompoundWordSpecialistSnapshotV3Input,
): CompiledCompoundWordSpecialistSnapshotV3 {
  const canonicalActivities = activities(input);
  const wordIds = input.payload.words.map((word) => word.canonicalWordId);
  const base: Omit<CompiledCompoundWordSpecialistSnapshotV3, "provenance"> = {
    snapshotSchemaVersion: 3,
    compilerVersion: SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
    validatorVersion: SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
    canonicalContractRegistryVersion: SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
    route: input.payload.route,
    recipe: input.payload.recipe,
    payload: { kind: "compound_word_lesson_v2", version: 2, resolvedLesson: input.payload },
    runtime: input.payload.runtime,
    assignment: { generationSource: "adle_composer_v1", itemCount: 18 },
    taxonomy: { microSkillKey: input.payload.microSkillKey },
    words: input.payload.sourcePayload.words.lesson.map((word, index) => ({
      wordSnapshotId: word.structure.wholeCanonicalWordId,
      order: index + 1,
      canonicalWordId: word.structure.wholeCanonicalWordId,
      displayWord: word.structure.wholeWord,
      learningItemId: word.lineage.learningItemId,
      lineageKind: word.lineage.kind,
    })),
    activities: canonicalActivities,
    segments: [{ segmentId: "lesson", wordSnapshotIds: wordIds, activityIds: canonicalActivities.map((entry) => entry.activityId) }],
    contentVersions: authorities(input),
  };
  const provenance = {
    sourceKind: "compiled_specialist_assignment" as const,
    fingerprintAlgorithm: "sha256" as const,
    fingerprintVersion: 1 as const,
  };
  const snapshot: CompiledCompoundWordSpecialistSnapshotV3 = {
    ...base,
    provenance: {
      ...provenance,
      sourceFingerprint: fingerprintCompiledSpecialistSnapshotV3({ ...base, provenance }),
    },
  };
  const validation = validateCompiledSpecialistSnapshotV3(snapshot, {
    lessonRouteMetadata: input.header.lessonRouteMetadata,
    assignmentGenerationSource: input.header.assignmentGenerationSource,
    items: input.items.map((item) => ({
      sourceEntityId: item.sourceEntityId,
      position: item.position,
      sectionKey: item.metadata.sectionKey,
      canonicalWordId: item.metadata.canonicalWordId,
      templateKey: item.templateKey,
      targetWord: item.targetWord,
      promptData: item.promptData,
    })),
  });
  if (!validation.ok) {
    throw new Error(`compileCompoundWordSpecialistSnapshotV3:${validation.blockers.map((entry) => entry.code).join(",")}`);
  }
  return snapshot;
}
