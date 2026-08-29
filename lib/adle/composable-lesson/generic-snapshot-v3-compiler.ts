import type { AssignmentItemDraft } from "../assignment-persistence";
import type {
  FamilyMethodFact,
  GenericV3ReflectionFact,
  TeachingContentFact,
} from "../daily-assignment-composer";
import type {
  GenericSnapshotContentKind,
  GenericSnapshotContentVersion,
  GenericSnapshotPart,
} from "./generic-snapshot-shared-contracts";
import {
  GENERIC_CANONICAL_ACTIVITY_AUTHORING_FIELD_V3,
  GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
  type CanonicalActivitySnapshotV3,
  type CompiledLessonSnapshotV3,
  type GenericCanonicalActivityAuthoringV3,
  type GenericSnapshotCompileInputV3,
  type GenericSnapshotCompileResultV3,
  type GenericSnapshotJsonValue,
  type GenericSnapshotSectionKeyV3,
  type GenericSnapshotV3Blocker,
  type LessonWordSnapshotV3,
} from "./generic-snapshot-v3-contracts";
import { getGenericSnapshotV3ReaderContract } from "./generic-snapshot-v3-registry";
import {
  fingerprintCompiledLessonSnapshotV3,
  fingerprintLessonWordV3,
  validateCompiledGenericLessonSnapshotV3,
} from "./generic-snapshot-v3-validator";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValue(value: unknown): value is GenericSnapshotJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return record(value) && Object.values(value).every((entry) => entry !== undefined && jsonValue(entry));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function partForSection(sectionKey: string): GenericSnapshotPart {
  return sectionKey.startsWith("review_") ? "review" : "lesson";
}

function parseAuthoring(item: AssignmentItemDraft): GenericCanonicalActivityAuthoringV3 | null {
  const value = item.promptData[GENERIC_CANONICAL_ACTIVITY_AUTHORING_FIELD_V3];
  if (!record(value) || value.schemaVersion !== 3 || !nonEmpty(value.label)
    || !record(value.canonical) || !nonEmpty(value.canonical.concept)
    || !nonEmpty(value.canonical.mode) || value.canonical.contractVersion !== 1
    || !record(value.payload) || !jsonValue(value.payload)
    || !Array.isArray(value.canonicalWordIds) || !value.canonicalWordIds.every(nonEmpty)) return null;
  const condition = value.condition;
  if (condition !== undefined && (!record(condition)
    || (condition.kind !== "always" && (condition.kind !== "on_misspelling" || !nonEmpty(condition.productionItemSourceEntityId))))) return null;
  return value as unknown as GenericCanonicalActivityAuthoringV3;
}

function targetIds(payload: Readonly<Record<string, GenericSnapshotJsonValue>>): string[] | null {
  if (!Array.isArray(payload.targets)) return null;
  const values = payload.targets.flatMap((target) => record(target) && nonEmpty(target.canonicalWordId)
    ? [target.canonicalWordId]
    : []);
  return values.length === payload.targets.length ? values : null;
}

export function compileGenericLessonSnapshotV3(
  input: GenericSnapshotCompileInputV3,
): GenericSnapshotCompileResultV3 {
  const { facts, plan, persistence } = input;
  const header = persistence.header;
  const route = header.lessonRouteMetadata;
  if (!route || route.metadataSchemaVersion !== 1
    || route.route.routeId !== "generic_composer" || route.route.routeVersion !== "v1"
    || route.recipe.recipeKey !== "generic_first_exposure" || route.recipe.recipeVersion !== "v1"
    || route.payload.kind !== "composed_daily_plan" || route.payload.version !== 1) {
    return { ok: false, blockers: [{ code: "snapshot_route_mismatch" }] };
  }
  if (header.assignmentGenerationSource !== "adle_composer_v1") {
    return { ok: false, blockers: [{ code: "snapshot_assignment_source_mismatch" }] };
  }
  const items = [...persistence.items].sort((left, right) => left.position - right.position);
  if (items.length === 0 || items.some((item, index) => item.position !== index + 1)
    || new Set(items.map((item) => item.sourceEntityId)).size !== items.length) {
    return { ok: false, blockers: [{ code: "snapshot_item_count_mismatch" }] };
  }

  const blockers: GenericSnapshotV3Blocker[] = [];
  const contentVersions = new Map<string, GenericSnapshotContentVersion>();
  const addContent = (
    kind: GenericSnapshotContentKind,
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
  const familyMethods = new Map(facts.familyMethods.filter((entry) => entry.rowStatus === "active").map((entry) => [entry.familyKey, entry]));
  const familyRef = (method: FamilyMethodFact | undefined): string | null => method
    ? addContent("family_method", method.familyKey, method.contentVersion)
    : null;
  const teachingRef = (content: TeachingContentFact | undefined): string | null => content
    ? addContent("teaching_content", content.microSkillKey, content.contentVersion, content.sourceRowHash ?? null)
    : null;
  const reflectionRef = (content: GenericV3ReflectionFact | undefined): string | null => content
    ? addContent(
        "teaching_content",
        `${content.microSkillKey}:reflection:${content.promptKey}`,
        content.contentVersion,
        content.sourceRowHash,
      )
    : null;

  const words: LessonWordSnapshotV3[] = [];
  const wordByPartAndCanonical = new Map<string, LessonWordSnapshotV3>();
  const addWord = (draft: Omit<LessonWordSnapshotV3, "contractVersion" | "wordSnapshotId" | "order" | "factFingerprint"> & { part: GenericSnapshotPart }) => {
    const ordinal = words.filter((word) => word.role === draft.role).length + 1;
    const { part, ...fields } = draft;
    const unsigned = {
      contractVersion: 3 as const,
      wordSnapshotId: `${part}:${draft.role}:${ordinal}:${draft.canonicalWordId}`,
      order: words.length + 1,
      ...fields,
    };
    const word = { ...unsigned, factFingerprint: fingerprintLessonWordV3(unsigned) };
    words.push(word);
    wordByPartAndCanonical.set(`${part}:${word.canonicalWordId}`, word);
  };
  const versionRefsFor = (familyKey: string | null, microSkillKey: string | null): string[] => uniqueSorted([
    bandingRef,
    familyKey ? familyRef(familyMethods.get(familyKey)) : null,
    microSkillKey ? teachingRef(facts.teachingContent.get(microSkillKey)) : null,
  ].filter(nonEmpty));

  for (const item of items.filter((candidate) => candidate.metadata.sectionKey === "review_production")) {
    const canonicalWordId = item.metadata.canonicalWordId;
    const microSkillKey = item.metadata.microSkillKey;
    const familyKey = microSkillKey ? facts.skillFamilyKeyBySkill.get(microSkillKey) ?? null : null;
    if (!canonicalWordId || !item.targetWord || !microSkillKey || !familyKey) {
      blockers.push({ code: "word_identity_mismatch", position: item.position });
      continue;
    }
    addWord({
      part: "review", canonicalWordId, displayWord: item.targetWord, familyKey, microSkillKey,
      learningItemId: null, role: "review", selectionProvenance: "review_schedule",
      source: { kind: "review_schedule", referenceId: nonEmpty(item.promptData.bundleId) ? item.promptData.bundleId : null },
      contentVersionRefs: versionRefsFor(familyKey, microSkillKey),
    });
  }
  const lessonSkill = plan.partTwo.microSkillKey;
  const lessonFamily = lessonSkill ? facts.skillFamilyKeyBySkill.get(lessonSkill) ?? null : null;
  const dictionary = new Map(facts.dictionary.words.map((word) => [word.canonicalWordId, word]));
  for (const slot of plan.partTwo.lessonWords) {
    const dictionaryWord = dictionary.get(slot.canonicalWordId);
    if (!dictionaryWord || !lessonSkill || !lessonFamily) {
      blockers.push({ code: "word_identity_mismatch" });
      continue;
    }
    const role = slot.provenance === "stretch" ? "transfer" as const : "authentic_target" as const;
    const sourceKind = slot.provenance === "stretch" ? "stretch_intake" as const
      : slot.provenance === "probe_miss" ? "probe_miss" as const : "learning_item" as const;
    addWord({
      part: "lesson", canonicalWordId: slot.canonicalWordId, displayWord: dictionaryWord.displayWord,
      familyKey: lessonFamily, microSkillKey: lessonSkill, learningItemId: slot.learningItemId, role,
      selectionProvenance: slot.provenance, source: { kind: sourceKind, referenceId: slot.learningItemId },
      contentVersionRefs: versionRefsFor(lessonFamily, lessonSkill),
    });
  }
  for (const [index, canonicalWordId] of (plan.partTwo.probePlan?.canonicalWordIds ?? []).entries()) {
    const dictionaryWord = dictionary.get(canonicalWordId);
    if (!dictionaryWord || !lessonSkill || !lessonFamily) {
      blockers.push({ code: "word_identity_mismatch" });
      continue;
    }
    addWord({
      part: "lesson", canonicalWordId, displayWord: dictionaryWord.displayWord, familyKey: lessonFamily,
      microSkillKey: lessonSkill, learningItemId: null, role: "probe", selectionProvenance: "diagnostic_probe",
      source: { kind: "diagnostic_probe", referenceId: `probe:${lessonSkill}:${index + 1}` },
      contentVersionRefs: versionRefsFor(lessonFamily, lessonSkill),
    });
  }

  const activities: CanonicalActivitySnapshotV3[] = [];
  for (const item of items) {
    const authored = parseAuthoring(item);
    if (!authored) {
      blockers.push({ code: "missing_authored_content", position: item.position, detail: `Missing ${GENERIC_CANONICAL_ACTIVITY_AUTHORING_FIELD_V3}.` });
      continue;
    }
    const definition = getGenericSnapshotV3ReaderContract(authored.canonical);
    if (!definition) {
      blockers.push({ code: "unsupported_canonical_contract", position: item.position, contractKey: `${authored.canonical.concept}.${authored.canonical.mode}@${authored.canonical.contractVersion}` });
      continue;
    }
    const sectionKey = item.metadata.sectionKey as GenericSnapshotSectionKeyV3;
    if (!definition.lifecycle.sectionKeys.includes(sectionKey)) {
      blockers.push({ code: "item_section_mismatch", position: item.position });
      continue;
    }
    const payloadIssue = definition.validatePayload(authored.payload);
    if (payloadIssue) {
      blockers.push({ code: payloadIssue.kind, position: item.position, detail: payloadIssue.detail });
      continue;
    }
    const part = partForSection(sectionKey);
    const boundWords = authored.canonicalWordIds.flatMap((canonicalWordId) => {
      const word = wordByPartAndCanonical.get(`${part}:${canonicalWordId}`);
      return word ? [word] : [];
    });
    if (boundWords.length !== authored.canonicalWordIds.length) {
      blockers.push({ code: "word_identity_mismatch", position: item.position });
      continue;
    }
    const governedTargetIds = targetIds(authored.payload);
    if (governedTargetIds && !sameStrings(governedTargetIds, authored.canonicalWordIds)) {
      blockers.push({ code: "word_identity_mismatch", position: item.position });
      continue;
    }
    const activityRefs = new Set(boundWords.flatMap((word) => word.contentVersionRefs));
    for (const kind of definition.requiredContentKinds) {
      if (kind === "schedule_policy" && scheduleRef) activityRefs.add(scheduleRef);
      if (kind === "teaching_content") {
        const skill = item.metadata.microSkillKey ?? lessonSkill;
        const ref = skill ? teachingRef(facts.teachingContent.get(skill)) : null;
        if (ref) activityRefs.add(ref);
      }
    }
    if (authored.canonical.concept === "LESSON_REFLECTION") {
      const skill = item.metadata.microSkillKey ?? lessonSkill;
      const authority = skill ? facts.genericV3Reflection?.get(skill) : undefined;
      const governedRef = reflectionRef(authority);
      const promptSource = authored.payload.promptSource;
      if (!authority || authority.authorityKind !== "reflection_prompt" || !governedRef
        || authored.payload.prompt !== authority.promptText
        || !record(promptSource)
        || promptSource.contentRefId !== governedRef
        || promptSource.contentVersion !== authority.contentVersion
        || promptSource.promptKey !== authority.promptKey
        || promptSource.sourceRowHash !== authority.sourceRowHash) {
        blockers.push({
          code: "malformed_content_provenance",
          position: item.position,
          detail: "LessonReflection must exactly match its explicit governed prompt authority.",
        });
      } else {
        activityRefs.add(governedRef);
      }
    }
    const condition = authored.condition ?? { kind: "always" as const };
    activities.push({
      contractVersion: 3,
      activityId: `canonical:${item.position}:${authored.canonical.concept}.${authored.canonical.mode}`,
      label: authored.label,
      order: item.position,
      part,
      sectionKey,
      canonical: authored.canonical,
      payload: authored.payload,
      itemBinding: { sourceEntityId: item.sourceEntityId, position: item.position, inputSource: "assignment_items.prompt_data" },
      wordSnapshotIds: boundWords.map((word) => word.wordSnapshotId),
      contentVersionRefs: [...activityRefs].sort(),
      condition,
      answerVisibility: definition.lifecycle.answerVisibility,
      evidence: definition.lifecycle.evidence,
      completion: { binding: "part_submission", part },
      scheduleRole: definition.lifecycle.scheduleRole,
      rewardRole: definition.lifecycle.rewardRole,
    });
  }
  if (!composerRef || !scheduleRef || !bandingRef || blockers.length > 0) {
    return { ok: false, blockers: dedupeBlockers(blockers) };
  }

  const snapshotBase: Omit<CompiledLessonSnapshotV3, "provenance"> = {
    snapshotSchemaVersion: 3,
    compilerVersion: GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
    validatorVersion: GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
    canonicalContractRegistryVersion: GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
    route: { routeId: "generic_composer", routeVersion: "v1" },
    recipe: { recipeKey: "generic_first_exposure", recipeVersion: "v1" },
    payload: { kind: "composed_daily_plan", version: 1 },
    runtime: { adapterKey: "generic_composer_v1", rendererKey: "canonical_activity_host_v1" },
    assignment: { generationSource: "adle_composer_v1", itemCount: items.length },
    taxonomy: {
      lesson: lessonSkill && lessonFamily ? { familyKey: lessonFamily, microSkillKey: lessonSkill } : null,
      reviewFamilyKeys: uniqueSorted(words.filter((word) => word.role === "review").map((word) => word.familyKey).filter(nonEmpty)),
      reviewMicroSkillKeys: uniqueSorted(words.filter((word) => word.role === "review").map((word) => word.microSkillKey).filter(nonEmpty)),
    },
    words,
    activities,
    segments: (["review", "lesson"] as const).map((segmentId) => ({
      segmentId,
      wordSnapshotIds: words.filter((word) => word.wordSnapshotId.startsWith(`${segmentId}:`)).map((word) => word.wordSnapshotId),
      activityIds: activities.filter((activity) => activity.part === segmentId).map((activity) => activity.activityId),
    })),
    contentVersions: [...contentVersions.values()].sort((left, right) => left.contentRefId.localeCompare(right.contentRefId)),
  };
  const provenance = {
    sourceKind: "compiled_generic_canonical_assignment" as const,
    fingerprintAlgorithm: "sha256" as const,
    fingerprintVersion: 1 as const,
  };
  const snapshot: CompiledLessonSnapshotV3 = {
    ...snapshotBase,
    provenance: { ...provenance, sourceFingerprint: fingerprintCompiledLessonSnapshotV3({ ...snapshotBase, provenance }) },
  };
  return validateCompiledGenericLessonSnapshotV3(snapshot, {
    lessonRouteMetadata: header.lessonRouteMetadata,
    assignmentGenerationSource: header.assignmentGenerationSource,
    items: items.map((item) => ({
      sourceEntityId: item.sourceEntityId,
      position: item.position,
      sectionKey: item.metadata.sectionKey,
      canonicalWordId: item.metadata.canonicalWordId,
      targetWord: item.targetWord,
    })),
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function dedupeBlockers(blockers: readonly GenericSnapshotV3Blocker[]): GenericSnapshotV3Blocker[] {
  return [...new Map(blockers.map((entry) => [
    `${entry.code}:${entry.position ?? ""}:${entry.contractKey ?? ""}`,
    entry,
  ])).values()].sort((left, right) => left.code.localeCompare(right.code) || (left.position ?? 0) - (right.position ?? 0));
}
