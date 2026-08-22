import type { PersistedLessonRouteMetadataV1 } from "./contracts";
import {
  canonicalSnapshotJson,
  fingerprintSnapshotValue,
} from "./canonical-fingerprint";
import {
  GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_SCHEMA_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
  GENERIC_SNAPSHOT_FINGERPRINT_VERSION_V3,
  type CanonicalActivitySnapshotV3,
  type CompiledLessonSnapshotV3,
  type GenericSnapshotJsonValue,
  type GenericSnapshotV3Blocker,
  type GenericSnapshotV3BlockerCode,
  type GenericSnapshotV3ValidationResult,
  type LessonWordSnapshotV3,
} from "./generic-snapshot-v3-contracts";
import { getGenericSnapshotV3ReaderContract } from "./generic-snapshot-v3-registry";

export interface GenericSnapshotV3ValidationItem {
  sourceEntityId: string;
  position: number;
  sectionKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
}

export interface GenericSnapshotV3ValidationContext {
  lessonRouteMetadata?: unknown | null;
  assignmentGenerationSource?: string | null;
  items?: readonly GenericSnapshotV3ValidationItem[];
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

function jsonValue(value: unknown): value is GenericSnapshotJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (!record(value)) return false;
  return Object.values(value).every((entry) => entry !== undefined && jsonValue(entry));
}

export function fingerprintLessonWordV3(
  word: Omit<LessonWordSnapshotV3, "factFingerprint">,
): string {
  return fingerprintSnapshotValue(word);
}

export function fingerprintCompiledLessonSnapshotV3(
  snapshot: Omit<CompiledLessonSnapshotV3, "provenance"> & {
    provenance: Omit<CompiledLessonSnapshotV3["provenance"], "sourceFingerprint">;
  },
): string {
  return fingerprintSnapshotValue(snapshot);
}

export function serializeCompiledGenericLessonSnapshotV3(
  snapshot: CompiledLessonSnapshotV3,
): string {
  return canonicalSnapshotJson(snapshot);
}

function blocker(
  code: GenericSnapshotV3BlockerCode,
  activity?: CanonicalActivitySnapshotV3,
  detail?: string,
): GenericSnapshotV3Blocker {
  return {
    code,
    ...(activity ? {
      activityId: activity.activityId,
      contractKey: `${activity.canonical.concept}.${activity.canonical.mode}@${activity.canonical.contractVersion}`,
      position: activity.itemBinding.position,
    } : {}),
    ...(detail ? { detail } : {}),
  };
}

function validContentVersion(value: unknown): boolean {
  return record(value)
    && exactKeys(value, ["contentRefId", "kind", "key", "version", "sourceRowHash"])
    && nonEmptyString(value.contentRefId)
    && oneOf(value.kind, ["composer_policy", "schedule_policy", "banding", "family_method", "activity_template", "teaching_content"] as const)
    && nonEmptyString(value.key)
    && nonEmptyString(value.version)
    && nullableString(value.sourceRowHash);
}

function validWord(value: unknown): value is LessonWordSnapshotV3 {
  if (!record(value) || !exactKeys(value, [
    "contractVersion", "wordSnapshotId", "order", "canonicalWordId", "displayWord",
    "familyKey", "microSkillKey", "learningItemId", "role", "selectionProvenance",
    "source", "contentVersionRefs", "factFingerprint",
  ])) return false;
  return value.contractVersion === 3
    && nonEmptyString(value.wordSnapshotId)
    && Number.isInteger(value.order) && (value.order as number) > 0
    && nonEmptyString(value.canonicalWordId)
    && nonEmptyString(value.displayWord)
    && nullableString(value.familyKey)
    && nullableString(value.microSkillKey)
    && nullableString(value.learningItemId)
    && oneOf(value.role, ["authentic_target", "transfer", "review", "probe", "teaching_example"] as const)
    && oneOf(value.selectionProvenance, ["learning_item", "probe_miss", "stretch", "review_schedule", "diagnostic_probe", "teaching_content"] as const)
    && record(value.source)
    && exactKeys(value.source, ["kind", "referenceId"])
    && oneOf(value.source.kind, ["learning_item", "probe_miss", "stretch_intake", "review_schedule", "diagnostic_probe", "teaching_content"] as const)
    && nullableString(value.source.referenceId)
    && stringArray(value.contentVersionRefs)
    && typeof value.factFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(value.factFingerprint);
}

function validEvidence(value: unknown): boolean {
  return record(value)
    && exactKeys(value, ["mode", "capture", "attemptKind", "evidenceClass"])
    && oneOf(value.mode, ["none", "guided_completion", "independent_word", "independent_sentence", "reflection", "diagnostic"] as const)
    && oneOf(value.capture, ["none", "optional", "submitted_on_part_finish"] as const)
    && (value.attemptKind === null || oneOf(value.attemptKind, ["guided_practice", "review_production", "reflection_retry", "lesson_production", "lesson_dictation", "lesson_probe"] as const))
    && (value.evidenceClass === null || oneOf(value.evidenceClass, ["guided_practice_attempt", "scheduled_review_attempt", "reflection_attempt", "first_exposure_lesson_attempt", "diagnostic_probe_attempt"] as const));
}

function validCondition(value: unknown): boolean {
  if (!record(value)) return false;
  return value.kind === "always"
    ? exactKeys(value, ["kind"])
    : value.kind === "on_misspelling"
      && exactKeys(value, ["kind", "productionItemSourceEntityId"])
      && nonEmptyString(value.productionItemSourceEntityId);
}

function validActivity(value: unknown): value is CanonicalActivitySnapshotV3 {
  if (!record(value) || !exactKeys(value, [
    "contractVersion", "activityId", "label", "order", "part", "sectionKey", "canonical",
    "payload", "itemBinding", "wordSnapshotIds", "contentVersionRefs", "condition",
    "answerVisibility", "evidence", "completion", "scheduleRole", "rewardRole",
  ])) return false;
  return value.contractVersion === 3
    && nonEmptyString(value.activityId)
    && nonEmptyString(value.label)
    && Number.isInteger(value.order) && (value.order as number) > 0
    && oneOf(value.part, ["review", "lesson"] as const)
    && oneOf(value.sectionKey, ["review_quick_sort", "review_production", "review_reflection", "lesson_intro", "guided_practice", "lesson_production", "lesson_dictation", "lesson_probe", "lesson_reflection"] as const)
    && record(value.canonical)
    && exactKeys(value.canonical, ["concept", "mode", "contractVersion"])
    && nonEmptyString(value.canonical.concept)
    && nonEmptyString(value.canonical.mode)
    && Number.isInteger(value.canonical.contractVersion)
    && record(value.payload) && jsonValue(value.payload)
    && record(value.itemBinding)
    && exactKeys(value.itemBinding, ["sourceEntityId", "position", "inputSource"])
    && nonEmptyString(value.itemBinding.sourceEntityId)
    && Number.isInteger(value.itemBinding.position) && (value.itemBinding.position as number) > 0
    && value.itemBinding.inputSource === "assignment_items.prompt_data"
    && stringArray(value.wordSnapshotIds)
    && stringArray(value.contentVersionRefs)
    && validCondition(value.condition)
    && oneOf(value.answerVisibility, ["teaching", "guided", "recall_neutral", "post_submit"] as const)
    && validEvidence(value.evidence)
    && record(value.completion)
    && exactKeys(value.completion, ["binding", "part"])
    && value.completion.binding === "part_submission"
    && oneOf(value.completion.part, ["review", "lesson"] as const)
    && oneOf(value.scheduleRole, ["none", "review_outcome", "lesson_final_if_no_dictation", "lesson_final", "diagnostic_probe"] as const)
    && oneOf(value.rewardRole, ["none", "lesson_taught_word"] as const);
}

function parseShape(value: unknown): CompiledLessonSnapshotV3 | null {
  if (!record(value) || !exactKeys(value, [
    "snapshotSchemaVersion", "compilerVersion", "validatorVersion", "canonicalContractRegistryVersion",
    "route", "recipe", "payload", "runtime", "assignment", "taxonomy", "words", "activities",
    "segments", "contentVersions", "provenance",
  ])) return null;
  if (!Array.isArray(value.words) || !value.words.every(validWord)
    || !Array.isArray(value.activities) || !value.activities.every(validActivity)
    || !Array.isArray(value.contentVersions) || !value.contentVersions.every(validContentVersion)
    || !Array.isArray(value.segments) || !value.segments.every((segment) => record(segment)
      && exactKeys(segment, ["segmentId", "wordSnapshotIds", "activityIds"])
      && oneOf(segment.segmentId, ["review", "lesson"] as const)
      && stringArray(segment.wordSnapshotIds) && stringArray(segment.activityIds))) return null;
  if (!record(value.route) || !exactKeys(value.route, ["routeId", "routeVersion"])
    || !record(value.recipe) || !exactKeys(value.recipe, ["recipeKey", "recipeVersion"])
    || !record(value.payload) || !exactKeys(value.payload, ["kind", "version"])
    || !record(value.runtime) || !exactKeys(value.runtime, ["adapterKey", "rendererKey"])
    || !record(value.assignment) || !exactKeys(value.assignment, ["generationSource", "itemCount"])
    || !record(value.taxonomy) || !exactKeys(value.taxonomy, ["lesson", "reviewFamilyKeys", "reviewMicroSkillKeys"])
    || !record(value.provenance) || !exactKeys(value.provenance, ["sourceKind", "fingerprintAlgorithm", "fingerprintVersion", "sourceFingerprint"])) return null;
  const lesson = value.taxonomy.lesson;
  if (lesson !== null && (!record(lesson) || !exactKeys(lesson, ["familyKey", "microSkillKey"])
    || !nonEmptyString(lesson.familyKey) || !nonEmptyString(lesson.microSkillKey))) return null;
  return stringArray(value.taxonomy.reviewFamilyKeys)
    && stringArray(value.taxonomy.reviewMicroSkillKeys)
    && Number.isInteger(value.assignment.itemCount) && (value.assignment.itemCount as number) > 0
    && value.provenance.sourceKind === "compiled_generic_canonical_assignment"
    && value.provenance.fingerprintAlgorithm === "sha256"
    && value.provenance.fingerprintVersion === GENERIC_SNAPSHOT_FINGERPRINT_VERSION_V3
    && typeof value.provenance.sourceFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(value.provenance.sourceFingerprint)
    ? value as unknown as CompiledLessonSnapshotV3
    : null;
}

function persistedRouteMetadata(value: unknown): PersistedLessonRouteMetadataV1 | null {
  if (!record(value) || !record(value.route) || !record(value.recipe) || !record(value.payload)) return null;
  return value.metadataSchemaVersion === 1
    && value.route.routeId === "generic_composer" && value.route.routeVersion === "v1"
    && value.recipe.recipeKey === "generic_first_exposure" && value.recipe.recipeVersion === "v1"
    && value.payload.kind === "composed_daily_plan" && value.payload.version === 1
    ? value as unknown as PersistedLessonRouteMetadataV1
    : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalSnapshotJson(left) === canonicalSnapshotJson(right);
}

export function validateCompiledGenericLessonSnapshotV3(
  value: unknown,
  context: GenericSnapshotV3ValidationContext = {},
): GenericSnapshotV3ValidationResult {
  if (record(value) && value.snapshotSchemaVersion !== GENERIC_LESSON_SNAPSHOT_SCHEMA_VERSION_V3) {
    return { ok: false, blockers: [blocker("unsupported_snapshot_schema_version")] };
  }
  if (record(value) && (
    (record(value.provenance) && typeof value.provenance.sourceFingerprint === "string" && !/^[a-f0-9]{64}$/.test(value.provenance.sourceFingerprint))
    || (Array.isArray(value.words) && value.words.some((word) => record(word)
      && typeof word.factFingerprint === "string" && !/^[a-f0-9]{64}$/.test(word.factFingerprint)))
  )) {
    return { ok: false, blockers: [blocker("malformed_fingerprint")] };
  }
  const snapshot = parseShape(value);
  if (!snapshot) return { ok: false, blockers: [blocker("malformed_snapshot_v3")] };
  const blockers: GenericSnapshotV3Blocker[] = [];
  if (snapshot.compilerVersion !== GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3) blockers.push(blocker("compiler_version_mismatch"));
  if (snapshot.validatorVersion !== GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3) blockers.push(blocker("validator_version_mismatch"));
  if (snapshot.canonicalContractRegistryVersion !== GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3) blockers.push(blocker("canonical_contract_registry_version_mismatch"));
  if (snapshot.route.routeId !== "generic_composer" || snapshot.route.routeVersion !== "v1") blockers.push(blocker("snapshot_route_mismatch"));
  if (snapshot.recipe.recipeKey !== "generic_first_exposure" || snapshot.recipe.recipeVersion !== "v1") blockers.push(blocker("snapshot_recipe_mismatch"));
  if (snapshot.payload.kind !== "composed_daily_plan" || snapshot.payload.version !== 1) blockers.push(blocker("snapshot_payload_mismatch"));
  if (snapshot.runtime.adapterKey !== "generic_composer_v1" || snapshot.runtime.rendererKey !== "canonical_activity_host_v1") blockers.push(blocker("snapshot_runtime_mismatch"));
  if (snapshot.assignment.generationSource !== "adle_composer_v1") blockers.push(blocker("snapshot_assignment_source_mismatch"));
  if (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== snapshot.assignment.generationSource) blockers.push(blocker("snapshot_assignment_source_mismatch"));
  if (context.lessonRouteMetadata !== undefined) {
    if (context.lessonRouteMetadata === null) blockers.push(blocker("snapshot_without_explicit_generic_route"));
    else if (!persistedRouteMetadata(context.lessonRouteMetadata)) blockers.push(blocker("snapshot_route_mismatch"));
  }

  const contentIds = snapshot.contentVersions.map((entry) => entry.contentRefId);
  if (new Set(contentIds).size !== contentIds.length) blockers.push(blocker("malformed_content_provenance"));
  const knownContentIds = new Set(contentIds);
  const contentById = new Map(snapshot.contentVersions.map((entry) => [entry.contentRefId, entry]));
  for (const entry of snapshot.contentVersions) {
    if (entry.contentRefId !== `${entry.kind}:${entry.key}:${entry.version}`) blockers.push(blocker("malformed_content_provenance"));
  }
  for (const kind of ["composer_policy", "schedule_policy", "banding"] as const) {
    if (snapshot.contentVersions.filter((entry) => entry.kind === kind).length !== 1) blockers.push(blocker("malformed_content_provenance"));
  }

  const wordIds = snapshot.words.map((word) => word.wordSnapshotId);
  if (new Set(wordIds).size !== wordIds.length) blockers.push(blocker("duplicate_word_snapshot_id"));
  const knownWordIds = new Set(wordIds);
  for (const [index, word] of snapshot.words.entries()) {
    if (word.order !== index + 1) blockers.push(blocker("word_identity_mismatch"));
    if (!word.contentVersionRefs.every((id) => knownContentIds.has(id))) blockers.push(blocker("malformed_content_provenance"));
    const { factFingerprint, ...fingerprintInput } = word;
    if (fingerprintLessonWordV3(fingerprintInput) !== factFingerprint) blockers.push(blocker("fingerprint_mismatch"));
    const sourceRoleIsValid =
      (word.selectionProvenance === "learning_item" && word.source.kind === "learning_item" && word.learningItemId !== null && word.source.referenceId === word.learningItemId)
      || (word.selectionProvenance === "probe_miss" && word.source.kind === "probe_miss" && word.learningItemId !== null && word.source.referenceId === word.learningItemId)
      || (word.selectionProvenance === "stretch" && word.source.kind === "stretch_intake" && word.learningItemId !== null && word.source.referenceId === word.learningItemId)
      || (word.selectionProvenance === "review_schedule" && word.source.kind === "review_schedule" && word.role === "review" && word.learningItemId === null && word.source.referenceId !== null)
      || (word.selectionProvenance === "diagnostic_probe" && word.source.kind === "diagnostic_probe" && word.role === "probe" && word.learningItemId === null && word.source.referenceId !== null)
      || (word.selectionProvenance === "teaching_content" && word.source.kind === "teaching_content");
    if (!sourceRoleIsValid) blockers.push(blocker("invalid_word_role"));
  }

  const activityIds = snapshot.activities.map((activity) => activity.activityId);
  const itemBindings = snapshot.activities.map((activity) => activity.itemBinding.sourceEntityId);
  if (new Set(activityIds).size !== activityIds.length) blockers.push(blocker("duplicate_activity_id"));
  if (new Set(itemBindings).size !== itemBindings.length) blockers.push(blocker("duplicate_item_binding"));
  for (const [index, activity] of snapshot.activities.entries()) {
    if (activity.order !== index + 1 || activity.itemBinding.position !== index + 1) blockers.push(blocker("item_position_mismatch", activity));
    if (activity.part !== (activity.sectionKey.startsWith("review_") ? "review" : "lesson") || activity.completion.part !== activity.part) blockers.push(blocker("item_section_mismatch", activity));
    if (!activity.wordSnapshotIds.every((id) => knownWordIds.has(id))) blockers.push(blocker("word_identity_mismatch", activity));
    if (!activity.contentVersionRefs.every((id) => knownContentIds.has(id))) blockers.push(blocker("malformed_content_provenance", activity));
    if (activity.canonical.contractVersion !== 1) {
      blockers.push(blocker("canonical_contract_version_mismatch", activity));
      continue;
    }
    const definition = getGenericSnapshotV3ReaderContract(activity.canonical);
    if (!definition) {
      blockers.push(blocker("unsupported_canonical_contract", activity));
      continue;
    }
    const issue = definition.validatePayload(activity.payload);
    if (issue) blockers.push(blocker(issue.kind, activity, issue.detail));
    const boundWords = activity.wordSnapshotIds.flatMap((id) => {
      const word = snapshot.words.find((entry) => entry.wordSnapshotId === id);
      return word ? [word] : [];
    });
    if (activity.sectionKey.startsWith("review_") && boundWords.some((word) => word.role !== "review")) blockers.push(blocker("invalid_word_role", activity));
    if (activity.sectionKey === "lesson_probe" && boundWords.some((word) => word.role !== "probe")) blockers.push(blocker("invalid_word_role", activity));
    if (activity.part === "lesson" && activity.sectionKey !== "lesson_probe"
      && boundWords.some((word) => word.role !== "authentic_target" && word.role !== "transfer")) blockers.push(blocker("invalid_word_role", activity));
    const payloadWordId = activity.payload.canonicalWordId;
    const payloadWord = activity.payload.targetWord ?? activity.payload.word;
    if (typeof payloadWordId === "string" && boundWords.length === 1
      && (boundWords[0].canonicalWordId !== payloadWordId || boundWords[0].displayWord !== payloadWord)) {
      blockers.push(blocker("word_identity_mismatch", activity));
    }
    if (activity.canonical.concept === "INTRODUCTION" && activity.canonical.mode === "teaching_page") {
      const config = activity.payload.config;
      const meetWords = record(config) && record(config.meetWords) && Array.isArray(config.meetWords.words)
        ? config.meetWords.words
        : [];
      const governedMeetWords = meetWords.flatMap((entry) => record(entry)
        && typeof entry.id === "string" && typeof entry.word === "string"
        ? [{ id: entry.id, word: entry.word }]
        : []);
      if (!sameJson(
        governedMeetWords,
        boundWords.map((word) => ({ id: word.canonicalWordId, word: word.displayWord })),
      )) blockers.push(blocker("word_identity_mismatch", activity, "Meet the Words must exactly match the activity's governed lesson-word bindings."));
    }
    if (activity.canonical.concept === "LESSON_REFLECTION") {
      const promptSource = activity.payload.promptSource;
      if (!record(promptSource) || typeof promptSource.contentRefId !== "string"
        || !activity.contentVersionRefs.includes(promptSource.contentRefId)) {
        blockers.push(blocker("malformed_content_provenance", activity, "The governed reflection prompt source must be one of the activity content references."));
      }
    }
    if (!definition.lifecycle.sectionKeys.includes(activity.sectionKey)
      || activity.answerVisibility !== definition.lifecycle.answerVisibility
      || !sameJson(activity.evidence, definition.lifecycle.evidence)
      || activity.scheduleRole !== definition.lifecycle.scheduleRole
      || activity.rewardRole !== definition.lifecycle.rewardRole
      || activity.condition.kind !== definition.lifecycle.conditionKind) {
      blockers.push(blocker("malformed_canonical_payload", activity, "The persisted lifecycle binding does not match the canonical contract."));
    }
    const activityContentKinds = new Set(activity.contentVersionRefs.flatMap((id) => {
      const content = contentById.get(id);
      return content ? [content.kind] : [];
    }));
    if (!definition.requiredContentKinds.every((kind) => activityContentKinds.has(kind))) {
      blockers.push(blocker("missing_authored_content", activity, `Missing required content provenance: ${definition.requiredContentKinds.filter((kind) => !activityContentKinds.has(kind)).join(", ")}.`));
    }
  }

  if (snapshot.assignment.itemCount !== snapshot.activities.length) blockers.push(blocker("snapshot_item_count_mismatch"));
  const activityBySource = new Map(snapshot.activities.map((activity) => [activity.itemBinding.sourceEntityId, activity]));
  for (const activity of snapshot.activities) {
    if (activity.condition.kind !== "on_misspelling") continue;
    const production = activityBySource.get(activity.condition.productionItemSourceEntityId);
    if (!production
      || production.sectionKey !== "review_production"
      || production.payload.canonicalWordId !== activity.payload.canonicalWordId) {
      blockers.push(blocker("malformed_canonical_payload", activity, "Conditional repair must bind to the same governed review word."));
    }
  }
  if (context.items) {
    if (context.items.length !== snapshot.activities.length) blockers.push(blocker("snapshot_item_count_mismatch"));
    const itemsBySource = new Map(context.items.map((item) => [item.sourceEntityId, item]));
    for (const activity of snapshot.activities) {
      const item = itemsBySource.get(activity.itemBinding.sourceEntityId);
      if (!item) {
        blockers.push(blocker("missing_item_binding", activity));
        continue;
      }
      if (item.position !== activity.itemBinding.position) blockers.push(blocker("item_position_mismatch", activity));
      if (item.sectionKey !== activity.sectionKey) blockers.push(blocker("item_section_mismatch", activity));
      const payloadWordId = activity.payload.canonicalWordId;
      const payloadWord = activity.payload.targetWord ?? activity.payload.word;
      if (item.canonicalWordId !== null && payloadWordId !== item.canonicalWordId) blockers.push(blocker("word_identity_mismatch", activity));
      if (item.targetWord !== null && payloadWord !== item.targetWord) blockers.push(blocker("word_identity_mismatch", activity));
    }
    for (const item of context.items) {
      if (!itemBindings.includes(item.sourceEntityId)) blockers.push({ code: "unbound_assignment_item", position: item.position });
    }
  }

  const segmentActivityIds = snapshot.segments.flatMap((segment) => segment.activityIds);
  if (!sameJson(segmentActivityIds, activityIds)) blockers.push(blocker("malformed_snapshot_v3"));
  for (const segment of snapshot.segments) {
    if (!segment.wordSnapshotIds.every((id) => knownWordIds.has(id))) blockers.push(blocker("word_identity_mismatch"));
  }

  const { sourceFingerprint, ...provenance } = snapshot.provenance;
  if (fingerprintCompiledLessonSnapshotV3({ ...snapshot, provenance }) !== sourceFingerprint) blockers.push(blocker("fingerprint_mismatch"));

  const deduped = new Map<string, GenericSnapshotV3Blocker>();
  for (const entry of blockers) deduped.set(`${entry.code}:${entry.activityId ?? ""}:${entry.position ?? ""}`, entry);
  const ordered = [...deduped.values()].sort((left, right) => left.code.localeCompare(right.code) || (left.position ?? 0) - (right.position ?? 0));
  return ordered.length === 0 ? { ok: true, snapshot } : { ok: false, blockers: ordered };
}

export function parseCompiledGenericLessonSnapshotV3(
  serialized: string,
  context: GenericSnapshotV3ValidationContext = {},
): GenericSnapshotV3ValidationResult {
  try {
    return validateCompiledGenericLessonSnapshotV3(JSON.parse(serialized), context);
  } catch {
    return { ok: false, blockers: [blocker("malformed_snapshot_v3")] };
  }
}
