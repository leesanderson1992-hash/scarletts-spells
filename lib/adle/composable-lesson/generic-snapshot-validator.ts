import {
  canonicalSnapshotJson,
  fingerprintSnapshotValue,
} from "./canonical-fingerprint";
import type { PersistedLessonRouteMetadataV1 } from "./contracts";
export { canonicalSnapshotJson, fingerprintSnapshotValue } from "./canonical-fingerprint";
import {
  GENERIC_ACTIVITY_REQUIREMENTS_VERSION,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION,
  GENERIC_LESSON_SNAPSHOT_SCHEMA_VERSION,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION,
  GENERIC_SNAPSHOT_FINGERPRINT_VERSION,
  GENERIC_SNAPSHOT_SECTION_KEYS_V2,
  GENERIC_SNAPSHOT_WORD_ROLES_V2,
  type ActivitySnapshotV2,
  type CompiledLessonSnapshotV2,
  type GenericSnapshotBlocker,
  type GenericSnapshotBlockerCode,
  type GenericSnapshotContentVersionV2,
  type GenericSnapshotSegmentV2,
  type GenericSnapshotValidationResult,
  type LessonWordSnapshotV2,
} from "./generic-snapshot-contracts";
import {
  genericSnapshotPartForSection,
  getGenericSnapshotTemplateDefinition,
  resolveGenericTemplateSemantics,
} from "./generic-snapshot-registry";
import { resolveSentenceDictationContract } from "../sentence-dictation-contract";

export interface GenericSnapshotValidationItem {
  sourceEntityId: string;
  position: number;
  sectionKey: string;
  templateKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
  promptData: Record<string, unknown>;
}

export interface GenericSnapshotValidationContext {
  lessonRouteMetadata?: unknown | null;
  assignmentGenerationSource?: string | null;
  items?: readonly GenericSnapshotValidationItem[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function fingerprintLessonWord(
  word: Omit<LessonWordSnapshotV2, "factFingerprint">,
): string {
  return fingerprintSnapshotValue(word);
}

export function fingerprintCompiledLessonSnapshot(
  snapshot: Omit<CompiledLessonSnapshotV2, "provenance"> & {
    provenance: Omit<CompiledLessonSnapshotV2["provenance"], "sourceFingerprint">;
  },
): string {
  return fingerprintSnapshotValue(snapshot);
}

function validContentVersion(value: unknown): value is GenericSnapshotContentVersionV2 {
  return (
    record(value) &&
    exactKeys(value, ["contentRefId", "kind", "key", "version", "sourceRowHash"]) &&
    nonEmptyString(value.contentRefId) &&
    oneOf(value.kind, [
      "composer_policy",
      "schedule_policy",
      "banding",
      "family_method",
      "activity_template",
      "teaching_content",
    ] as const) &&
    nonEmptyString(value.key) &&
    nonEmptyString(value.version) &&
    nullableString(value.sourceRowHash)
  );
}

function validWord(value: unknown): value is LessonWordSnapshotV2 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "contractVersion",
      "wordSnapshotId",
      "order",
      "canonicalWordId",
      "displayWord",
      "familyKey",
      "microSkillKey",
      "learningItemId",
      "role",
      "selectionProvenance",
      "source",
      "contentVersionRefs",
      "factFingerprint",
    ])
  ) return false;
  if (
    value.contractVersion !== 2 ||
    !nonEmptyString(value.wordSnapshotId) ||
    !Number.isInteger(value.order) ||
    (value.order as number) < 1 ||
    !nonEmptyString(value.canonicalWordId) ||
    !nonEmptyString(value.displayWord) ||
    !nullableString(value.familyKey) ||
    !nullableString(value.microSkillKey) ||
    !nullableString(value.learningItemId) ||
    !oneOf(value.role, GENERIC_SNAPSHOT_WORD_ROLES_V2) ||
    !oneOf(value.selectionProvenance, [
      "learning_item",
      "probe_miss",
      "stretch",
      "review_schedule",
      "diagnostic_probe",
      "teaching_content",
    ] as const) ||
    !stringArray(value.contentVersionRefs) ||
    typeof value.factFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.factFingerprint)
  ) return false;
  return (
    record(value.source) &&
    exactKeys(value.source, ["kind", "referenceId"]) &&
    oneOf(value.source.kind, [
      "learning_item",
      "probe_miss",
      "stretch_intake",
      "review_schedule",
      "diagnostic_probe",
      "teaching_content",
    ] as const) &&
    nullableString(value.source.referenceId)
  );
}

function validEvidence(value: unknown): value is ActivitySnapshotV2["evidence"] {
  return (
    record(value) &&
    exactKeys(value, ["mode", "capture", "attemptKind", "evidenceClass"]) &&
    oneOf(value.mode, [
      "none",
      "guided_completion",
      "independent_word",
      "independent_sentence",
      "reflection",
      "diagnostic",
    ] as const) &&
    oneOf(value.capture, ["none", "optional", "submitted_on_part_finish"] as const) &&
    (value.attemptKind === null ||
      oneOf(value.attemptKind, [
        "guided_practice",
        "review_production",
        "reflection_retry",
        "lesson_production",
        "lesson_dictation",
        "lesson_probe",
      ] as const)) &&
    (value.evidenceClass === null ||
      oneOf(value.evidenceClass, [
        "guided_practice_attempt",
        "scheduled_review_attempt",
        "reflection_attempt",
        "first_exposure_lesson_attempt",
        "diagnostic_probe_attempt",
      ] as const))
  );
}

function validActivity(value: unknown): value is ActivitySnapshotV2 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "contractVersion",
      "activityId",
      "order",
      "kind",
      "part",
      "sectionKey",
      "templateKey",
      "rendererKind",
      "itemBinding",
      "wordSnapshotIds",
      "contentVersionRefs",
      "condition",
      "answerVisibility",
      "evidence",
      "completion",
      "scheduleRole",
      "rewardRole",
    ])
  ) return false;
  if (
    value.contractVersion !== 2 ||
    !nonEmptyString(value.activityId) ||
    !Number.isInteger(value.order) ||
    (value.order as number) < 1 ||
    !oneOf(value.kind, [
      "introduction",
      "guided_prompt",
      "controlled_spelling",
      "hide_write",
      "dictation",
      "reflection",
      "review_quick_sort",
      "must_use_writing",
      "diagnostic_probe",
    ] as const) ||
    !oneOf(value.part, ["review", "lesson"] as const) ||
    !oneOf(value.sectionKey, GENERIC_SNAPSHOT_SECTION_KEYS_V2) ||
    !nonEmptyString(value.templateKey) ||
    !oneOf(value.rendererKind, [
      "intro",
      "guided_prompt",
      "cover_check",
      "sentence_dictation",
      "cold_word_recall",
      "dictation",
      "reflection",
      "quick_sort",
      "must_use_writing",
    ] as const) ||
    !stringArray(value.wordSnapshotIds) ||
    !stringArray(value.contentVersionRefs) ||
    !oneOf(value.answerVisibility, ["teaching", "guided", "recall_neutral", "post_submit"] as const) ||
    !validEvidence(value.evidence) ||
    !oneOf(value.scheduleRole, [
      "none",
      "review_outcome",
      "lesson_final_if_no_dictation",
      "lesson_final",
      "diagnostic_probe",
    ] as const) ||
    !oneOf(value.rewardRole, ["none", "lesson_taught_word"] as const)
  ) return false;
  if (
    !record(value.itemBinding) ||
    !exactKeys(value.itemBinding, ["sourceEntityId", "position", "inputSource"]) ||
    !nonEmptyString(value.itemBinding.sourceEntityId) ||
    !Number.isInteger(value.itemBinding.position) ||
    value.itemBinding.inputSource !== "assignment_items.prompt_data"
  ) return false;
  if (!record(value.condition)) return false;
  if (value.condition.kind === "always") {
    if (!exactKeys(value.condition, ["kind"])) return false;
  } else if (value.condition.kind === "on_misspelling") {
    if (
      !exactKeys(value.condition, ["kind", "productionItemSourceEntityId"]) ||
      !nonEmptyString(value.condition.productionItemSourceEntityId)
    ) return false;
  } else return false;
  return (
    record(value.completion) &&
    exactKeys(value.completion, ["binding", "part"]) &&
    value.completion.binding === "part_submission" &&
    oneOf(value.completion.part, ["review", "lesson"] as const)
  );
}

function validSegment(value: unknown): value is GenericSnapshotSegmentV2 {
  return (
    record(value) &&
    exactKeys(value, ["segmentId", "wordSnapshotIds", "activityIds"]) &&
    oneOf(value.segmentId, ["review", "lesson"] as const) &&
    stringArray(value.wordSnapshotIds) &&
    stringArray(value.activityIds)
  );
}

function parseShape(value: unknown): CompiledLessonSnapshotV2 | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      "snapshotSchemaVersion",
      "compilerVersion",
      "validatorVersion",
      "requirementRegistryVersion",
      "route",
      "recipe",
      "payload",
      "runtime",
      "assignment",
      "taxonomy",
      "words",
      "activities",
      "segments",
      "contentVersions",
      "provenance",
    ])
  ) return null;
  if (
    !Array.isArray(value.words) || !value.words.every(validWord) ||
    !Array.isArray(value.activities) || !value.activities.every(validActivity) ||
    !Array.isArray(value.segments) || !value.segments.every(validSegment) ||
    !Array.isArray(value.contentVersions) || !value.contentVersions.every(validContentVersion)
  ) return null;
  if (
    !record(value.route) || !exactKeys(value.route, ["routeId", "routeVersion"]) ||
    !record(value.recipe) || !exactKeys(value.recipe, ["recipeKey", "recipeVersion"]) ||
    !record(value.payload) || !exactKeys(value.payload, ["kind", "version"]) ||
    !record(value.runtime) || !exactKeys(value.runtime, ["adapterKey", "rendererKey"]) ||
    !record(value.assignment) || !exactKeys(value.assignment, ["generationSource", "itemCount"]) ||
    !record(value.taxonomy) || !exactKeys(value.taxonomy, ["lesson", "reviewFamilyKeys", "reviewMicroSkillKeys"]) ||
    !record(value.provenance) || !exactKeys(value.provenance, ["sourceKind", "fingerprintAlgorithm", "fingerprintVersion", "sourceFingerprint"])
  ) return null;
  const lesson = value.taxonomy.lesson;
  if (
    lesson !== null &&
    (!record(lesson) || !exactKeys(lesson, ["familyKey", "microSkillKey"]) ||
      !nonEmptyString(lesson.familyKey) || !nonEmptyString(lesson.microSkillKey))
  ) return null;
  if (
    !stringArray(value.taxonomy.reviewFamilyKeys) ||
    !stringArray(value.taxonomy.reviewMicroSkillKeys) ||
    !Number.isInteger(value.assignment.itemCount) ||
    (value.assignment.itemCount as number) < 1 ||
    value.provenance.sourceKind !== "compiled_generic_assignment" ||
    value.provenance.fingerprintAlgorithm !== "sha256" ||
    value.provenance.fingerprintVersion !== GENERIC_SNAPSHOT_FINGERPRINT_VERSION ||
    typeof value.provenance.sourceFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.provenance.sourceFingerprint)
  ) return null;
  return value as unknown as CompiledLessonSnapshotV2;
}

function blocker(code: GenericSnapshotBlockerCode, activity?: ActivitySnapshotV2): GenericSnapshotBlocker {
  return {
    code,
    ...(activity ? {
      activityId: activity.activityId,
      templateKey: activity.templateKey,
      position: activity.itemBinding.position,
    } : {}),
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalSnapshotJson(left) === canonicalSnapshotJson(right);
}

function persistedRouteMetadata(value: unknown): PersistedLessonRouteMetadataV1 | null {
  if (!record(value) || !record(value.route) || !record(value.recipe) || !record(value.payload)) return null;
  if (
    value.metadataSchemaVersion !== 1 ||
    value.route.routeId !== "generic_composer" || value.route.routeVersion !== "v1" ||
    value.recipe.recipeKey !== "generic_first_exposure" || value.recipe.recipeVersion !== "v1" ||
    value.payload.kind !== "composed_daily_plan" || value.payload.version !== 1
  ) return null;
  return value as unknown as PersistedLessonRouteMetadataV1;
}

export function validateCompiledGenericLessonSnapshot(
  value: unknown,
  context: GenericSnapshotValidationContext = {},
): GenericSnapshotValidationResult {
  if (record(value) && value.snapshotSchemaVersion !== GENERIC_LESSON_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, blockers: [blocker("unsupported_snapshot_schema_version")] };
  }
  if (
    record(value) &&
    ((record(value.provenance) && typeof value.provenance.sourceFingerprint === "string" && !/^[a-f0-9]{64}$/.test(value.provenance.sourceFingerprint)) ||
      (Array.isArray(value.words) && value.words.some((word) =>
        record(word) && typeof word.factFingerprint === "string" && !/^[a-f0-9]{64}$/.test(word.factFingerprint))))
  ) {
    return { ok: false, blockers: [blocker("malformed_fingerprint")] };
  }
  const snapshot = parseShape(value);
  if (!snapshot) return { ok: false, blockers: [blocker("malformed_snapshot")] };
  const blockers: GenericSnapshotBlocker[] = [];
  if (snapshot.compilerVersion !== GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION) blockers.push(blocker("compiler_version_mismatch"));
  if (snapshot.validatorVersion !== GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION) blockers.push(blocker("validator_version_mismatch"));
  if (snapshot.requirementRegistryVersion !== GENERIC_ACTIVITY_REQUIREMENTS_VERSION) blockers.push(blocker("requirement_registry_version_mismatch"));
  if (snapshot.route.routeId !== "generic_composer" || snapshot.route.routeVersion !== "v1") blockers.push(blocker("snapshot_route_mismatch"));
  if (snapshot.recipe.recipeKey !== "generic_first_exposure" || snapshot.recipe.recipeVersion !== "v1") blockers.push(blocker("snapshot_recipe_mismatch"));
  if (snapshot.payload.kind !== "composed_daily_plan" || snapshot.payload.version !== 1) blockers.push(blocker("snapshot_payload_mismatch"));
  if (snapshot.runtime.adapterKey !== "generic_composer_v1" || snapshot.runtime.rendererKey !== "generic_session") blockers.push(blocker("snapshot_runtime_mismatch"));
  if (snapshot.assignment.generationSource !== "adle_composer_v1") blockers.push(blocker("snapshot_assignment_source_mismatch"));
  if (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== snapshot.assignment.generationSource) {
    blockers.push(blocker("snapshot_assignment_source_mismatch"));
  }
  if (context.lessonRouteMetadata !== undefined) {
    if (context.lessonRouteMetadata === null) blockers.push(blocker("snapshot_without_explicit_generic_route"));
    else if (!persistedRouteMetadata(context.lessonRouteMetadata)) blockers.push(blocker("snapshot_route_mismatch"));
  }

  const contentIds = snapshot.contentVersions.map((entry) => entry.contentRefId);
  if (new Set(contentIds).size !== contentIds.length) blockers.push(blocker("malformed_content_provenance"));
  const knownContentIds = new Set(contentIds);
  const contentById = new Map(snapshot.contentVersions.map((entry) => [entry.contentRefId, entry]));
  const coreContentKinds = ["composer_policy", "schedule_policy", "banding"] as const;
  for (const kind of coreContentKinds) {
    if (snapshot.contentVersions.filter((entry) => entry.kind === kind).length !== 1) {
      blockers.push(blocker("malformed_content_provenance"));
    }
  }
  for (const entry of snapshot.contentVersions) {
    if (entry.contentRefId !== `${entry.kind}:${entry.key}:${entry.version}`) {
      blockers.push(blocker("malformed_content_provenance"));
    }
  }
  const composerPolicy = snapshot.contentVersions.find((entry) => entry.kind === "composer_policy");
  const schedulePolicy = snapshot.contentVersions.find((entry) => entry.kind === "schedule_policy");
  if (composerPolicy && (composerPolicy.key !== composerPolicy.version || composerPolicy.version.trim() === "")) {
    blockers.push(blocker("malformed_content_provenance"));
  }
  if (schedulePolicy && (schedulePolicy.key !== schedulePolicy.version || schedulePolicy.version.trim() === "")) {
    blockers.push(blocker("malformed_content_provenance"));
  }
  const wordIds = snapshot.words.map((word) => word.wordSnapshotId);
  if (new Set(wordIds).size !== wordIds.length) blockers.push(blocker("duplicate_word_snapshot_id"));
  if (snapshot.words.some((word, index) => word.order !== index + 1)) blockers.push(blocker("word_identity_mismatch"));
  const knownWordIds = new Set(wordIds);
  for (const word of snapshot.words) {
    if (!word.contentVersionRefs.every((entry) => knownContentIds.has(entry))) blockers.push(blocker("malformed_content_provenance"));
    if (new Set(word.contentVersionRefs).size !== word.contentVersionRefs.length) blockers.push(blocker("malformed_content_provenance"));
    const wordContent = word.contentVersionRefs.flatMap((id) => {
      const entry = contentById.get(id);
      return entry ? [entry] : [];
    });
    if (!wordContent.some((entry) => entry.kind === "banding")) blockers.push(blocker("malformed_content_provenance"));
    if (word.familyKey !== null && !wordContent.some((entry) => entry.kind === "family_method" && entry.key === word.familyKey)) blockers.push(blocker("malformed_content_provenance"));
    if (word.microSkillKey !== null && !wordContent.some((entry) => entry.kind === "teaching_content" && entry.key === word.microSkillKey)) blockers.push(blocker("malformed_content_provenance"));
    const validSourceBinding =
      (word.selectionProvenance === "learning_item" && word.source.kind === "learning_item" && word.learningItemId !== null && word.source.referenceId === word.learningItemId) ||
      (word.selectionProvenance === "probe_miss" && word.source.kind === "probe_miss" && word.learningItemId !== null && word.source.referenceId === word.learningItemId) ||
      (word.selectionProvenance === "stretch" && word.source.kind === "stretch_intake" && word.learningItemId !== null && word.source.referenceId === word.learningItemId) ||
      (word.selectionProvenance === "review_schedule" && word.source.kind === "review_schedule" && word.role === "review" && word.learningItemId === null && word.source.referenceId !== null) ||
      (word.selectionProvenance === "diagnostic_probe" && word.source.kind === "diagnostic_probe" && word.role === "probe" && word.learningItemId === null && word.source.referenceId !== null) ||
      (word.selectionProvenance === "teaching_content" && word.source.kind === "teaching_content");
    if (!validSourceBinding) blockers.push(blocker("invalid_word_role"));
    const { factFingerprint, ...fingerprintInput } = word;
    void factFingerprint;
    if (fingerprintLessonWord(fingerprintInput) !== word.factFingerprint) blockers.push(blocker("fingerprint_mismatch"));
  }

  const activityIds = snapshot.activities.map((activity) => activity.activityId);
  if (new Set(activityIds).size !== activityIds.length) blockers.push(blocker("duplicate_activity_id"));
  if (snapshot.activities.some((activity, index) => activity.order !== index + 1 || activity.itemBinding.position !== index + 1)) blockers.push(blocker("item_position_mismatch"));
  const itemBindings = snapshot.activities.map((activity) => activity.itemBinding.sourceEntityId);
  if (new Set(itemBindings).size !== itemBindings.length) blockers.push(blocker("duplicate_item_binding"));
  for (const activity of snapshot.activities) {
    const definition = getGenericSnapshotTemplateDefinition(activity.templateKey);
    if (!definition) {
      blockers.push(blocker("unsupported_template", activity));
      continue;
    }
    if (definition.compileSupport !== "supported") blockers.push(blocker("unsupported_template_shape", activity));
    if (!definition.supportedSections.includes(activity.sectionKey)) blockers.push(blocker("item_section_mismatch", activity));
    const semantics = resolveGenericTemplateSemantics(definition, activity.sectionKey);
    const legacyRendererCompatible = activity.rendererKind === "dictation" && [
      "CONTROLLED_SPELLING",
      "HIDE_WRITE",
      "DICTATION_NO_IMAGE",
      "DICTATION_SENTENCE_CONTEXT",
      "REVIEW_DICTATION",
      "DIAGNOSTIC_DICTATION_PROBE",
    ].includes(activity.templateKey);
    if (activity.kind !== definition.kind || (activity.rendererKind !== semantics.rendererKind && !legacyRendererCompatible) || activity.answerVisibility !== definition.answerVisibility || !sameJson(activity.evidence, semantics.evidence)) {
      blockers.push(blocker("evidence_binding_mismatch", activity));
    }
    if (activity.scheduleRole !== semantics.scheduleRole) blockers.push(blocker("schedule_role_mismatch", activity));
    if (activity.rewardRole !== semantics.rewardRole) blockers.push(blocker("reward_role_mismatch", activity));
    if (activity.part !== genericSnapshotPartForSection(activity.sectionKey) || activity.completion.part !== activity.part || activity.completion.binding !== "part_submission") {
      blockers.push(blocker("completion_binding_mismatch", activity));
    }
    if (!activity.wordSnapshotIds.every((entry) => knownWordIds.has(entry))) blockers.push(blocker("missing_word_binding", activity));
    if (new Set(activity.wordSnapshotIds).size !== activity.wordSnapshotIds.length) blockers.push(blocker("duplicate_word_binding", activity));
    if (!activity.contentVersionRefs.every((entry) => knownContentIds.has(entry))) blockers.push(blocker("malformed_content_provenance", activity));
    if (new Set(activity.contentVersionRefs).size !== activity.contentVersionRefs.length) blockers.push(blocker("malformed_content_provenance", activity));
    if (!activity.contentVersionRefs.some((id) => {
      const entry = contentById.get(id);
      return entry?.kind === "activity_template" && entry.key === activity.templateKey;
    })) blockers.push(blocker("malformed_content_provenance", activity));
  }

  const segments = new Map(snapshot.segments.map((segment) => [segment.segmentId, segment]));
  if (segments.size !== 2 || snapshot.segments.length !== 2) blockers.push(blocker("completion_binding_mismatch"));
  for (const part of ["review", "lesson"] as const) {
    const segment = segments.get(part);
    const expectedActivities = snapshot.activities.filter((activity) => activity.part === part).map((activity) => activity.activityId);
    const expectedWords = snapshot.words.filter((word) => word.wordSnapshotId.startsWith(`${part}:`)).map((word) => word.wordSnapshotId);
    if (!segment || !sameJson(segment.activityIds, expectedActivities) || !sameJson(segment.wordSnapshotIds, expectedWords)) {
      blockers.push(blocker("completion_binding_mismatch"));
    }
  }

  const reviewWords = snapshot.words.filter((word) => word.role === "review");
  const lessonWords = snapshot.words.filter((word) => word.role !== "review");
  const expectedReviewFamilies = [...new Set(reviewWords.flatMap((word) => word.familyKey ? [word.familyKey] : []))].sort();
  const expectedReviewSkills = [...new Set(reviewWords.flatMap((word) => word.microSkillKey ? [word.microSkillKey] : []))].sort();
  if (!sameJson(snapshot.taxonomy.reviewFamilyKeys, expectedReviewFamilies) || !sameJson(snapshot.taxonomy.reviewMicroSkillKeys, expectedReviewSkills)) {
    blockers.push(blocker("word_identity_mismatch"));
  }
  if (lessonWords.length === 0) {
    if (snapshot.taxonomy.lesson !== null) blockers.push(blocker("word_identity_mismatch"));
  } else if (
    snapshot.taxonomy.lesson === null ||
    lessonWords.some((word) => word.familyKey !== snapshot.taxonomy.lesson?.familyKey || word.microSkillKey !== snapshot.taxonomy.lesson?.microSkillKey)
  ) {
    blockers.push(blocker("word_identity_mismatch"));
  }

  if (context.items) {
    const items = [...context.items].sort((a, b) => a.position - b.position);
    if (items.length !== snapshot.assignment.itemCount || items.length !== snapshot.activities.length) blockers.push(blocker("snapshot_item_count_mismatch"));
    const itemBySource = new Map(items.map((item) => [item.sourceEntityId, item]));
    const wordById = new Map(snapshot.words.map((word) => [word.wordSnapshotId, word]));
    for (const activity of snapshot.activities) {
      const item = itemBySource.get(activity.itemBinding.sourceEntityId);
      if (!item) {
        blockers.push(blocker("missing_item_binding", activity));
        continue;
      }
      if (item.position !== activity.itemBinding.position || item.position !== activity.order) blockers.push(blocker("item_position_mismatch", activity));
      if (item.sectionKey !== activity.sectionKey) blockers.push(blocker("item_section_mismatch", activity));
      if (item.templateKey !== activity.templateKey) blockers.push(blocker("item_template_mismatch", activity));
      const boundWords = activity.wordSnapshotIds
        .map((wordId) => wordById.get(wordId))
        .filter((word): word is LessonWordSnapshotV2 => Boolean(word));
      if (item.canonicalWordId !== null) {
        if (
          boundWords.length !== 1 ||
          boundWords[0].canonicalWordId !== item.canonicalWordId ||
          boundWords[0].displayWord !== item.targetWord
        ) blockers.push(blocker("word_identity_mismatch", activity));
      }
      if (activity.sectionKey.startsWith("review_") && boundWords.some((word) => word.role !== "review")) {
        blockers.push(blocker("invalid_word_role", activity));
      }
      if (activity.sectionKey === "lesson_probe" && boundWords.some((word) => word.role !== "probe")) {
        blockers.push(blocker("invalid_word_role", activity));
      }
      if (
        activity.part === "lesson" &&
        activity.sectionKey !== "lesson_probe" &&
        boundWords.some((word) => word.role !== "authentic_target" && word.role !== "transfer")
      ) blockers.push(blocker("invalid_word_role", activity));
      if (activity.templateKey === "REVIEW_QUICK_SORT" || activity.templateKey === "DIAGNOSTIC_DICTATION_PROBE") {
        const payloadWords = Array.isArray(item.promptData.words)
          ? item.promptData.words.flatMap((value) => {
              if (!record(value) || !nonEmptyString(value.canonicalWordId) || !nonEmptyString(value.targetWord)) return [];
              return [{ canonicalWordId: value.canonicalWordId, targetWord: value.targetWord }];
            })
          : [];
        const snapshotWords = boundWords.map((word) => ({
          canonicalWordId: word.canonicalWordId,
          targetWord: word.displayWord,
        }));
        if (!sameJson(payloadWords, snapshotWords)) blockers.push(blocker("word_identity_mismatch", activity));
      }
      if (
        (activity.templateKey === "DICTATION_NO_IMAGE" ||
          (activity.templateKey === "DICTATION_SENTENCE_CONTEXT" && activity.sectionKey === "lesson_dictation")) &&
        resolveSentenceDictationContract(item.promptData, item.targetWord) === null
      ) {
        blockers.push(blocker("activity_requirement_failed", activity));
      }
      if (
        (activity.templateKey === "REVIEW_DICTATION" ||
          (activity.templateKey === "DICTATION_SENTENCE_CONTEXT" && activity.sectionKey === "review_production")) &&
        !nonEmptyString(item.promptData.bundleId)
      ) {
        blockers.push(blocker("activity_requirement_failed", activity));
      }
      if (activity.templateKey === "ERROR_REFLECTION_CUE") {
        if (item.promptData.conditional !== "on_misspelling" || activity.condition.kind !== "on_misspelling") {
          blockers.push(blocker("activity_requirement_failed", activity));
        } else {
          const productionItem = itemBySource.get(activity.condition.productionItemSourceEntityId);
          if (
            !productionItem ||
            productionItem.sectionKey !== "review_production" ||
            productionItem.canonicalWordId !== item.canonicalWordId
          ) blockers.push(blocker("activity_requirement_failed", activity));
        }
      } else if (activity.condition.kind !== "always") {
        blockers.push(blocker("activity_requirement_failed", activity));
      }
    }
    for (const item of items) {
      if (!itemBindings.includes(item.sourceEntityId)) blockers.push({ code: "unbound_assignment_item", position: item.position, templateKey: item.templateKey });
    }
  }

  const { sourceFingerprint, ...provenance } = snapshot.provenance;
  const fingerprintInput = { ...snapshot, provenance };
  if (fingerprintCompiledLessonSnapshot(fingerprintInput) !== sourceFingerprint) blockers.push(blocker("fingerprint_mismatch"));

  const deduped = new Map<string, GenericSnapshotBlocker>();
  for (const entry of blockers) {
    deduped.set(`${entry.code}:${entry.activityId ?? ""}:${entry.position ?? ""}`, entry);
  }
  const ordered = [...deduped.values()].sort((a, b) =>
    a.code.localeCompare(b.code) || (a.position ?? 0) - (b.position ?? 0));
  return ordered.length === 0 ? { ok: true, snapshot } : { ok: false, blockers: ordered };
}
