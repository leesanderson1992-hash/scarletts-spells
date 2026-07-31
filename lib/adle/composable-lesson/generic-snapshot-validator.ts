import { createHash } from "node:crypto";

import type { PersistedLessonRouteMetadataV1 } from "./contracts";
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonical_json_non_finite:${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  if (!record(value)) throw new Error(`canonical_json_unsupported:${path}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`canonical_json_prototype:${path}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) throw new Error(`canonical_json_undefined:${path}.${key}`);
    result[key] = canonicalValue(child, `${path}.${key}`);
  }
  return result;
}

export function canonicalSnapshotJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}

export function fingerprintSnapshotValue(value: unknown): string {
  return sha256(canonicalSnapshotJson(value));
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
  const wordIds = snapshot.words.map((word) => word.wordSnapshotId);
  if (new Set(wordIds).size !== wordIds.length) blockers.push(blocker("duplicate_word_snapshot_id"));
  const knownWordIds = new Set(wordIds);
  for (const word of snapshot.words) {
    if (!word.contentVersionRefs.every((entry) => knownContentIds.has(entry))) blockers.push(blocker("malformed_content_provenance"));
    const { factFingerprint, ...fingerprintInput } = word;
    void factFingerprint;
    if (fingerprintLessonWord(fingerprintInput) !== word.factFingerprint) blockers.push(blocker("fingerprint_mismatch"));
  }

  const activityIds = snapshot.activities.map((activity) => activity.activityId);
  if (new Set(activityIds).size !== activityIds.length) blockers.push(blocker("duplicate_activity_id"));
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
    if (activity.kind !== definition.kind || activity.rendererKind !== definition.rendererKind || activity.answerVisibility !== definition.answerVisibility || !sameJson(activity.evidence, semantics.evidence)) {
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
  }

  const segments = new Map(snapshot.segments.map((segment) => [segment.segmentId, segment]));
  for (const part of ["review", "lesson"] as const) {
    const segment = segments.get(part);
    const expectedActivities = snapshot.activities.filter((activity) => activity.part === part).map((activity) => activity.activityId);
    const expectedWords = snapshot.words.filter((word) => word.wordSnapshotId.startsWith(`${part}:`)).map((word) => word.wordSnapshotId);
    if (!segment || !sameJson(segment.activityIds, expectedActivities) || !sameJson(segment.wordSnapshotIds, expectedWords)) {
      blockers.push(blocker("completion_binding_mismatch"));
    }
  }

  if (context.items) {
    const items = [...context.items].sort((a, b) => a.position - b.position);
    if (items.length !== snapshot.assignment.itemCount || items.length !== snapshot.activities.length) blockers.push(blocker("snapshot_item_count_mismatch"));
    const itemBySource = new Map(items.map((item) => [item.sourceEntityId, item]));
    for (const activity of snapshot.activities) {
      const item = itemBySource.get(activity.itemBinding.sourceEntityId);
      if (!item) {
        blockers.push(blocker("missing_item_binding", activity));
        continue;
      }
      if (item.position !== activity.itemBinding.position || item.position !== activity.order) blockers.push(blocker("item_position_mismatch", activity));
      if (item.sectionKey !== activity.sectionKey) blockers.push(blocker("item_section_mismatch", activity));
      if (item.templateKey !== activity.templateKey) blockers.push(blocker("item_template_mismatch", activity));
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
