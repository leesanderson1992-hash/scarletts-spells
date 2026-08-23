import { canonicalSnapshotJson, fingerprintSnapshotValue } from "./canonical-fingerprint";
import {
  SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION,
  SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION,
  SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION,
  type CompiledCompoundWordSpecialistSnapshotV3,
  type CompiledDynamicAffixSpecialistSnapshotV3,
  type CompiledDynamicPrefixSpecialistSnapshotV3,
  type CompiledBaseWordSpecialistSnapshotV3,
  type CompiledSpecialistSnapshotV3,
  type SpecialistCanonicalActivitySnapshotV3,
  type SpecialistSnapshotV3BlockerCode,
  type SpecialistSnapshotV3ValidationItem,
  type SpecialistSnapshotV3ValidationResult,
} from "./specialist-snapshot-v3-contracts";
import { validateCompoundWordLessonPayloadV2 } from "../morphology/compound-word-lesson-v2";
import { resolveCompoundWordFirstImpressionConfig } from "../morphology/resolved-compound-word-lesson-v2";
import { validateDynamicAffixWordLabPayload } from "../morphology/affix-word-lab";
import { resolveDynamicAffixLessonAuthorityV3 } from "../morphology/dynamic-affix-runtime";
import { resolveDynamicPrefixLessonAuthorityV2 } from "../morphology/dynamic-prefix-runtime";
import { resolveBaseWordFamilyLessonAuthorityV2 } from "../morphology/resolved-base-word-family-lesson-v2";

const CONTRACTS = new Set([
  "INTRODUCTION.teaching_page@1",
  "COMPOUND_JIGSAW.jigsaw_multi_target@1",
  "MEANING_MATCH.component_clues@1",
  "COVER_CHECK.whole_word@1",
  "DICTATION.whole_sentence@1",
  "LESSON_REFLECTION.standard_lesson_reflection@1",
]);

export type SpecialistSnapshotV3ValidationContext = {
  lessonRouteMetadata?: unknown | null;
  assignmentGenerationSource?: string | null;
  items?: readonly SpecialistSnapshotV3ValidationItem[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function blocker(code: SpecialistSnapshotV3BlockerCode, detail?: string) {
  return { code, ...(detail ? { detail } : {}) };
}

function routeMetadataMatches(value: unknown): boolean {
  if (!record(value) || !record(value.route) || !record(value.recipe) || !record(value.payload)) return false;
  return (value.metadataSchemaVersion === 1 || value.metadataSchemaVersion === 2)
    && value.route.routeId === "compound_word_lab"
    && value.route.routeVersion === "v2"
    && value.recipe.recipeKey === "compound_word_lab"
    && value.recipe.recipeVersion === "v2"
    && value.payload.kind === "compound_word_lesson_v2"
    && value.payload.version === 2;
}

function activityShape(value: unknown): value is SpecialistCanonicalActivitySnapshotV3 {
  if (!record(value) || !record(value.canonical) || !record(value.payload) || !Array.isArray(value.itemBindings) || !Array.isArray(value.wordSnapshotIds)) return false;
  return value.contractVersion === 3
    && nonEmpty(value.activityId)
    && nonEmpty(value.label)
    && Number.isInteger(value.order)
    && nonEmpty(value.sectionKey)
    && nonEmpty(value.canonical.concept)
    && nonEmpty(value.canonical.mode)
    && value.canonical.contractVersion === 1
    && value.itemBindings.every((entry) => record(entry)
      && nonEmpty(entry.sourceEntityId)
      && Number.isInteger(entry.position)
      && entry.inputSource === "assignment_items.prompt_data")
    && value.wordSnapshotIds.every(nonEmpty)
    && (value.ownership === "assignment_items" || value.ownership === "route_owned");
}

function expectedActivityId(item: SpecialistSnapshotV3ValidationItem): string | null {
  const source = item.promptData.compoundWordActivityId;
  if (typeof source !== "string") return null;
  if (source === "intro-root" || source === "intro-words") return "teaching-pages";
  if (source.startsWith("jigsaw-")) return "compound-jigsaw";
  if (source.startsWith("meaning-")) return "meaning-match";
  if (source.startsWith("controlled-")) return `cover-${source.slice("controlled-".length)}`;
  if (source.startsWith("dictation-")) return source;
  return null;
}

function canonicalPayloadValid(activity: SpecialistCanonicalActivitySnapshotV3): boolean {
  const key = `${activity.canonical.concept}.${activity.canonical.mode}@${activity.canonical.contractVersion}`;
  if (!CONTRACTS.has(key)) return false;
  if (key === "INTRODUCTION.teaching_page@1") {
    const config = activity.payload.config;
    return record(config) && Array.isArray(config.pages) && config.pages.length >= 1
      && record(config.meetWords) && Array.isArray(config.meetWords.words) && config.meetWords.words.length === 4;
  }
  if (key === "COMPOUND_JIGSAW.jigsaw_multi_target@1" || key === "MEANING_MATCH.component_clues@1") {
    return Array.isArray(activity.payload.targets) && activity.payload.targets.length === 4;
  }
  if (key === "COVER_CHECK.whole_word@1") {
    return nonEmpty(activity.payload.canonicalWordId) && nonEmpty(activity.payload.word)
      && Array.isArray(activity.payload.splitPoints) && Array.isArray(activity.payload.components);
  }
  if (key === "DICTATION.whole_sentence@1") {
    return nonEmpty(activity.payload.canonicalWordId) && nonEmpty(activity.payload.targetWord)
      && nonEmpty(activity.payload.sentence) && nonEmpty(activity.payload.audioText)
      && record(activity.payload.targetBinding);
  }
  return key === "LESSON_REFLECTION.standard_lesson_reflection@1"
    && nonEmpty(activity.payload.promptKey)
    && nonEmpty(activity.payload.promptText)
    && record(activity.payload.promptSource);
}

function validateCompoundWordSpecialistSnapshotV3(
  value: unknown,
  context: SpecialistSnapshotV3ValidationContext = {},
): SpecialistSnapshotV3ValidationResult {
  if (!record(value)
    || value.snapshotSchemaVersion !== 3
    || !record(value.route)
    || !record(value.recipe)
    || !record(value.payload)
    || !record(value.runtime)
    || !record(value.assignment)
    || !record(value.taxonomy)
    || !record(value.provenance)
    || !Array.isArray(value.words)
    || !Array.isArray(value.activities)
    || !Array.isArray(value.segments)
    || !Array.isArray(value.contentVersions)) {
    return { ok: false, blockers: [blocker("malformed_specialist_snapshot_v3")] };
  }
  const snapshot = value as unknown as CompiledCompoundWordSpecialistSnapshotV3;
  const blockers: ReturnType<typeof blocker>[] = [];
  if (snapshot.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION
    || snapshot.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION
    || snapshot.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION) {
    blockers.push(blocker("specialist_version_mismatch"));
  }
  if (snapshot.route.routeId !== "compound_word_lab" || snapshot.route.routeVersion !== "v2"
    || snapshot.recipe.recipeKey !== "compound_word_lab" || snapshot.recipe.recipeVersion !== "v2"
    || (context.lessonRouteMetadata !== undefined && !routeMetadataMatches(context.lessonRouteMetadata))) {
    blockers.push(blocker("specialist_route_mismatch"));
  }
  if (snapshot.payload.kind !== "compound_word_lesson_v2" || snapshot.payload.version !== 2
    || !record(snapshot.payload.resolvedLesson)
    || !validateCompoundWordLessonPayloadV2(snapshot.payload.resolvedLesson.sourcePayload)) {
    blockers.push(blocker("specialist_payload_mismatch"));
  } else {
    const resolvedAgain = resolveCompoundWordFirstImpressionConfig(snapshot.payload.resolvedLesson.sourcePayload);
    if (!resolvedAgain || canonicalSnapshotJson(resolvedAgain) !== canonicalSnapshotJson(snapshot.payload.resolvedLesson)) {
      blockers.push(blocker("specialist_resolved_lesson_mismatch"));
    }
  }
  if (snapshot.runtime.adapterKey !== "compound_word_v2" || snapshot.runtime.rendererKey !== "compound_word_guided") {
    blockers.push(blocker("specialist_runtime_mismatch"));
  }
  if (snapshot.assignment.generationSource !== "adle_composer_v1" || snapshot.assignment.itemCount !== 18
    || (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== "adle_composer_v1")) {
    blockers.push(blocker("specialist_assignment_mismatch"));
  }
  if (snapshot.words.length !== 4
    || snapshot.words.some((word, index) => !record(word) || word.order !== index + 1 || !nonEmpty(word.canonicalWordId) || word.wordSnapshotId !== word.canonicalWordId)
    || new Set(snapshot.words.map((word) => word.wordSnapshotId)).size !== 4) {
    blockers.push(blocker("specialist_payload_mismatch"));
  }
  const requiredAuthorityTypes = ["release_manifest", "activation_revision", "dependency_set", "compound_structure", "teaching_content", "teaching_dictionary_closure", "recipe_content"];
  if (snapshot.contentVersions.length !== requiredAuthorityTypes.length
    || requiredAuthorityTypes.some((kind) => snapshot.contentVersions.filter((entry) => entry.authorityType === kind).length !== 1)
    || snapshot.contentVersions.some((entry) => !nonEmpty(entry.authorityId) || !nonEmpty(entry.version) || !/^[a-f0-9]{64}$/.test(entry.sourceHash))) {
    blockers.push(blocker("specialist_content_provenance_malformed"));
  }
  if (snapshot.activities.length !== 12 || !snapshot.activities.every(activityShape)) {
    blockers.push(blocker("malformed_specialist_snapshot_v3"));
  } else {
    const ids = snapshot.activities.map((entry) => entry.activityId);
    if (new Set(ids).size !== ids.length || snapshot.activities.some((entry, index) => entry.order !== index + 1)) {
      blockers.push(blocker("malformed_specialist_snapshot_v3"));
    }
    for (const activity of snapshot.activities) {
      const key = `${activity.canonical.concept}.${activity.canonical.mode}@${activity.canonical.contractVersion}`;
      if (!CONTRACTS.has(key)) blockers.push(blocker("specialist_unsupported_canonical_contract", key));
      else if (!canonicalPayloadValid(activity)) blockers.push(blocker("specialist_canonical_payload_malformed", activity.activityId));
      if ((activity.ownership === "route_owned") !== (activity.activityId === "lesson-reflection" && activity.itemBindings.length === 0)) {
        blockers.push(blocker("specialist_item_binding_mismatch", activity.activityId));
      }
    }
    const flatBindings = snapshot.activities.flatMap((activity) => activity.itemBindings.map((entry) => ({ activity, entry })));
    const bindingIds = flatBindings.map(({ entry }) => entry.sourceEntityId);
    if (new Set(bindingIds).size !== bindingIds.length) blockers.push(blocker("specialist_duplicate_item_binding"));
    if (context.items) {
      const itemBySource = new Map(context.items.map((item) => [item.sourceEntityId, item]));
      if (context.items.length !== 18 || flatBindings.length !== context.items.length
        || context.items.some((item) => !bindingIds.includes(item.sourceEntityId))) {
        blockers.push(blocker("specialist_unbound_assignment_item"));
      }
      for (const { activity, entry } of flatBindings) {
        const item = itemBySource.get(entry.sourceEntityId);
        if (!item || item.position !== entry.position || item.sectionKey !== activity.sectionKey || expectedActivityId(item) !== activity.activityId) {
          blockers.push(blocker("specialist_item_binding_mismatch", entry.sourceEntityId));
        }
      }
    }
  }
  if (snapshot.segments.length !== 1 || snapshot.segments[0]?.segmentId !== "lesson"
    || canonicalSnapshotJson(snapshot.segments[0]?.activityIds) !== canonicalSnapshotJson(snapshot.activities.map((entry) => entry.activityId))) {
    blockers.push(blocker("malformed_specialist_snapshot_v3"));
  }
  const fingerprint = snapshot.provenance.sourceFingerprint;
  if (snapshot.provenance.sourceKind !== "compiled_specialist_assignment"
    || snapshot.provenance.fingerprintAlgorithm !== "sha256"
    || snapshot.provenance.fingerprintVersion !== 1
    || !/^[a-f0-9]{64}$/.test(fingerprint)
    || fingerprintSnapshotValue({ ...snapshot, provenance: {
      sourceKind: snapshot.provenance.sourceKind,
      fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm,
      fingerprintVersion: snapshot.provenance.fingerprintVersion,
    } }) !== fingerprint) {
    blockers.push(blocker("specialist_fingerprint_mismatch"));
  }
  return blockers.length === 0 ? { ok: true, snapshot } : { ok: false, blockers };
}

export function isCompoundWordSpecialistSnapshotV3(value: unknown): value is CompiledCompoundWordSpecialistSnapshotV3 {
  return record(value) && value.snapshotSchemaVersion === 3
    && record(value.route) && value.route.routeId === "compound_word_lab";
}

const DYNAMIC_AFFIX_CONTRACTS = new Set([
  "INTRODUCTION.teaching_page@1",
  "MEANING_DISCOVERY.suffix@1",
  "CLEAVER.find_boundaries@1",
  "MEANING_SORT.meaning@1",
  "WORD_ASSEMBLY.definition_word_builder@1",
  "COVER_CHECK.component_marked@1",
  "DICTATION.target_token@1",
  "LESSON_REFLECTION.standard_lesson_reflection@1",
]);

function dynamicAffixRouteMetadataMatches(value: unknown): boolean {
  if (!record(value) || !record(value.route) || !record(value.recipe) || !record(value.payload)) return false;
  return value.metadataSchemaVersion === 1
    && value.route.routeId === "dynamic_affix_word_lab"
    && value.route.routeVersion === "v3"
    && value.recipe.recipeKey === "dynamic_affix_word_lab"
    && value.recipe.recipeVersion === "v3"
    && value.payload.kind === "dynamic_affix_lesson_v3"
    && value.payload.version === 3;
}

function expectedDynamicAffixActivityId(item: SpecialistSnapshotV3ValidationItem): string | null {
  const source = item.promptData.dynamicAffixActivityId;
  if (typeof source !== "string") return null;
  if (source === "intro-root" || source === "intro-words") return "teaching-pages";
  if (source.startsWith("guided-strip-")) return "split";
  if (source.startsWith("guided-meaning-")) return "meaning";
  if (source.startsWith("guided-build-")) return "build";
  if (source.startsWith("controlled-")) return "cover";
  if (source.startsWith("dictation-")) return "dictation";
  return null;
}

function dynamicPayloadValid(activity: SpecialistCanonicalActivitySnapshotV3): boolean {
  const key = `${activity.canonical.concept}.${activity.canonical.mode}@${activity.canonical.contractVersion}`;
  if (!DYNAMIC_AFFIX_CONTRACTS.has(key)) return false;
  if (key === "INTRODUCTION.teaching_page@1") {
    const config = activity.payload.config;
    return record(config) && Array.isArray(config.pages) && config.pages.length >= 1
      && record(config.meetWords) && Array.isArray(config.meetWords.words) && config.meetWords.words.length === 4;
  }
  if (key === "MEANING_DISCOVERY.suffix@1") return Array.isArray(activity.payload.cards) && activity.payload.cards.length === 4;
  if (key === "CLEAVER.find_boundaries@1") return Array.isArray(activity.payload.targets) && activity.payload.targets.length === 2;
  if (key === "MEANING_SORT.meaning@1") return Array.isArray(activity.payload.wordIds) && activity.payload.wordIds.length === 4 && Array.isArray(activity.payload.bins) && activity.payload.bins.length > 1;
  if (key === "WORD_ASSEMBLY.definition_word_builder@1") return Array.isArray(activity.payload.builds) && activity.payload.builds.length >= 1;
  if (key === "COVER_CHECK.component_marked@1") return Array.isArray(activity.payload.targets) && activity.payload.targets.length === 4;
  if (key === "DICTATION.target_token@1") return Array.isArray(activity.payload.sentences) && activity.payload.sentences.length === 4
    && activity.payload.sentences.every((entry) => record(entry) && nonEmpty(entry.canonicalWordId) && nonEmpty(entry.targetWord) && nonEmpty(entry.sentence) && nonEmpty(entry.audioText) && Number.isInteger(entry.targetTokenIndex));
  return key === "LESSON_REFLECTION.standard_lesson_reflection@1"
    && nonEmpty(activity.payload.promptKey) && nonEmpty(activity.payload.promptText) && record(activity.payload.promptSource);
}

function validateDynamicAffixSpecialistSnapshotV3(
  value: unknown,
  context: SpecialistSnapshotV3ValidationContext,
): SpecialistSnapshotV3ValidationResult {
  if (!record(value) || value.snapshotSchemaVersion !== 3 || !record(value.route) || !record(value.recipe)
    || !record(value.payload) || !record(value.runtime) || !record(value.assignment) || !record(value.taxonomy)
    || !record(value.provenance) || !Array.isArray(value.words) || !Array.isArray(value.activities)
    || !Array.isArray(value.segments) || !Array.isArray(value.contentVersions)) {
    return { ok: false, blockers: [blocker("malformed_specialist_snapshot_v3")] };
  }
  const snapshot = value as unknown as CompiledDynamicAffixSpecialistSnapshotV3;
  const blockers: ReturnType<typeof blocker>[] = [];
  if (snapshot.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION
    || snapshot.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION
    || snapshot.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION) blockers.push(blocker("specialist_version_mismatch"));
  if (snapshot.route.routeId !== "dynamic_affix_word_lab" || snapshot.route.routeVersion !== "v3"
    || snapshot.recipe.recipeKey !== "dynamic_affix_word_lab" || snapshot.recipe.recipeVersion !== "v3"
    || (context.lessonRouteMetadata !== undefined && !dynamicAffixRouteMetadataMatches(context.lessonRouteMetadata))) blockers.push(blocker("specialist_route_mismatch"));
  if (snapshot.payload.kind !== "dynamic_affix_lesson_v3" || snapshot.payload.version !== 3
    || !record(snapshot.payload.resolvedLesson) || !validateDynamicAffixWordLabPayload(snapshot.payload.resolvedLesson.sourcePayload)) {
    blockers.push(blocker("specialist_payload_mismatch"));
  } else {
    const resolvedAgain = resolveDynamicAffixLessonAuthorityV3(snapshot.payload.resolvedLesson.sourcePayload);
    if (!resolvedAgain || canonicalSnapshotJson(resolvedAgain) !== canonicalSnapshotJson(snapshot.payload.resolvedLesson)) blockers.push(blocker("specialist_resolved_lesson_mismatch"));
  }
  if (snapshot.runtime.adapterKey !== "dynamic_affix_v3" || snapshot.runtime.rendererKey !== "morphology_guided") blockers.push(blocker("specialist_runtime_mismatch"));
  if (snapshot.assignment.generationSource !== "adle_composer_v1" || ![16, 18].includes(snapshot.assignment.itemCount)
    || (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== "adle_composer_v1")) blockers.push(blocker("specialist_assignment_mismatch"));
  const sourceWords = validateDynamicAffixWordLabPayload(snapshot.payload.resolvedLesson?.sourcePayload)
    ? snapshot.payload.resolvedLesson.sourcePayload.words.lesson : [];
  if (snapshot.words.length !== 4 || snapshot.words.some((word, index) => !record(word) || word.order !== index + 1
    || !nonEmpty(word.canonicalWordId) || word.wordSnapshotId !== word.canonicalWordId
    || word.canonicalWordId !== sourceWords[index]?.canonicalWordId
    || word.displayWord !== sourceWords[index]?.displayWord
    || word.lineageKind !== (sourceWords[index]?.source === "authentic" ? "authentic_target" : "transfer")
    || (word.lineageKind === "authentic_target") !== nonEmpty(word.learningItemId))
    || new Set(snapshot.words.map((word) => word.wordSnapshotId)).size !== 4) blockers.push(blocker("specialist_payload_mismatch"));
  const authorityCounts = new Map<string, number>();
  for (const authority of snapshot.contentVersions) authorityCounts.set(authority.authorityType, (authorityCounts.get(authority.authorityType) ?? 0) + 1);
  if (snapshot.contentVersions.length !== 17
    || ["affix_profile_content", "shared_affix_source", "shared_affix_lesson", "public_payload", "recipe_content"].some((kind) => authorityCounts.get(kind) !== 1)
    || ["affix_member_content", "teaching_dictionary_word", "dictation_content"].some((kind) => authorityCounts.get(kind) !== 4)
    || snapshot.contentVersions.some((entry) => !nonEmpty(entry.authorityId) || !nonEmpty(entry.version) || !/^[a-f0-9]{64}$/u.test(entry.sourceHash))) blockers.push(blocker("specialist_content_provenance_malformed"));
  const expectedActivityCount = snapshot.payload.resolvedLesson?.sourcePayload?.activities?.guided?.includeMeaningSort ? 8 : 7;
  if (snapshot.activities.length !== expectedActivityCount || !snapshot.activities.every(activityShape)) blockers.push(blocker("malformed_specialist_snapshot_v3"));
  else {
    const ids = snapshot.activities.map((entry) => entry.activityId);
    if (new Set(ids).size !== ids.length || snapshot.activities.some((entry, index) => entry.order !== index + 1)) blockers.push(blocker("malformed_specialist_snapshot_v3"));
    for (const activity of snapshot.activities) {
      const key = `${activity.canonical.concept}.${activity.canonical.mode}@${activity.canonical.contractVersion}`;
      if (!DYNAMIC_AFFIX_CONTRACTS.has(key)) blockers.push(blocker("specialist_unsupported_canonical_contract", key));
      else if (!dynamicPayloadValid(activity)) blockers.push(blocker("specialist_canonical_payload_malformed", activity.activityId));
      const routeOwned = activity.activityId === "discover" || activity.activityId === "lesson-reflection";
      if ((activity.ownership === "route_owned") !== routeOwned || (routeOwned && activity.itemBindings.length !== 0) || (!routeOwned && activity.itemBindings.length < 1)) blockers.push(blocker("specialist_item_binding_mismatch", activity.activityId));
    }
    const flatBindings = snapshot.activities.flatMap((activity) => activity.itemBindings.map((entry) => ({ activity, entry })));
    const bindingIds = flatBindings.map(({ entry }) => entry.sourceEntityId);
    if (new Set(bindingIds).size !== bindingIds.length) blockers.push(blocker("specialist_duplicate_item_binding"));
    if (context.items) {
      const itemBySource = new Map(context.items.map((item) => [item.sourceEntityId, item]));
      if (context.items.length !== snapshot.assignment.itemCount || flatBindings.length !== context.items.length || context.items.some((item) => !bindingIds.includes(item.sourceEntityId))) blockers.push(blocker("specialist_unbound_assignment_item"));
      for (const { activity, entry } of flatBindings) {
        const item = itemBySource.get(entry.sourceEntityId);
        if (!item || item.position !== entry.position || item.sectionKey !== activity.sectionKey || expectedDynamicAffixActivityId(item) !== activity.activityId) blockers.push(blocker("specialist_item_binding_mismatch", entry.sourceEntityId));
      }
    }
  }
  if (snapshot.segments.length !== 1 || snapshot.segments[0]?.segmentId !== "lesson"
    || canonicalSnapshotJson(snapshot.segments[0]?.activityIds) !== canonicalSnapshotJson(snapshot.activities.map((entry) => entry.activityId))) blockers.push(blocker("malformed_specialist_snapshot_v3"));
  const fingerprint = snapshot.provenance.sourceFingerprint;
  if (snapshot.provenance.sourceKind !== "compiled_specialist_assignment" || snapshot.provenance.fingerprintAlgorithm !== "sha256"
    || snapshot.provenance.fingerprintVersion !== 1 || !/^[a-f0-9]{64}$/u.test(fingerprint)
    || fingerprintSnapshotValue({ ...snapshot, provenance: { sourceKind: snapshot.provenance.sourceKind, fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm, fingerprintVersion: snapshot.provenance.fingerprintVersion } }) !== fingerprint) blockers.push(blocker("specialist_fingerprint_mismatch"));
  return blockers.length === 0 ? { ok: true, snapshot } : { ok: false, blockers };
}

export function validateCompiledSpecialistSnapshotV3(
  value: unknown,
  context: SpecialistSnapshotV3ValidationContext = {},
): SpecialistSnapshotV3ValidationResult {
  if (record(value) && record(value.route) && (value.route.routeId === "dynamic_prefix_word_lab" || value.route.routeId === "base_word_lab")) {
    return validatePrefixOrBaseSnapshot(value, context);
  }
  if (record(value) && record(value.route) && value.route.routeId === "dynamic_affix_word_lab") {
    return validateDynamicAffixSpecialistSnapshotV3(value, context);
  }
  return validateCompoundWordSpecialistSnapshotV3(value, context);
}

const PREFIX_BASE_CONTRACTS = new Set([
  "INTRODUCTION.teaching_page@1", "MEANING_DISCOVERY.prefix@1", "CLEAVER.find_boundaries@1",
  "MEANING_SORT.meaning@1", "MEANING_SORT.prefix_form@1", "WORD_ASSEMBLY.definition_word_builder@1",
  "COVER_CHECK.component_marked@1", "COVER_CHECK.ratio_close_policy@1", "COVER_CHECK.whole_word@1",
  "DICTATION.target_token@1", "WORD_FAMILY_REVEAL.base_led_family@1", "CLEAVER.isolate_component@1",
  "LESSON_REFLECTION.standard_lesson_reflection@1",
]);

function expectedPrefixBaseActivity(item: SpecialistSnapshotV3ValidationItem, routeId: string): string | null {
  const source = routeId === "dynamic_prefix_word_lab" ? item.promptData.dynamicPrefixActivityId : item.promptData.pilotActivityId;
  if (typeof source !== "string") return null;
  if (routeId === "dynamic_prefix_word_lab") {
    if (source === "intro-root" || source === "intro-words") return "teaching-pages";
    if (source.startsWith("guided-strip-")) return "split";
    if (source.startsWith("guided-meaning-")) return "meaning";
    if (source.startsWith("guided-build-")) return "build";
    if (source.startsWith("controlled-")) return "cover";
    if (source.startsWith("dictation-")) return "dictation";
  } else {
    if (source === "strategy-intro") return "teaching-pages";
    if (source.startsWith("family-reveal-")) return `family-${source.slice("family-reveal-".length)}`;
    if (source.startsWith("cleave-")) return source;
    if (source === "word-sum-builder") return "word-sums";
    if (source.startsWith("controlled-")) return "cover";
    if (source.startsWith("dictation-")) return "dictation";
  }
  return null;
}

function validatePrefixOrBaseSnapshot(value: Record<string, unknown>, context: SpecialistSnapshotV3ValidationContext): SpecialistSnapshotV3ValidationResult {
  const snapshot = value as unknown as CompiledDynamicPrefixSpecialistSnapshotV3 | CompiledBaseWordSpecialistSnapshotV3;
  const blockers: ReturnType<typeof blocker>[] = [];
  const prefix = snapshot.route.routeId === "dynamic_prefix_word_lab";
  if (snapshot.snapshotSchemaVersion !== 3 || snapshot.compilerVersion !== SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION || snapshot.validatorVersion !== SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION || snapshot.canonicalContractRegistryVersion !== SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION) blockers.push(blocker("specialist_version_mismatch"));
  const expected = prefix
    ? { routeVersion: "v2", recipe: "dynamic_prefix_word_lab", recipeVersion: "v2", kind: "dynamic_prefix_lesson_v2", version: 2, adapter: "dynamic_prefix_v2", renderer: "morphology_guided", generation: "adle_composer_v1" }
    : { routeVersion: "v2", recipe: "base_word_family", recipeVersion: "v1", kind: "base_word_family_snapshot_v1", version: 1, adapter: "base_word_family_v1", renderer: "base_word_family_guided", generation: "adle_base_word_family_pilot_v1" };
  if (snapshot.route.routeVersion !== expected.routeVersion || snapshot.recipe.recipeKey !== expected.recipe || snapshot.recipe.recipeVersion !== expected.recipeVersion || snapshot.payload.kind !== expected.kind || snapshot.payload.version !== expected.version) blockers.push(blocker("specialist_route_mismatch"));
  if (context.lessonRouteMetadata !== undefined) {
    const metadata = context.lessonRouteMetadata;
    if (!record(metadata) || !record(metadata.route) || !record(metadata.recipe) || !record(metadata.payload)
      || metadata.route.routeId !== snapshot.route.routeId || metadata.route.routeVersion !== snapshot.route.routeVersion
      || metadata.recipe.recipeKey !== snapshot.recipe.recipeKey || metadata.recipe.recipeVersion !== snapshot.recipe.recipeVersion
      || metadata.payload.kind !== snapshot.payload.kind || metadata.payload.version !== snapshot.payload.version) blockers.push(blocker("specialist_route_mismatch"));
  }
  if (snapshot.runtime.adapterKey !== expected.adapter || snapshot.runtime.rendererKey !== expected.renderer) blockers.push(blocker("specialist_runtime_mismatch"));
  if (snapshot.assignment.generationSource !== expected.generation || (context.assignmentGenerationSource !== undefined && context.assignmentGenerationSource !== expected.generation) || (prefix ? ![16, 18, 20].includes(snapshot.assignment.itemCount) : snapshot.assignment.itemCount !== 18)) blockers.push(blocker("specialist_assignment_mismatch"));
  const resolved = prefix ? resolveDynamicPrefixLessonAuthorityV2(snapshot.payload.resolvedLesson?.sourcePayload) : resolveBaseWordFamilyLessonAuthorityV2(snapshot.payload.resolvedLesson?.sourcePayload);
  if (!resolved || canonicalSnapshotJson(resolved) !== canonicalSnapshotJson(snapshot.payload.resolvedLesson)) blockers.push(blocker("specialist_resolved_lesson_mismatch"));
  if (!Array.isArray(snapshot.words) || (prefix ? snapshot.words.length !== 4 : snapshot.words.length !== 6) || new Set(snapshot.words.map((word) => word.canonicalWordId)).size !== snapshot.words.length) blockers.push(blocker("specialist_payload_mismatch"));
  if (!Array.isArray(snapshot.contentVersions) || snapshot.contentVersions.length !== (prefix ? 17 : 7) || snapshot.contentVersions.some((entry) => !nonEmpty(entry.authorityId) || !nonEmpty(entry.version) || !/^[a-f0-9]{64}$/u.test(entry.sourceHash))) blockers.push(blocker("specialist_content_provenance_malformed"));
  if (!Array.isArray(snapshot.activities) || !snapshot.activities.every(activityShape)) blockers.push(blocker("malformed_specialist_snapshot_v3"));
  else {
    const ids = snapshot.activities.map((activity) => activity.activityId);
    if (new Set(ids).size !== ids.length || snapshot.activities.some((activity, index) => activity.order !== index + 1)) blockers.push(blocker("malformed_specialist_snapshot_v3"));
    const expectedIds = prefix
      ? (() => { const runtime = (snapshot as CompiledDynamicPrefixSpecialistSnapshotV3).payload.resolvedLesson.runtimePayload; return ["teaching-pages", "discover", "split", ...(runtime.activities.some((entry) => entry.type === "meaning_sort") ? ["meaning"] : []), "build", "cover", "dictation", "lesson-reflection"]; })()
      : (() => { const source = (snapshot as CompiledBaseWordSpecialistSnapshotV3).payload.resolvedLesson.sourcePayload; return ["teaching-pages", ...source.familySections.map((section) => `family-${section.baseFamilyKey}`), ...source.authenticTargets.map((target) => `cleave-${target.canonicalWordId}`), "word-sums", "cover", "dictation", "lesson-reflection"]; })();
    if (canonicalSnapshotJson(ids) !== canonicalSnapshotJson(expectedIds)) blockers.push(blocker("specialist_payload_mismatch"));
    for (const activity of snapshot.activities) {
      const key = `${activity.canonical.concept}.${activity.canonical.mode}@${activity.canonical.contractVersion}`;
      if (!PREFIX_BASE_CONTRACTS.has(key)) blockers.push(blocker("specialist_unsupported_canonical_contract", key));
      const routeOwned = activity.activityId === "lesson-reflection" || (prefix && activity.activityId === "discover");
      if ((activity.ownership === "route_owned") !== routeOwned) blockers.push(blocker("specialist_item_binding_mismatch", activity.activityId));
    }
    const flat = snapshot.activities.flatMap((activity) => activity.itemBindings.map((entry) => ({ activity, entry })));
    if (new Set(flat.map(({ entry }) => entry.sourceEntityId)).size !== flat.length) blockers.push(blocker("specialist_duplicate_item_binding"));
    if (context.items) {
      const byId = new Map(context.items.map((item) => [item.sourceEntityId, item]));
      if (flat.length !== context.items.length || context.items.length !== snapshot.assignment.itemCount || context.items.some((item) => !flat.some(({ entry }) => entry.sourceEntityId === item.sourceEntityId))) blockers.push(blocker("specialist_unbound_assignment_item"));
      for (const { activity, entry } of flat) { const item = byId.get(entry.sourceEntityId); if (!item || item.position !== entry.position || item.sectionKey !== activity.sectionKey || expectedPrefixBaseActivity(item, snapshot.route.routeId) !== activity.activityId) blockers.push(blocker("specialist_item_binding_mismatch", entry.sourceEntityId)); }
    }
  }
  const fingerprint = snapshot.provenance?.sourceFingerprint;
  if (!nonEmpty(fingerprint) || fingerprintSnapshotValue({ ...snapshot, provenance: { sourceKind: snapshot.provenance.sourceKind, fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm, fingerprintVersion: snapshot.provenance.fingerprintVersion } }) !== fingerprint) blockers.push(blocker("specialist_fingerprint_mismatch"));
  return blockers.length ? { ok: false, blockers } : { ok: true, snapshot };
}

export function isDynamicAffixSpecialistSnapshotV3(value: unknown): value is CompiledDynamicAffixSpecialistSnapshotV3 {
  return record(value) && value.snapshotSchemaVersion === 3 && record(value.route) && value.route.routeId === "dynamic_affix_word_lab";
}

export function isDynamicPrefixSpecialistSnapshotV3(value: unknown): value is CompiledDynamicPrefixSpecialistSnapshotV3 {
  return record(value) && value.snapshotSchemaVersion === 3 && record(value.route) && value.route.routeId === "dynamic_prefix_word_lab";
}
export function isBaseWordSpecialistSnapshotV3(value: unknown): value is CompiledBaseWordSpecialistSnapshotV3 {
  return record(value) && value.snapshotSchemaVersion === 3 && record(value.route) && value.route.routeId === "base_word_lab";
}

export function isSpecialistSnapshotV3(value: unknown): value is CompiledSpecialistSnapshotV3 {
  return isCompoundWordSpecialistSnapshotV3(value) || isDynamicAffixSpecialistSnapshotV3(value) || isDynamicPrefixSpecialistSnapshotV3(value) || isBaseWordSpecialistSnapshotV3(value);
}
