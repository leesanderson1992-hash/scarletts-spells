import { fingerprintSnapshotValue } from "./canonical-fingerprint";
import {
  SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
  SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
  SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
  type CompileCompoundWordSpecialistSnapshotV3Input,
  type CompileDynamicAffixSpecialistSnapshotV3Input,
  type CompiledCompoundWordSpecialistSnapshotV3,
  type CompiledDynamicAffixSpecialistSnapshotV3,
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

function dynamicBinding(
  input: CompileDynamicAffixSpecialistSnapshotV3Input,
  bindingId: string,
): SpecialistSnapshotItemBindingV3 {
  const item = input.items.find((candidate) => candidate.promptData.dynamicAffixActivityId === bindingId);
  if (!item) throw new Error(`compileDynamicAffixSpecialistSnapshotV3:missing_item:${bindingId}`);
  return { sourceEntityId: item.sourceEntityId, position: item.position, inputSource: "assignment_items.prompt_data" };
}

function requireSha(value: string | undefined, detail: string): string {
  if (!value || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`compileDynamicAffixSpecialistSnapshotV3:missing_governed_hash:${detail}`);
  }
  return value;
}

function dynamicAuthorities(
  input: CompileDynamicAffixSpecialistSnapshotV3Input,
): SpecialistSnapshotAuthorityV3[] {
  const profile = input.selection.profile;
  if (!profile.governance) throw new Error("compileDynamicAffixSpecialistSnapshotV3:missing_profile_governance");
  const authorities: SpecialistSnapshotAuthorityV3[] = [
    {
      authorityType: "affix_profile_content",
      authorityId: profile.governance.profileId,
      version: `${input.payload.sourcePayload.contentVersion}:import:${profile.governance.importBatchId}`,
      sourceHash: requireSha(profile.governance.sourceRowHash, "profile"),
    },
    {
      authorityType: "shared_affix_source",
      authorityId: profile.microSkillKey,
      version: String(input.compilerDecision.compilerVersion),
      sourceHash: input.compilerDecision.sourceFingerprint
        ?? fingerprintSnapshotValue(input.payload.sourcePayload),
    },
    {
      authorityType: "shared_affix_lesson",
      authorityId: `${profile.microSkillKey}:resolved`,
      version: String(input.compilerDecision.compilerVersion),
      sourceHash: input.compilerDecision.lessonFingerprint
        ?? fingerprintSnapshotValue(input.payload.runtimePayload),
    },
    {
      authorityType: "public_payload",
      authorityId: `${profile.microSkillKey}:dynamic_affix_lesson_v3`,
      version: "3",
      sourceHash: input.compilerDecision.publicFingerprint
        ?? fingerprintSnapshotValue(input.payload.sourcePayload),
    },
    {
      authorityType: "recipe_content",
      authorityId: `${profile.microSkillKey}:dynamic_affix_word_lab:v3`,
      version: input.payload.sourcePayload.contentVersion,
      sourceHash: fingerprintSnapshotValue({
        recipe: input.payload.sourcePayload.experienceProfile,
        resolvedRuntime: input.payload.runtimePayload,
      }),
    },
  ];
  for (const word of input.payload.sourcePayload.words.lesson) {
    const governed = profile.wordsByCanonicalId.get(word.canonicalWordId)?.governance;
    if (!governed) throw new Error(`compileDynamicAffixSpecialistSnapshotV3:missing_word_governance:${word.canonicalWordId}`);
    authorities.push(
      {
        authorityType: "affix_member_content",
        authorityId: governed.memberId,
        version: input.payload.sourcePayload.contentVersion,
        sourceHash: requireSha(governed.memberSourceRowHash, `${word.canonicalWordId}:member`),
      },
      {
        authorityType: "teaching_dictionary_word",
        authorityId: word.canonicalWordId,
        version: input.payload.sourcePayload.contentVersion,
        sourceHash: requireSha(governed.dictionaryWordSourceRowHash, `${word.canonicalWordId}:word`),
      },
      {
        authorityType: "dictation_content",
        authorityId: governed.dictationId,
        version: input.payload.sourcePayload.contentVersion,
        sourceHash: requireSha(governed.dictationSourceRowHash, `${word.canonicalWordId}:dictation`),
      },
    );
  }
  return authorities;
}

function dynamicActivities(
  input: CompileDynamicAffixSpecialistSnapshotV3Input,
): SpecialistCanonicalActivitySnapshotV3[] {
  const resolved = input.payload;
  const runtime = resolved.runtimePayload;
  const source = resolved.sourcePayload;
  const wordIds = source.words.lesson.map((word) => word.canonicalWordId);
  let order = 0;
  const activity = (
    value: Omit<SpecialistCanonicalActivitySnapshotV3, "contractVersion" | "order">,
  ): SpecialistCanonicalActivitySnapshotV3 => ({ contractVersion: 3, order: ++order, ...value });
  const runtimeActivity = (type: string) => {
    const found = runtime.activities.find((candidate) => candidate.type === type);
    if (!found) throw new Error(`compileDynamicAffixSpecialistSnapshotV3:missing_runtime_activity:${type}`);
    return found;
  };
  const discovery = runtimeActivity("discovery");
  const split = runtimeActivity("strip_build");
  const meaning = runtime.activities.find((candidate) => candidate.type === "meaning_sort");
  const build = runtimeActivity("prefix_choice");
  const cover = runtimeActivity("look_cover_write_check");
  const dictation = runtimeActivity("sentence_dictation");
  const reflection = runtimeActivity("reflection");
  return [
    activity({
      activityId: "teaching-pages", label: "Teaching Pages", sectionKey: "lesson_intro",
      canonical: { concept: "INTRODUCTION", mode: "teaching_page", contractVersion: 1 },
      payload: { config: resolved.teaching },
      itemBindings: [dynamicBinding(input, "intro-root"), dynamicBinding(input, "intro-words")],
      wordSnapshotIds: wordIds, ownership: "assignment_items",
    }),
    activity({
      activityId: "discover", label: "Discover", sectionKey: "guided_practice",
      canonical: { concept: "MEANING_DISCOVERY", mode: "suffix", contractVersion: 1 },
      payload: { cards: discovery.discoveryCards ?? [], affixLabel: discovery.prefixLabel, affixPosition: discovery.affixPosition },
      itemBindings: [], wordSnapshotIds: wordIds, ownership: "route_owned",
    }),
    activity({
      activityId: "split", label: "Split", sectionKey: "guided_practice",
      canonical: { concept: "CLEAVER", mode: "find_boundaries", contractVersion: 1 },
      payload: { targets: (split.wordIds ?? []).map((id) => source.words.lesson.find((word) => word.canonicalWordId === id)) },
      itemBindings: split.assignmentBindings.map((id) => dynamicBinding(input, id)),
      wordSnapshotIds: split.wordIds ?? [], ownership: "assignment_items",
    }),
    ...(meaning ? [activity({
      activityId: "meaning", label: "Meaning", sectionKey: "guided_practice",
      canonical: { concept: "MEANING_SORT", mode: meaning.meaningCheckKind === "prefix_form" ? "prefix_form" : "meaning", contractVersion: 1 },
      payload: { wordIds: meaning.wordIds ?? [], bins: meaning.meaningBins ?? [], affixPosition: meaning.affixPosition },
      itemBindings: meaning.assignmentBindings.map((id) => dynamicBinding(input, id)),
      wordSnapshotIds: meaning.wordIds ?? wordIds, ownership: "assignment_items",
    })] : []),
    activity({
      activityId: "build", label: "Build", sectionKey: "guided_practice",
      canonical: { concept: "WORD_ASSEMBLY", mode: "definition_word_builder", contractVersion: 1 },
      payload: { builds: build.builds ?? [] },
      itemBindings: build.assignmentBindings.map((id) => dynamicBinding(input, id)),
      wordSnapshotIds: (build.builds ?? []).map((entry) => entry.canonicalWordId), ownership: "assignment_items",
    }),
    activity({
      activityId: "cover", label: "Cover", sectionKey: "lesson_production",
      canonical: { concept: "COVER_CHECK", mode: cover.coverClosePolicy ? "ratio_close_policy" : "component_marked", contractVersion: 1 },
      payload: { targets: source.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, word: word.displayWord, splitPoints: word.splitPoints, parts: word.parts })) },
      itemBindings: cover.assignmentBindings.map((id) => dynamicBinding(input, id)),
      wordSnapshotIds: wordIds, ownership: "assignment_items",
    }),
    activity({
      activityId: "dictation", label: "Dictate", sectionKey: "lesson_dictation",
      canonical: { concept: "DICTATION", mode: "target_token", contractVersion: 1 },
      payload: { sentences: (dictation.sentences ?? []).map((sentence) => ({ ...sentence, audioText: source.words.lesson.find((word) => word.canonicalWordId === sentence.canonicalWordId)?.audioText })) },
      itemBindings: dictation.assignmentBindings.map((id) => dynamicBinding(input, id)),
      wordSnapshotIds: wordIds, ownership: "assignment_items",
    }),
    activity({
      activityId: "lesson-reflection", label: "Lesson Reflection", sectionKey: "lesson_reflection",
      canonical: { concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1 },
      payload: { promptKey: reflection.promptKey, promptText: reflection.promptText, promptSource: { kind: "resolved_dynamic_affix_runtime", contentVersion: runtime.contentVersion } },
      itemBindings: [], wordSnapshotIds: wordIds, ownership: "route_owned",
    }),
  ];
}

export function compileDynamicAffixSpecialistSnapshotV3(
  input: CompileDynamicAffixSpecialistSnapshotV3Input,
): CompiledDynamicAffixSpecialistSnapshotV3 {
  const activities = dynamicActivities(input);
  const authentic = new Map(input.selection.authenticTargets.map((item) => [item.canonicalWordId, item]));
  const base: Omit<CompiledDynamicAffixSpecialistSnapshotV3, "provenance"> = {
    snapshotSchemaVersion: 3,
    compilerVersion: SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
    validatorVersion: SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
    canonicalContractRegistryVersion: SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
    route: { routeId: "dynamic_affix_word_lab", routeVersion: "v3" },
    recipe: { recipeKey: "dynamic_affix_word_lab", recipeVersion: "v3" },
    payload: { kind: "dynamic_affix_lesson_v3", version: 3, resolvedLesson: input.payload },
    runtime: { adapterKey: "dynamic_affix_v3", rendererKey: "morphology_guided" },
    assignment: { generationSource: "adle_composer_v1", itemCount: input.items.length as 16 | 18 },
    taxonomy: { microSkillKey: input.payload.sourcePayload.microSkillId },
    words: input.payload.sourcePayload.words.lesson.map((word, index) => ({
      wordSnapshotId: word.canonicalWordId,
      order: index + 1,
      canonicalWordId: word.canonicalWordId,
      displayWord: word.displayWord,
      learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null,
      lineageKind: authentic.has(word.canonicalWordId) ? "authentic_target" : "transfer",
    })),
    activities,
    segments: [{ segmentId: "lesson", wordSnapshotIds: input.payload.sourcePayload.words.lesson.map((word) => word.canonicalWordId), activityIds: activities.map((entry) => entry.activityId) }],
    contentVersions: dynamicAuthorities(input),
  };
  const provenance = { sourceKind: "compiled_specialist_assignment" as const, fingerprintAlgorithm: "sha256" as const, fingerprintVersion: 1 as const };
  const snapshot: CompiledDynamicAffixSpecialistSnapshotV3 = {
    ...base,
    provenance: { ...provenance, sourceFingerprint: fingerprintSnapshotValue({ ...base, provenance }) },
  };
  const validation = validateCompiledSpecialistSnapshotV3(snapshot, {
    lessonRouteMetadata: input.header.lessonRouteMetadata,
    assignmentGenerationSource: input.header.assignmentGenerationSource,
    items: input.items.map((item) => ({
      sourceEntityId: item.sourceEntityId, position: item.position,
      sectionKey: item.metadata.sectionKey, canonicalWordId: item.metadata.canonicalWordId,
      templateKey: item.templateKey, targetWord: item.targetWord, promptData: item.promptData,
    })),
  });
  if (!validation.ok) throw new Error(`compileDynamicAffixSpecialistSnapshotV3:${validation.blockers.map((entry) => entry.code).join(",")}`);
  return snapshot;
}
