import type { AssignmentItemDraft } from "../assignment-persistence";
import type {
  ActivityTemplateFact,
  FamilyMethodFact,
  TeachingContentFact,
} from "../daily-assignment-composer";
import {
  GENERIC_ACTIVITY_REQUIREMENTS_VERSION,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION,
  GENERIC_SNAPSHOT_FINGERPRINT_VERSION,
  type ActivitySnapshotV2,
  type CompiledLessonSnapshotV2,
  type GenericSnapshotBlocker,
  type GenericSnapshotCompileInput,
  type GenericSnapshotCompileResult,
  type GenericSnapshotContentKindV2,
  type GenericSnapshotContentVersionV2,
  type GenericSnapshotSectionKeyV2,
  type LessonWordSnapshotV2,
} from "./generic-snapshot-contracts";
import {
  genericSnapshotPartForSection,
  getGenericSnapshotTemplateDefinition,
  resolveGenericTemplateSemantics,
} from "./generic-snapshot-registry";
import {
  fingerprintCompiledLessonSnapshot,
  fingerprintLessonWord,
  validateCompiledGenericLessonSnapshot,
} from "./generic-snapshot-validator";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sectionKey(value: string): GenericSnapshotSectionKeyV2 | null {
  return [
    "review_quick_sort",
    "review_production",
    "review_reflection",
    "lesson_intro",
    "guided_practice",
    "lesson_production",
    "lesson_dictation",
    "lesson_probe",
  ].includes(value) ? value as GenericSnapshotSectionKeyV2 : null;
}

function sourceReference(item: AssignmentItemDraft, fallback: string | null): string | null {
  const bundleId = item.promptData.bundleId;
  return nonEmpty(bundleId) ? bundleId : fallback;
}

function promptWords(item: AssignmentItemDraft): { canonicalWordId: string; targetWord: string }[] | null {
  if (!Array.isArray(item.promptData.words)) return null;
  const words: { canonicalWordId: string; targetWord: string }[] = [];
  for (const value of item.promptData.words) {
    if (
      typeof value !== "object" || value === null ||
      !nonEmpty((value as Record<string, unknown>).canonicalWordId) ||
      !nonEmpty((value as Record<string, unknown>).targetWord)
    ) return null;
    words.push({
      canonicalWordId: (value as Record<string, unknown>).canonicalWordId as string,
      targetWord: (value as Record<string, unknown>).targetWord as string,
    });
  }
  return words;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function compileGenericLessonSnapshot(
  input: GenericSnapshotCompileInput,
): GenericSnapshotCompileResult {
  const { facts, plan, persistence } = input;
  const blockers: GenericSnapshotBlocker[] = [];
  const header = persistence.header;
  const route = header.lessonRouteMetadata;
  if (
    route === null ||
    route.metadataSchemaVersion !== 1 ||
    route.route.routeId !== "generic_composer" || route.route.routeVersion !== "v1" ||
    route.recipe.recipeKey !== "generic_first_exposure" || route.recipe.recipeVersion !== "v1" ||
    route.payload.kind !== "composed_daily_plan" || route.payload.version !== 1
  ) {
    return { ok: false, blockers: [{ code: "snapshot_route_mismatch" }] };
  }
  if (header.assignmentGenerationSource !== "adle_composer_v1") {
    return { ok: false, blockers: [{ code: "snapshot_assignment_source_mismatch" }] };
  }

  const items = [...persistence.items].sort((a, b) => a.position - b.position);
  if (
    items.length === 0 ||
    items.some((item, index) => item.position !== index + 1) ||
    new Set(items.map((item) => item.sourceEntityId)).size !== items.length
  ) {
    return { ok: false, blockers: [{ code: "snapshot_item_count_mismatch" }] };
  }

  const familyMethods = new Map(
    facts.familyMethods.filter((entry) => entry.rowStatus === "active").map((entry) => [entry.familyKey, entry]),
  );
  const templates = new Map(
    facts.activityTemplates.filter((entry) => entry.rowStatus === "active").map((entry) => [entry.templateKey, entry]),
  );
  const dictionary = new Map(facts.dictionary.words.map((entry) => [entry.canonicalWordId, entry]));
  const contentVersions = new Map<string, GenericSnapshotContentVersionV2>();

  const addContent = (
    kind: GenericSnapshotContentKindV2,
    key: string,
    version: string | undefined,
    sourceRowHash: string | null = null,
  ): string | null => {
    if (!nonEmpty(key) || !nonEmpty(version)) {
      blockers.push({ code: "malformed_content_provenance" });
      return null;
    }
    const contentRefId = `${kind}:${key}:${version}`;
    contentVersions.set(contentRefId, { contentRefId, kind, key, version, sourceRowHash });
    return contentRefId;
  };

  const composerRef = addContent("composer_policy", plan.composerPolicyVersion, plan.composerPolicyVersion);
  const scheduleRef = addContent("schedule_policy", plan.schedulePolicyVersion, plan.schedulePolicyVersion);
  const bandingVersion = facts.dictionary.activeBandingVersion.bandingVersion;
  const bandingRef = addContent("banding", bandingVersion, bandingVersion);

  const familyRef = (method: FamilyMethodFact | undefined): string | null =>
    method ? addContent("family_method", method.familyKey, method.contentVersion) : null;
  const templateRef = (template: ActivityTemplateFact | undefined): string | null =>
    template ? addContent("activity_template", template.templateKey, template.contentVersion) : null;
  const teachingRef = (content: TeachingContentFact | undefined): string | null =>
    content ? addContent("teaching_content", content.microSkillKey, content.contentVersion, content.sourceRowHash ?? null) : null;

  const relevantFamilies = new Set<string>();
  const relevantSkills = new Set<string>();
  for (const item of items) {
    if (item.metadata.microSkillKey) {
      relevantSkills.add(item.metadata.microSkillKey);
      const family = facts.skillFamilyKeyBySkill.get(item.metadata.microSkillKey);
      if (family) relevantFamilies.add(family);
    }
    templateRef(templates.get(item.templateKey));
  }
  if (plan.partTwo.microSkillKey) {
    relevantSkills.add(plan.partTwo.microSkillKey);
    const family = facts.skillFamilyKeyBySkill.get(plan.partTwo.microSkillKey);
    if (family) relevantFamilies.add(family);
  }
  for (const family of relevantFamilies) familyRef(familyMethods.get(family));
  for (const skill of relevantSkills) teachingRef(facts.teachingContent.get(skill));

  const words: LessonWordSnapshotV2[] = [];
  const roleOrdinals = new Map<string, number>();
  const addWord = (inputWord: Omit<LessonWordSnapshotV2, "contractVersion" | "wordSnapshotId" | "order" | "factFingerprint"> & { part: "review" | "lesson" }): LessonWordSnapshotV2 => {
    const ordinalKey = `${inputWord.part}:${inputWord.role}`;
    const ordinal = (roleOrdinals.get(ordinalKey) ?? 0) + 1;
    roleOrdinals.set(ordinalKey, ordinal);
    const wordSnapshotId = `${inputWord.part}:${inputWord.role}:${ordinal}:${inputWord.canonicalWordId}`;
    const { part, ...wordFields } = inputWord;
    void part;
    const draft = {
      contractVersion: 2 as const,
      wordSnapshotId,
      order: words.length + 1,
      ...wordFields,
    };
    const word = { ...draft, factFingerprint: fingerprintLessonWord(draft) };
    words.push(word);
    return word;
  };

  const versionRefsFor = (familyKey: string | null, microSkillKey: string | null): string[] => {
    const refs = [bandingRef];
    if (familyKey) refs.push(familyRef(familyMethods.get(familyKey)));
    if (microSkillKey) refs.push(teachingRef(facts.teachingContent.get(microSkillKey)));
    return uniqueSorted(refs.filter(nonEmpty));
  };

  const reviewByCanonical = new Map<string, LessonWordSnapshotV2>();
  for (const item of items.filter((entry) => entry.metadata.sectionKey === "review_production")) {
    const canonicalWordId = item.metadata.canonicalWordId;
    const displayWord = item.targetWord;
    const microSkillKey = item.metadata.microSkillKey;
    const familyKey = microSkillKey ? facts.skillFamilyKeyBySkill.get(microSkillKey) ?? null : null;
    if (!canonicalWordId || !displayWord || !microSkillKey || !familyKey) {
      blockers.push({ code: "word_identity_mismatch", position: item.position, templateKey: item.templateKey });
      continue;
    }
    const word = addWord({
      part: "review",
      canonicalWordId,
      displayWord,
      familyKey,
      microSkillKey,
      learningItemId: null,
      role: "review",
      selectionProvenance: "review_schedule",
      source: { kind: "review_schedule", referenceId: sourceReference(item, null) },
      contentVersionRefs: versionRefsFor(familyKey, microSkillKey),
    });
    reviewByCanonical.set(canonicalWordId, word);
  }

  const lessonByCanonical = new Map<string, LessonWordSnapshotV2>();
  const lessonSkill = plan.partTwo.microSkillKey;
  const lessonFamily = lessonSkill ? facts.skillFamilyKeyBySkill.get(lessonSkill) ?? null : null;
  for (const slot of plan.partTwo.lessonWords) {
    const dictionaryWord = dictionary.get(slot.canonicalWordId);
    if (!dictionaryWord || !lessonSkill || !lessonFamily) {
      blockers.push({ code: "word_identity_mismatch" });
      continue;
    }
    const role = slot.provenance === "stretch" ? "transfer" as const : "authentic_target" as const;
    const sourceKind = slot.provenance === "stretch"
      ? "stretch_intake" as const
      : slot.provenance === "probe_miss"
        ? "probe_miss" as const
        : "learning_item" as const;
    const word = addWord({
      part: "lesson",
      canonicalWordId: slot.canonicalWordId,
      displayWord: dictionaryWord.displayWord,
      familyKey: lessonFamily,
      microSkillKey: lessonSkill,
      learningItemId: slot.learningItemId,
      role,
      selectionProvenance: slot.provenance,
      source: { kind: sourceKind, referenceId: slot.learningItemId },
      contentVersionRefs: versionRefsFor(lessonFamily, lessonSkill),
    });
    lessonByCanonical.set(slot.canonicalWordId, word);
  }

  const probeByCanonical = new Map<string, LessonWordSnapshotV2>();
  for (const [index, canonicalWordId] of (plan.partTwo.probePlan?.canonicalWordIds ?? []).entries()) {
    const dictionaryWord = dictionary.get(canonicalWordId);
    if (!dictionaryWord || !lessonSkill || !lessonFamily) {
      blockers.push({ code: "word_identity_mismatch" });
      continue;
    }
    const word = addWord({
      part: "lesson",
      canonicalWordId,
      displayWord: dictionaryWord.displayWord,
      familyKey: lessonFamily,
      microSkillKey: lessonSkill,
      learningItemId: null,
      role: "probe",
      selectionProvenance: "diagnostic_probe",
      source: { kind: "diagnostic_probe", referenceId: `probe:${lessonSkill}:${index + 1}` },
      contentVersionRefs: versionRefsFor(lessonFamily, lessonSkill),
    });
    probeByCanonical.set(canonicalWordId, word);
  }

  const activities: ActivitySnapshotV2[] = [];
  for (const item of items) {
    const itemSection = sectionKey(item.metadata.sectionKey);
    const definition = getGenericSnapshotTemplateDefinition(item.templateKey);
    if (!itemSection) {
      blockers.push({ code: "item_section_mismatch", position: item.position, templateKey: item.templateKey });
      continue;
    }
    if (!definition) {
      blockers.push({ code: "unsupported_template", position: item.position, templateKey: item.templateKey });
      continue;
    }
    if (definition.compileSupport !== "supported") {
      blockers.push({ code: "unsupported_template_shape", position: item.position, templateKey: item.templateKey });
      continue;
    }
    if (!definition.supportedSections.includes(itemSection)) {
      blockers.push({ code: "item_section_mismatch", position: item.position, templateKey: item.templateKey });
      continue;
    }
    let boundWords: LessonWordSnapshotV2[] = [];
    if (item.templateKey === "REVIEW_QUICK_SORT") {
      const payloadWords = promptWords(item);
      if (!payloadWords) blockers.push({ code: "activity_requirement_failed", position: item.position, templateKey: item.templateKey });
      else boundWords = payloadWords.map((entry) => reviewByCanonical.get(entry.canonicalWordId)).filter((entry): entry is LessonWordSnapshotV2 => Boolean(entry));
      if (!payloadWords || boundWords.length !== payloadWords.length) blockers.push({ code: "missing_word_binding", position: item.position, templateKey: item.templateKey });
    } else if (item.templateKey === "DIAGNOSTIC_DICTATION_PROBE") {
      const payloadWords = promptWords(item);
      if (!payloadWords) blockers.push({ code: "activity_requirement_failed", position: item.position, templateKey: item.templateKey });
      else boundWords = payloadWords.map((entry) => probeByCanonical.get(entry.canonicalWordId)).filter((entry): entry is LessonWordSnapshotV2 => Boolean(entry));
      if (!payloadWords || boundWords.length !== payloadWords.length) blockers.push({ code: "missing_word_binding", position: item.position, templateKey: item.templateKey });
    } else if (itemSection === "lesson_intro") {
      boundWords = [...lessonByCanonical.values()];
    } else if (item.metadata.canonicalWordId) {
      const word = itemSection.startsWith("review_")
        ? reviewByCanonical.get(item.metadata.canonicalWordId)
        : lessonByCanonical.get(item.metadata.canonicalWordId);
      if (word) boundWords = [word];
      else blockers.push({ code: "missing_word_binding", position: item.position, templateKey: item.templateKey });
    }

    if (item.templateKey === "DICTATION_SENTENCE_CONTEXT" && item.promptData.requiresSentenceContext !== true) {
      blockers.push({ code: "activity_requirement_failed", position: item.position, templateKey: item.templateKey });
    }
    if (item.templateKey === "REVIEW_DICTATION" && !nonEmpty(item.promptData.bundleId)) {
      blockers.push({ code: "activity_requirement_failed", position: item.position, templateKey: item.templateKey });
    }
    if (item.templateKey === "ERROR_REFLECTION_CUE" && item.promptData.conditional !== "on_misspelling") {
      blockers.push({ code: "activity_requirement_failed", position: item.position, templateKey: item.templateKey });
    }

    let condition: ActivitySnapshotV2["condition"] = { kind: "always" };
    if (item.templateKey === "ERROR_REFLECTION_CUE") {
      const production = items.find((entry) =>
        entry.metadata.sectionKey === "review_production" &&
        entry.metadata.canonicalWordId === item.metadata.canonicalWordId);
      if (!production) blockers.push({ code: "activity_requirement_failed", position: item.position, templateKey: item.templateKey });
      else condition = { kind: "on_misspelling", productionItemSourceEntityId: production.sourceEntityId };
    }

    const semantics = resolveGenericTemplateSemantics(definition, itemSection);
    const activityRefs = [templateRef(templates.get(item.templateKey))];
    for (const word of boundWords) activityRefs.push(...word.contentVersionRefs);
    if (item.metadata.microSkillKey) {
      activityRefs.push(teachingRef(facts.teachingContent.get(item.metadata.microSkillKey)));
      const family = facts.skillFamilyKeyBySkill.get(item.metadata.microSkillKey);
      if (family) activityRefs.push(familyRef(familyMethods.get(family)));
    }
    activities.push({
      contractVersion: 2,
      activityId: `generic:${item.position}:${item.templateKey}`,
      order: item.position,
      kind: definition.kind,
      part: genericSnapshotPartForSection(itemSection),
      sectionKey: itemSection,
      templateKey: item.templateKey,
      rendererKind: definition.rendererKind,
      itemBinding: {
        sourceEntityId: item.sourceEntityId,
        position: item.position,
        inputSource: "assignment_items.prompt_data",
      },
      wordSnapshotIds: boundWords.map((word) => word.wordSnapshotId),
      contentVersionRefs: uniqueSorted(activityRefs.filter(nonEmpty)),
      condition,
      answerVisibility: definition.answerVisibility,
      evidence: semantics.evidence,
      completion: {
        binding: "part_submission",
        part: genericSnapshotPartForSection(itemSection),
      },
      scheduleRole: semantics.scheduleRole,
      rewardRole: semantics.rewardRole,
    });
  }

  if (!composerRef || !scheduleRef || !bandingRef || blockers.length > 0) {
    const unique = new Map(blockers.map((entry) => [`${entry.code}:${entry.position ?? ""}:${entry.templateKey ?? ""}`, entry]));
    return { ok: false, blockers: [...unique.values()] };
  }

  const reviewWords = words.filter((word) => word.wordSnapshotId.startsWith("review:"));
  const lessonWords = words.filter((word) => word.wordSnapshotId.startsWith("lesson:"));
  const snapshotBase: Omit<CompiledLessonSnapshotV2, "provenance"> = {
    snapshotSchemaVersion: 2,
    compilerVersion: GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION,
    validatorVersion: GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION,
    requirementRegistryVersion: GENERIC_ACTIVITY_REQUIREMENTS_VERSION,
    route: { routeId: "generic_composer", routeVersion: "v1" },
    recipe: { recipeKey: "generic_first_exposure", recipeVersion: "v1" },
    payload: { kind: "composed_daily_plan", version: 1 },
    runtime: { adapterKey: "generic_composer_v1", rendererKey: "generic_session" },
    assignment: { generationSource: "adle_composer_v1", itemCount: items.length },
    taxonomy: {
      lesson: lessonSkill && lessonFamily ? { familyKey: lessonFamily, microSkillKey: lessonSkill } : null,
      reviewFamilyKeys: uniqueSorted(reviewWords.map((word) => word.familyKey).filter(nonEmpty)),
      reviewMicroSkillKeys: uniqueSorted(reviewWords.map((word) => word.microSkillKey).filter(nonEmpty)),
    },
    words,
    activities,
    segments: [
      {
        segmentId: "review",
        wordSnapshotIds: reviewWords.map((word) => word.wordSnapshotId),
        activityIds: activities.filter((activity) => activity.part === "review").map((activity) => activity.activityId),
      },
      {
        segmentId: "lesson",
        wordSnapshotIds: lessonWords.map((word) => word.wordSnapshotId),
        activityIds: activities.filter((activity) => activity.part === "lesson").map((activity) => activity.activityId),
      },
    ],
    contentVersions: [...contentVersions.values()].sort((a, b) => a.contentRefId.localeCompare(b.contentRefId)),
  };
  const provenanceWithoutFingerprint = {
    sourceKind: "compiled_generic_assignment" as const,
    fingerprintAlgorithm: "sha256" as const,
    fingerprintVersion: GENERIC_SNAPSHOT_FINGERPRINT_VERSION,
  };
  const snapshot: CompiledLessonSnapshotV2 = {
    ...snapshotBase,
    provenance: {
      ...provenanceWithoutFingerprint,
      sourceFingerprint: fingerprintCompiledLessonSnapshot({
        ...snapshotBase,
        provenance: provenanceWithoutFingerprint,
      }),
    },
  };
  const validated = validateCompiledGenericLessonSnapshot(snapshot, {
    lessonRouteMetadata: header.lessonRouteMetadata,
    assignmentGenerationSource: header.assignmentGenerationSource,
    items: items.map((item) => ({
      sourceEntityId: item.sourceEntityId,
      position: item.position,
      sectionKey: item.metadata.sectionKey,
      templateKey: item.templateKey,
      canonicalWordId: item.metadata.canonicalWordId,
      targetWord: item.targetWord,
      promptData: item.promptData,
    })),
  });
  return validated.ok ? { ok: true, snapshot: validated.snapshot } : validated;
}
