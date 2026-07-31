import type {
  LessonRouteId,
  LessonRouteResolutionBlockerCode,
  PersistedLessonRouteMetadataV1,
} from "./contracts";
import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  getCurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";

export const ADLE_ROUTE_METADATA_SCHEMA_VERSION = 1 as const;

export const ADLE_NEW_ASSIGNMENT_ROUTE_IDS = [
  "generic_composer",
  "base_word_lab",
  "dynamic_prefix_word_lab",
  "dynamic_affix_word_lab",
  "closed_compound_word_lab",
] as const satisfies readonly LessonRouteId[];

export type PersistedRouteMetadataParseResult =
  | { ok: true; metadata: PersistedLessonRouteMetadataV1 }
  | {
      ok: false;
      blocker:
        | "malformed_metadata"
        | "unsupported_metadata_schema_version";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePersistedLessonRouteMetadata(
  value: unknown,
): PersistedRouteMetadataParseResult {
  if (!isRecord(value)) {
    return { ok: false, blocker: "malformed_metadata" };
  }
  if (
    value.metadataSchemaVersion !== ADLE_ROUTE_METADATA_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      blocker:
        typeof value.metadataSchemaVersion === "number"
          ? "unsupported_metadata_schema_version"
          : "malformed_metadata",
    };
  }
  if (
    !hasOnlyKeys(value, [
      "metadataSchemaVersion",
      "route",
      "recipe",
      "payload",
    ]) ||
    !isRecord(value.route) ||
    !isRecord(value.recipe) ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.route, ["routeId", "routeVersion"]) ||
    !hasOnlyKeys(value.recipe, ["recipeKey", "recipeVersion"]) ||
    !hasOnlyKeys(value.payload, ["kind", "version"]) ||
    !nonEmptyString(value.route.routeId) ||
    !nonEmptyString(value.route.routeVersion) ||
    !nonEmptyString(value.recipe.recipeKey) ||
    !nonEmptyString(value.recipe.recipeVersion) ||
    !nonEmptyString(value.payload.kind) ||
    !Number.isInteger(value.payload.version) ||
    (value.payload.version as number) <= 0
  ) {
    return { ok: false, blocker: "malformed_metadata" };
  }
  return {
    ok: true,
    metadata: value as PersistedLessonRouteMetadataV1,
  };
}

export function createPersistedRouteMetadata(
  routeId: (typeof ADLE_NEW_ASSIGNMENT_ROUTE_IDS)[number],
): PersistedLessonRouteMetadataV1 {
  const matches = ADLE_CURRICULUM_ROUTE_REGISTRY.filter(
    (route) => route.routeId === routeId,
  );
  if (matches.length !== 1) {
    throw new Error(`Route metadata mapping is ambiguous for ${routeId}.`);
  }
  const route = matches[0];
  if (
    !route.newAssignmentCapable ||
    route.implementationState !== "registered" ||
    route.recipes.length !== 1 ||
    route.payloadVersions.length !== 1 ||
    !route.runtimeAdapterKey ||
    !route.rendererKey
  ) {
    throw new Error(
      `Route ${routeId}:${route.routeVersion} cannot write explicit metadata.`,
    );
  }
  const recipe = route.recipes[0];
  return {
    metadataSchemaVersion: ADLE_ROUTE_METADATA_SCHEMA_VERSION,
    route: {
      routeId,
      routeVersion: route.routeVersion,
    },
    recipe: {
      recipeKey: recipe.recipeKey,
      recipeVersion: recipe.recipeVersion,
    },
    payload: {
      kind: route.payloadKind,
      version: route.payloadVersions[0],
    },
  };
}

export function validatePersistedRouteMetadataCompatibility(
  metadata: PersistedLessonRouteMetadataV1,
):
  | { ok: true }
  | { ok: false; blocker: LessonRouteResolutionBlockerCode } {
  const route = getCurriculumRouteDefinition(
    metadata.route.routeId,
    metadata.route.routeVersion,
  );
  if (!route) {
    const routeIdExists = ADLE_CURRICULUM_ROUTE_REGISTRY.some(
      (candidate) => candidate.routeId === metadata.route.routeId,
    );
    return {
      ok: false,
      blocker: routeIdExists ? "unsupported_route_version" : "unknown_route",
    };
  }
  if (
    !route.recipes.some(
      (recipe) =>
        recipe.recipeKey === metadata.recipe.recipeKey &&
        recipe.recipeVersion === metadata.recipe.recipeVersion,
    )
  ) {
    return { ok: false, blocker: "recipe_mismatch" };
  }
  if (route.payloadKind !== metadata.payload.kind) {
    return { ok: false, blocker: "payload_kind_mismatch" };
  }
  if (!route.payloadVersions.includes(metadata.payload.version)) {
    return { ok: false, blocker: "payload_version_mismatch" };
  }
  return { ok: true };
}
