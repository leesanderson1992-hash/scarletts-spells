import type {
  LessonRouteId,
  LessonRouteResolutionBlockerCode,
  PersistedCurriculumReleaseAuthorityV2,
  PersistedLessonRouteMetadata,
  PersistedLessonRouteMetadataV1,
  PersistedLessonRouteMetadataV2,
} from "./contracts";
import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  getCurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";

export const ADLE_ROUTE_METADATA_SCHEMA_VERSION = 1 as const;
export const ADLE_ROUTE_METADATA_SCHEMA_VERSION_V2 = 2 as const;

export const ADLE_NEW_ASSIGNMENT_ROUTE_IDS = [
  "generic_composer",
  "base_word_lab",
  "dynamic_prefix_word_lab",
  "dynamic_affix_word_lab",
  "compound_word_lab",
] as const satisfies readonly LessonRouteId[];

export type PersistedRouteMetadataParseResult =
  | { ok: true; metadata: PersistedLessonRouteMetadata }
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function validCurriculumReleaseAuthority(
  value: unknown,
): value is PersistedCurriculumReleaseAuthorityV2 {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "activationRevisionId",
      "releaseManifestId",
      "releaseKey",
      "releaseManifestSha256",
      "dependencyFingerprint",
    ]) &&
    typeof value.activationRevisionId === "string" &&
    UUID.test(value.activationRevisionId) &&
    typeof value.releaseManifestId === "string" &&
    UUID.test(value.releaseManifestId) &&
    nonEmptyString(value.releaseKey) &&
    typeof value.releaseManifestSha256 === "string" &&
    SHA256.test(value.releaseManifestSha256) &&
    typeof value.dependencyFingerprint === "string" &&
    SHA256.test(value.dependencyFingerprint);
}

export function parsePersistedLessonRouteMetadata(
  value: unknown,
): PersistedRouteMetadataParseResult {
  if (!isRecord(value)) {
    return { ok: false, blocker: "malformed_metadata" };
  }
  if (value.metadataSchemaVersion !== ADLE_ROUTE_METADATA_SCHEMA_VERSION &&
      value.metadataSchemaVersion !== ADLE_ROUTE_METADATA_SCHEMA_VERSION_V2) {
    return {
      ok: false,
      blocker:
        typeof value.metadataSchemaVersion === "number"
          ? "unsupported_metadata_schema_version"
          : "malformed_metadata",
    };
  }
  const isV2 = value.metadataSchemaVersion === ADLE_ROUTE_METADATA_SCHEMA_VERSION_V2;
  if (
    !hasOnlyKeys(value, isV2 ? [
      "metadataSchemaVersion",
      "route",
      "recipe",
      "payload",
      "curriculumRelease",
    ] : [
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
    (value.payload.version as number) <= 0 ||
    (isV2 && !validCurriculumReleaseAuthority(value.curriculumRelease))
  ) {
    return { ok: false, blocker: "malformed_metadata" };
  }
  return {
    ok: true,
    metadata: value as PersistedLessonRouteMetadata,
  };
}

export function createPersistedRouteMetadataV2(
  routeId: (typeof ADLE_NEW_ASSIGNMENT_ROUTE_IDS)[number],
  curriculumRelease: PersistedCurriculumReleaseAuthorityV2,
): PersistedLessonRouteMetadataV2 {
  if (!validCurriculumReleaseAuthority(curriculumRelease)) {
    throw new Error("Invalid ADLE curriculum release authority.");
  }
  const v1 = createPersistedRouteMetadata(routeId);
  const route = getCurriculumRouteDefinition(
    v1.route.routeId,
    v1.route.routeVersion,
  );
  if (route?.activationAuthority !== "database_route_activation") {
    throw new Error(`Route ${routeId} has not adopted curriculum release authority.`);
  }
  return {
    ...v1,
    metadataSchemaVersion: ADLE_ROUTE_METADATA_SCHEMA_VERSION_V2,
    curriculumRelease,
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

/** Historical metadata constructor used only to replay/rebuild an existing
 * closed-v1 assignment contract. This route cannot originate new work. */
export function createLegacyPersistedRouteMetadata(
  routeId: "closed_compound_word_lab",
): PersistedLessonRouteMetadataV1 {
  const route = getCurriculumRouteDefinition(routeId, "v1");
  if (!route || route.implementationState !== "legacy_render_only" ||
      route.recipes.length !== 1 || route.payloadVersions.length !== 1) {
    throw new Error(`Legacy route ${routeId}:v1 is unavailable for replay.`);
  }
  return {
    metadataSchemaVersion: ADLE_ROUTE_METADATA_SCHEMA_VERSION,
    route: { routeId, routeVersion: route.routeVersion },
    recipe: { ...route.recipes[0] },
    payload: { kind: route.payloadKind, version: route.payloadVersions[0] },
  };
}

export function validatePersistedRouteMetadataCompatibility(
  metadata: PersistedLessonRouteMetadata,
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
    metadata.metadataSchemaVersion === ADLE_ROUTE_METADATA_SCHEMA_VERSION_V2 &&
    route.activationAuthority !== "database_route_activation"
  ) {
    return { ok: false, blocker: "route_unavailable" };
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
