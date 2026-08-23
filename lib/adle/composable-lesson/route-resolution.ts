import type {
  LessonRendererKey,
  LessonRouteId,
  LessonRouteResolutionBlockerCode,
  LessonRouteResolutionSource,
  LessonRuntimeAdapterKey,
  PersistedLessonRouteMetadataV1,
  VersionedLessonPayloadReference,
  VersionedLessonRouteReference,
} from "./contracts";
import {
  parsePersistedLessonRouteMetadata,
  validatePersistedRouteMetadataCompatibility,
} from "./persisted-route-metadata";
import {
  getCurriculumRouteDefinition,
  type CurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";
import {
  resolveMorphologyPilotRuntime,
  validateMorphologyLessonPayload,
  type MorphologyLessonPayloadV1,
} from "../morphology/payload";
import {
  dynamicPrefixRuntime,
  resolveDynamicPrefixRuntime,
} from "../morphology/dynamic-prefix-runtime";
import { validateDynamicPrefixWordLabPayload } from "../morphology/dynamic-prefix-word-lab";
import {
  resolveDynamicAffixLessonAuthorityV3,
  resolveDynamicAffixRuntime,
} from "../morphology/dynamic-affix-runtime";
import {
  dynamicAffixExpectedItemCount,
  validateDynamicAffixWordLabPayload,
} from "../morphology/affix-word-lab";
import {
  resolveBaseWordFamilyPilotRuntime,
} from "../morphology/base-word-family-pilot-contract";
import {
  validateBaseWordFamilyLessonSnapshot,
  type BaseWordFamilyLessonSnapshotV1,
} from "../morphology/base-word-family-payload";
import {
  validateClosedCompoundLessonPayload,
  type ClosedCompoundLessonPayloadV1,
} from "../morphology/closed-compound-word-lab";
import {
  COMPOUND_WORD_LESSON_ITEM_COUNT,
  validateCompoundWordLessonPayloadV2,
  type CompoundWordLessonPayloadV2,
} from "../morphology/compound-word-lesson-v2";
import { resolveCompoundWordFirstImpressionConfig, type ResolvedCompoundWordFirstImpressionV2 } from "../morphology/resolved-compound-word-lesson-v2";
import { isCompoundWordSpecialistSnapshotV3, isDynamicAffixSpecialistSnapshotV3, validateCompiledSpecialistSnapshotV3 } from "./specialist-snapshot-v3-validator";

export interface LessonRouteResolutionItem {
  id: string;
  sourceEntityId?: string;
  position?: number;
  sectionKey: string;
  templateKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
  promptData: Record<string, unknown>;
  itemMetadata?: Record<string, unknown>;
}

export interface LessonRouteRuntimeContext {
  morphologyUnEnabled: boolean;
  dynamicPrefixEnabled: boolean;
  dynamicAffixEnabled: boolean;
  baseWordFamilyEnabled: boolean;
}

export const ADLE_IMPLEMENTED_RUNTIME_ADAPTER_KEYS = [
  "generic_composer_v1",
  "morphology_guided_v1",
  "dynamic_prefix_v2",
  "dynamic_affix_v3",
  "closed_compound_v1",
  "compound_word_v2",
  "base_word_family_v1",
] as const satisfies readonly LessonRuntimeAdapterKey[];

export type ResolvedLessonRuntime =
  | {
      adapterKey: "generic_composer_v1";
      rendererKey: "generic_session";
      payload: null;
    }
  | {
      adapterKey:
        | "morphology_guided_v1"
        | "dynamic_prefix_v2";
      rendererKey: "morphology_guided";
      payload: MorphologyLessonPayloadV1;
    }
  | {
      adapterKey: "dynamic_affix_v3";
      rendererKey: "morphology_guided";
      payload: MorphologyLessonPayloadV1;
      sourcePayload: import("../morphology/affix-word-lab").DynamicAffixLessonPayloadV3;
      resolvedLesson: import("../morphology/dynamic-affix-runtime").ResolvedDynamicAffixLessonV3;
    }
  | {
      adapterKey: "closed_compound_v1";
      rendererKey: "closed_compound_guided";
      payload: ClosedCompoundLessonPayloadV1;
      completionPayload: MorphologyLessonPayloadV1;
    }
  | {
      adapterKey: "compound_word_v2";
      rendererKey: "compound_word_guided";
      payload: CompoundWordLessonPayloadV2;
      resolvedLesson: ResolvedCompoundWordFirstImpressionV2;
    }
  | {
      adapterKey: "base_word_family_v1";
      rendererKey: "base_word_family_guided";
      payload: BaseWordFamilyLessonSnapshotV1;
    };

export type LessonRouteResolutionResult =
  | {
      status: "resolved_explicit";
      source: "persisted_metadata";
      route: VersionedLessonRouteReference;
      recipe: PersistedLessonRouteMetadataV1["recipe"];
      payloadRef: VersionedLessonPayloadReference;
      runtime: ResolvedLessonRuntime;
    }
  | {
      status: "resolved_legacy";
      source: "legacy_detection";
      route: VersionedLessonRouteReference;
      recipe: PersistedLessonRouteMetadataV1["recipe"];
      payloadRef: VersionedLessonPayloadReference;
      runtime: ResolvedLessonRuntime;
    }
  | {
      status: "blocked";
      source: LessonRouteResolutionSource;
      blockers: readonly { code: LessonRouteResolutionBlockerCode }[];
    };

type AdapterResult =
  | { ok: true; runtime: ResolvedLessonRuntime }
  | { ok: false; blocker: LessonRouteResolutionBlockerCode };

function blocked(
  source: LessonRouteResolutionSource,
  ...codes: LessonRouteResolutionBlockerCode[]
): LessonRouteResolutionResult {
  return {
    status: "blocked",
    source,
    blockers: [...new Set(codes)].map((code) => ({ code })),
  };
}

function roots(
  items: readonly LessonRouteResolutionItem[],
  field: string,
  value: string,
): LessonRouteResolutionItem[] {
  return items.filter((item) => item.promptData[field] === value);
}

function routeDefinition(
  routeId: LessonRouteId,
  routeVersion: string,
): CurriculumRouteDefinition | null {
  return getCurriculumRouteDefinition(routeId, routeVersion);
}

function refs(route: CurriculumRouteDefinition) {
  const recipe = route.recipes[0];
  return {
    route: {
      routeId: route.routeId as LessonRouteId,
      routeVersion: route.routeVersion,
    },
    recipe,
    payloadRef: {
      kind: route.payloadKind,
      version: route.payloadVersions[0],
    },
  };
}

function compoundCompletionPayload(
  payload: ClosedCompoundLessonPayloadV1,
): MorphologyLessonPayloadV1 {
  return {
    microSkillId: payload.microSkillId,
    contentVersion: payload.contentVersion,
    activities: [
      {
        type: "sentence_dictation",
        sentences: payload.activities.dictation,
      },
      {
        type: "reflection",
        promptKey: payload.activities.reflection.promptKey,
        promptText: payload.activities.reflection.promptText,
      },
    ],
  } as unknown as MorphologyLessonPayloadV1;
}

function validateClosedCompoundBindings(
  items: readonly LessonRouteResolutionItem[],
  payload: ClosedCompoundLessonPayloadV1,
): boolean {
  const expected = [
    {
      id: "intro-root",
      section: "lesson_intro",
      template: "MICRO_READ_ONLY_INTRO",
      canonicalWordId: null,
      targetWord: null,
    },
    {
      id: "intro-words",
      section: "lesson_intro",
      template: "LESSON_WORDS_INTRO",
      canonicalWordId: null,
      targetWord: null,
    },
    ...payload.words.lesson.flatMap((word) => [
      {
        id: `jigsaw-${word.canonicalWordId}`,
        section: "guided_practice",
        template: "MOR_COMPOUND_JIGSAW",
        canonicalWordId: word.canonicalWordId,
        targetWord: word.displayWord,
      },
      {
        id: `meaning-${word.canonicalWordId}`,
        section: "guided_practice",
        template: "MOR_COMPOUND_MEANING_CONNECTION",
        canonicalWordId: word.canonicalWordId,
        targetWord: word.displayWord,
      },
    ]),
    ...payload.words.lesson.map((word) => ({
      id: `controlled-${word.canonicalWordId}`,
      section: "lesson_production",
      template: "CONTROLLED_SPELLING",
      canonicalWordId: word.canonicalWordId,
      targetWord: word.displayWord,
    })),
    ...payload.activities.dictation.map((sentence) => ({
      id: `dictation-${sentence.canonicalWordId}`,
      section: "lesson_dictation",
      template: "DICTATION_NO_IMAGE",
      canonicalWordId: sentence.canonicalWordId,
      targetWord: sentence.targetWord,
    })),
  ];
  if (items.length !== expected.length) return false;
  const observed = new Set<string>();
  for (const item of items) {
    const binding = item.promptData.closedCompoundActivityId;
    if (typeof binding !== "string" || observed.has(binding)) return false;
    observed.add(binding);
    const spec = expected.find((candidate) => candidate.id === binding);
    if (
      !spec ||
      item.sectionKey !== spec.section ||
      item.templateKey !== spec.template ||
      item.canonicalWordId !== spec.canonicalWordId ||
      item.targetWord !== spec.targetWord
    ) {
      return false;
    }
  }
  return observed.size === expected.length;
}

function validateCompoundWordV2Bindings(
  items: readonly LessonRouteResolutionItem[],
  payload: CompoundWordLessonPayloadV2,
): boolean {
  const expected = [
    { id: "intro-root", section: "lesson_intro", template: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null },
    { id: "intro-words", section: "lesson_intro", template: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null },
    ...payload.words.lesson.flatMap((word) => {
      const canonicalWordId = word.structure.wholeCanonicalWordId;
      const targetWord = word.structure.wholeWord;
      return [
        { id: `jigsaw-${canonicalWordId}`, section: "guided_practice", template: "MOR_COMPOUND_JIGSAW", canonicalWordId, targetWord },
        { id: `meaning-${canonicalWordId}`, section: "guided_practice", template: "MOR_COMPOUND_MEANING_CONNECTION", canonicalWordId, targetWord },
      ];
    }),
    ...payload.words.lesson.map((word) => ({
      id: `controlled-${word.structure.wholeCanonicalWordId}`,
      section: "lesson_production",
      template: "CONTROLLED_SPELLING",
      canonicalWordId: word.structure.wholeCanonicalWordId,
      targetWord: word.structure.wholeWord,
    })),
    ...payload.words.lesson.map((word) => ({
      id: `dictation-${word.structure.wholeCanonicalWordId}`,
      section: "lesson_dictation",
      template: "DICTATION_NO_IMAGE",
      canonicalWordId: word.structure.wholeCanonicalWordId,
      targetWord: word.structure.wholeWord,
    })),
  ];
  if (items.length !== COMPOUND_WORD_LESSON_ITEM_COUNT || expected.length !== items.length) return false;
  const expectedById = new Map(expected.map((entry) => [entry.id, entry]));
  const observed = new Set<string>();
  for (const item of items) {
    const binding = item.promptData.compoundWordActivityId;
    if (typeof binding !== "string" || observed.has(binding)) return false;
    observed.add(binding);
    const spec = expectedById.get(binding);
    if (
      !spec ||
      item.sectionKey !== spec.section ||
      item.templateKey !== spec.template ||
      item.canonicalWordId !== spec.canonicalWordId ||
      item.targetWord !== spec.targetWord
    ) return false;
  }
  return observed.size === expected.length;
}

function runAdapter(
  route: CurriculumRouteDefinition,
  items: readonly LessonRouteResolutionItem[],
  context: LessonRouteRuntimeContext,
): AdapterResult {
  switch (route.runtimeAdapterKey) {
    case "generic_composer_v1":
      return {
        ok: true,
        runtime: {
          adapterKey: "generic_composer_v1",
          rendererKey: "generic_session",
          payload: null,
        },
      };
    case "morphology_guided_v1": {
      const candidates = roots(items, "pilotActivityId", "intro-root");
      if (candidates.length === 0) return { ok: false, blocker: "root_item_missing" };
      if (candidates.length > 1) return { ok: false, blocker: "root_item_duplicate" };
      if (!validateMorphologyLessonPayload(candidates[0].promptData.morphologyLesson)) {
        return { ok: false, blocker: "persisted_payload_malformed" };
      }
      if (!context.morphologyUnEnabled) return { ok: false, blocker: "route_unavailable" };
      const payload = resolveMorphologyPilotRuntime(context.morphologyUnEnabled, items);
      return payload
        ? {
            ok: true,
            runtime: {
              adapterKey: "morphology_guided_v1",
              rendererKey: "morphology_guided",
              payload,
            },
          }
        : { ok: false, blocker: "assignment_binding_mismatch" };
    }
    case "dynamic_prefix_v2": {
      const candidates = roots(items, "dynamicPrefixActivityId", "intro-root");
      if (candidates.length === 0) return { ok: false, blocker: "root_item_missing" };
      if (candidates.length > 1) return { ok: false, blocker: "root_item_duplicate" };
      const source = candidates[0].promptData.dynamicPrefixLesson;
      if (!validateDynamicPrefixWordLabPayload(source) || !dynamicPrefixRuntime(source)) {
        return { ok: false, blocker: "persisted_payload_malformed" };
      }
      if (!context.dynamicPrefixEnabled) return { ok: false, blocker: "route_unavailable" };
      const payload = resolveDynamicPrefixRuntime(context.dynamicPrefixEnabled, items);
      return payload
        ? {
            ok: true,
            runtime: {
              adapterKey: "dynamic_prefix_v2",
              rendererKey: "morphology_guided",
              payload,
            },
          }
        : { ok: false, blocker: "assignment_binding_mismatch" };
    }
    case "dynamic_affix_v3": {
      const candidates = roots(items, "dynamicAffixActivityId", "intro-root");
      if (candidates.length === 0) return { ok: false, blocker: "root_item_missing" };
      if (candidates.length > 1) return { ok: false, blocker: "root_item_duplicate" };
      const source = candidates[0].promptData.dynamicAffixLesson;
      const resolvedLesson = validateDynamicAffixWordLabPayload(source)
        ? resolveDynamicAffixLessonAuthorityV3(source)
        : null;
      if (
        !validateDynamicAffixWordLabPayload(source) ||
        !resolvedLesson ||
        items.length !== dynamicAffixExpectedItemCount(source)
      ) {
        return { ok: false, blocker: "persisted_payload_malformed" };
      }
      if (!context.dynamicAffixEnabled) return { ok: false, blocker: "route_unavailable" };
      const payload = resolveDynamicAffixRuntime(context.dynamicAffixEnabled, items);
      return payload
        ? {
            ok: true,
            runtime: {
              adapterKey: "dynamic_affix_v3",
              rendererKey: "morphology_guided",
              payload,
              sourcePayload: resolvedLesson.sourcePayload,
              resolvedLesson,
            },
          }
        : { ok: false, blocker: "assignment_binding_mismatch" };
    }
    case "closed_compound_v1": {
      const candidates = roots(items, "closedCompoundActivityId", "intro-root");
      if (candidates.length === 0) return { ok: false, blocker: "root_item_missing" };
      if (candidates.length > 1) return { ok: false, blocker: "root_item_duplicate" };
      const source = candidates[0].promptData.closedCompoundLesson;
      if (!validateClosedCompoundLessonPayload(source)) {
        return { ok: false, blocker: "persisted_payload_malformed" };
      }
      if (!validateClosedCompoundBindings(items, source)) {
        return { ok: false, blocker: "assignment_binding_mismatch" };
      }
      return {
        ok: true,
        runtime: {
          adapterKey: "closed_compound_v1",
          rendererKey: "closed_compound_guided",
          payload: source,
          completionPayload: compoundCompletionPayload(source),
        },
      };
    }
    case "compound_word_v2": {
      const candidates = roots(items, "compoundWordActivityId", "intro-root");
      if (candidates.length === 0) return { ok: false, blocker: "root_item_missing" };
      if (candidates.length > 1) return { ok: false, blocker: "root_item_duplicate" };
      const source = candidates[0].promptData.compoundWordLesson;
      if (!validateCompoundWordLessonPayloadV2(source)) {
        return { ok: false, blocker: "persisted_payload_malformed" };
      }
      if (!validateCompoundWordV2Bindings(items, source)) {
        return { ok: false, blocker: "assignment_binding_mismatch" };
      }
      const resolvedLesson = resolveCompoundWordFirstImpressionConfig(source);
      if (!resolvedLesson) return { ok: false, blocker: "persisted_payload_malformed" };
      return {
        ok: true,
        runtime: {
          adapterKey: "compound_word_v2",
          rendererKey: "compound_word_guided",
          payload: source,
          resolvedLesson,
        },
      };
    }
    case "base_word_family_v1": {
      const candidates = roots(items, "pilotActivityId", "strategy-intro");
      if (candidates.length === 0) return { ok: false, blocker: "root_item_missing" };
      if (candidates.length > 1) return { ok: false, blocker: "root_item_duplicate" };
      if (!validateBaseWordFamilyLessonSnapshot(candidates[0].promptData.baseWordFamilyLesson)) {
        return { ok: false, blocker: "persisted_payload_malformed" };
      }
      if (!context.baseWordFamilyEnabled) return { ok: false, blocker: "route_unavailable" };
      const payload = resolveBaseWordFamilyPilotRuntime(
        context.baseWordFamilyEnabled,
        items,
      );
      return payload
        ? {
            ok: true,
            runtime: {
              adapterKey: "base_word_family_v1",
              rendererKey: "base_word_family_guided",
              payload,
            },
          }
        : { ok: false, blocker: "assignment_binding_mismatch" };
    }
  }
}

function detectedLegacyRouteIds(
  items: readonly LessonRouteResolutionItem[],
): LessonRouteId[] {
  const ids: LessonRouteId[] = [];
  if (roots(items, "closedCompoundActivityId", "intro-root").length > 0) {
    ids.push("closed_compound_word_lab");
  }
  if (roots(items, "pilotActivityId", "strategy-intro").length > 0) {
    ids.push("base_word_lab");
  }
  if (roots(items, "dynamicAffixActivityId", "intro-root").length > 0) {
    ids.push("dynamic_affix_word_lab");
  }
  if (roots(items, "dynamicPrefixActivityId", "intro-root").length > 0) {
    ids.push("dynamic_prefix_word_lab");
  }
  if (roots(items, "pilotActivityId", "intro-root").length > 0) {
    ids.push("fixed_un_prefix_word_lab");
  }
  return ids;
}

function detectedBoundRouteIds(
  items: readonly LessonRouteResolutionItem[],
): LessonRouteId[] {
  const ids = detectedLegacyRouteIds(items);
  if (roots(items, "compoundWordActivityId", "intro-root").length > 0) {
    ids.push("compound_word_lab");
  }
  return ids;
}

function reservedItemMetadataPresent(
  items: readonly LessonRouteResolutionItem[],
): boolean {
  return items.some(
    (item) =>
      Object.hasOwn(item.promptData, "lessonRouteMetadata") ||
      (item.itemMetadata !== undefined &&
        Object.hasOwn(item.itemMetadata, "lessonRouteMetadata")),
  );
}

function resolveLegacy(
  items: readonly LessonRouteResolutionItem[],
  context: LessonRouteRuntimeContext,
): LessonRouteResolutionResult {
  const detected = detectedLegacyRouteIds(items);
  if (detected.length > 1) {
    return blocked("legacy_detection", "multiple_legacy_routes");
  }
  const routeId = detected[0] ?? "generic_composer";
  const version =
    routeId === "dynamic_prefix_word_lab"
      ? "v2"
      : routeId === "dynamic_affix_word_lab"
        ? "v3"
        : routeId === "base_word_lab"
          ? "v2"
          : "v1";
  const route = routeDefinition(routeId, version);
  if (!route) return blocked("legacy_detection", "unsupported_legacy_payload");
  const adapter = runAdapter(route, items, context);
  if (!adapter.ok) return blocked("legacy_detection", adapter.blocker);
  return {
    status: "resolved_legacy",
    source: "legacy_detection",
    ...refs(route),
    runtime: adapter.runtime,
  };
}

export function resolvePersistedLessonRoute(input: {
  lessonRouteMetadata: unknown | null;
  items: readonly LessonRouteResolutionItem[];
  runtimeContext: LessonRouteRuntimeContext;
  compiledLessonSnapshot?: unknown | null;
}): LessonRouteResolutionResult {
  const { lessonRouteMetadata, items, runtimeContext } = input;
  if (lessonRouteMetadata === null || lessonRouteMetadata === undefined) {
    return resolveLegacy(items, runtimeContext);
  }
  if (reservedItemMetadataPresent(items)) {
    return blocked("persisted_metadata", "duplicate_metadata_source");
  }
  const parsed = parsePersistedLessonRouteMetadata(lessonRouteMetadata);
  if (!parsed.ok) return blocked("persisted_metadata", parsed.blocker);
  const compatibility = validatePersistedRouteMetadataCompatibility(
    parsed.metadata,
  );
  if (!compatibility.ok) {
    return blocked("persisted_metadata", compatibility.blocker);
  }
  const route = routeDefinition(
    parsed.metadata.route.routeId,
    parsed.metadata.route.routeVersion,
  );
  if (!route) return blocked("persisted_metadata", "unknown_route");
  if (
    route.implementationState !== "registered" &&
    route.routeId !== "closed_compound_word_lab"
  ) {
    return blocked("persisted_metadata", "route_unavailable");
  }
  const detected = detectedBoundRouteIds(items);
  if (
    detected.length > 1 ||
    (detected.length === 1 && detected[0] !== route.routeId)
  ) {
    return blocked("persisted_metadata", "explicit_legacy_disagreement");
  }
  if (
    route.routeId === "generic_composer" &&
    detected.length > 0
  ) {
    return blocked("persisted_metadata", "explicit_legacy_disagreement");
  }
  let adapterItems = items;
  let frozenCompoundLesson: ResolvedCompoundWordFirstImpressionV2 | null = null;
  let frozenDynamicAffixLesson: import("../morphology/dynamic-affix-runtime").ResolvedDynamicAffixLessonV3 | null = null;
  if (isCompoundWordSpecialistSnapshotV3(input.compiledLessonSnapshot)) {
    if (route.routeId !== "compound_word_lab") {
      return blocked("persisted_metadata", "persisted_payload_malformed");
    }
    const specialist = validateCompiledSpecialistSnapshotV3(input.compiledLessonSnapshot, {
      lessonRouteMetadata,
      assignmentGenerationSource: "adle_composer_v1",
      items: items.map((item) => ({
        sourceEntityId: item.sourceEntityId ?? "",
        position: item.position ?? 0,
        sectionKey: item.sectionKey,
        canonicalWordId: item.canonicalWordId,
        templateKey: item.templateKey,
        targetWord: item.targetWord,
        promptData: item.promptData,
      })),
    });
    if (!specialist.ok) return blocked("persisted_metadata", "persisted_payload_malformed");
    frozenCompoundLesson = input.compiledLessonSnapshot.payload.resolvedLesson;
    adapterItems = items.map((item) => item.promptData.compoundWordActivityId === "intro-root"
      ? { ...item, promptData: { ...item.promptData, compoundWordLesson: frozenCompoundLesson!.sourcePayload } }
      : item);
  } else if (isDynamicAffixSpecialistSnapshotV3(input.compiledLessonSnapshot)) {
    if (route.routeId !== "dynamic_affix_word_lab") return blocked("persisted_metadata", "persisted_payload_malformed");
    const specialist = validateCompiledSpecialistSnapshotV3(input.compiledLessonSnapshot, {
      lessonRouteMetadata,
      assignmentGenerationSource: "adle_composer_v1",
      items: items.map((item) => ({
        sourceEntityId: item.sourceEntityId ?? "", position: item.position ?? 0, sectionKey: item.sectionKey,
        canonicalWordId: item.canonicalWordId, templateKey: item.templateKey, targetWord: item.targetWord, promptData: item.promptData,
      })),
    });
    if (!specialist.ok || specialist.snapshot.route.routeId !== "dynamic_affix_word_lab") return blocked("persisted_metadata", "persisted_payload_malformed");
    frozenDynamicAffixLesson = input.compiledLessonSnapshot.payload.resolvedLesson;
    adapterItems = items.map((item) => item.promptData.dynamicAffixActivityId === "intro-root"
      ? { ...item, promptData: { ...item.promptData, dynamicAffixLesson: frozenDynamicAffixLesson!.sourcePayload } }
      : item);
  } else if ((route.routeId === "compound_word_lab" || route.routeId === "dynamic_affix_word_lab")
    && input.compiledLessonSnapshot !== null
    && input.compiledLessonSnapshot !== undefined) {
    return blocked("persisted_metadata", "persisted_payload_malformed");
  }
  const adapter = runAdapter(route, adapterItems, runtimeContext);
  if (!adapter.ok) return blocked("persisted_metadata", adapter.blocker);
  if (frozenCompoundLesson && adapter.runtime.adapterKey === "compound_word_v2") {
    adapter.runtime.resolvedLesson = frozenCompoundLesson;
  }
  if (frozenDynamicAffixLesson && adapter.runtime.adapterKey === "dynamic_affix_v3") {
    adapter.runtime.payload = frozenDynamicAffixLesson.runtimePayload;
    adapter.runtime.sourcePayload = frozenDynamicAffixLesson.sourcePayload;
    adapter.runtime.resolvedLesson = frozenDynamicAffixLesson;
  }
  return {
    status: "resolved_explicit",
    source: "persisted_metadata",
    route: parsed.metadata.route,
    recipe: parsed.metadata.recipe,
    payloadRef: parsed.metadata.payload,
    runtime: adapter.runtime,
  };
}

export function emitLessonRouteResolutionEvent(
  result: LessonRouteResolutionResult,
  assignmentGenerationSource: string | null,
): void {
  const event = {
    event: "adle_lesson_route_resolution",
    status: result.status,
    source: result.source,
    assignmentGenerationSource,
    ...(result.status === "blocked"
      ? { blockerCodes: result.blockers.map((entry) => entry.code) }
      : {
          routeId: result.route.routeId,
          routeVersion: result.route.routeVersion,
          payloadKind: result.payloadRef.kind,
          payloadVersion: result.payloadRef.version,
        }),
  };
  if (result.status === "blocked") {
    console.warn(JSON.stringify(event));
  } else {
    console.info(JSON.stringify(event));
  }
}

export function resolvedRendererKey(
  result: LessonRouteResolutionResult,
): LessonRendererKey | null {
  return result.status === "blocked" ? null : result.runtime.rendererKey;
}

export function resolvedAdapterKey(
  result: LessonRouteResolutionResult,
): LessonRuntimeAdapterKey | null {
  return result.status === "blocked" ? null : result.runtime.adapterKey;
}
