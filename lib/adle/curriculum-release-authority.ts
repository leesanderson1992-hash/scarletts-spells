import { fingerprintSnapshotValue } from "./composable-lesson/canonical-fingerprint";
import { getCurriculumRouteDefinition } from "./curriculum-readiness/route-registry";
import { BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION } from "./lesson-route-registry";

export const ADLE_CURRICULUM_RELEASE_MANIFEST_SCHEMA_VERSION = 2 as const;
export const ADLE_DEPENDENCY_AUTHORITY_SCHEMA_VERSION = 1 as const;

export const ADLE_CURRICULUM_DEPENDENCY_TYPES = [
  "family_membership",
  "teaching_content",
  "teaching_dictionary_closure",
] as const;

export type AdleCurriculumDependencyType =
  (typeof ADLE_CURRICULUM_DEPENDENCY_TYPES)[number];

export type AdleCurriculumDependencyReference = {
  authorityKey: string;
  authorityType: AdleCurriculumDependencyType;
  authoritySchemaVersion: 1;
  semanticFingerprint: string;
};

export type AdleCurriculumReleaseManifestV2 = {
  schemaVersion: 2;
  releaseKey: string;
  route: {
    routeId: string;
    routeVersion: string;
    activationRouteKey: string;
    payloadVersion: number;
  };
  approvalRefs: string[];
  microSkills: Array<{
    microSkillKey: string;
    dependencies: AdleCurriculumDependencyReference[];
  }>;
};

export type AdleTeachingDictionaryClosureManifestV1 = {
  schemaVersion: 1;
  authorityKey: string;
  approvalRefs: string[];
  capabilities: [
    "canonical_word_identity_display",
    "canonical_dictation",
  ];
  words: Array<{
    wordKey: string;
    normalisedWord: string;
    displayWord: string;
    dialectCode: string;
    dictationSentence: string;
    dictationTargetTokenIndex: number;
    audioText: string;
  }>;
};

export type AdleCurriculumReleaseValidation = {
  valid: boolean;
  errors: string[];
};

const SHA256 = /^[a-f0-9]{64}$/;
const DEPENDENCY_ORDER = new Map(
  ADLE_CURRICULUM_DEPENDENCY_TYPES.map((value, index) => [value, index]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && Object.keys(value).length === keys.length;
}

function uniqueSorted(values: readonly string[]): boolean {
  return values.every(
    (value, index) => nonEmpty(value) && (index === 0 || values[index - 1] < value),
  );
}

export function validateAdleCurriculumReleaseManifestV2(
  input: unknown,
): AdleCurriculumReleaseValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ["manifest_not_object"] };
  if (!hasOnlyKeys(input, ["schemaVersion", "releaseKey", "route", "approvalRefs", "microSkills"])) {
    errors.push("invalid_manifest_shape");
  }
  if (input.schemaVersion !== ADLE_CURRICULUM_RELEASE_MANIFEST_SCHEMA_VERSION) {
    errors.push("unsupported_schema_version");
  }
  if (!nonEmpty(input.releaseKey)) errors.push("missing_release_key");
  if (!isRecord(input.route)) {
    errors.push("missing_route");
  } else {
    if (!hasOnlyKeys(input.route, ["routeId", "routeVersion", "activationRouteKey", "payloadVersion"])) {
      errors.push("invalid_route_shape");
    }
    if (!nonEmpty(input.route.routeId)) errors.push("missing_route_id");
    if (!nonEmpty(input.route.routeVersion)) errors.push("missing_route_version");
    if (!nonEmpty(input.route.activationRouteKey)) errors.push("missing_activation_route_key");
    if (!Number.isInteger(input.route.payloadVersion) || Number(input.route.payloadVersion) <= 0) {
      errors.push("invalid_payload_version");
    }
    const route = nonEmpty(input.route.routeId) && nonEmpty(input.route.routeVersion)
      ? getCurriculumRouteDefinition(input.route.routeId, input.route.routeVersion)
      : null;
    if (!route || route.activationAuthority !== "database_route_activation") {
      errors.push("route_not_release_authority_capable");
    } else if (
      route.routeId !== BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION.canonicalRouteId ||
      route.routeVersion !== BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION.canonicalRouteVersion ||
      input.route.activationRouteKey !== BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION.lessonRouteKey ||
      !route.payloadVersions.includes(Number(input.route.payloadVersion))
    ) {
      errors.push("route_activation_compatibility_mismatch");
    }
  }
  if (!Array.isArray(input.approvalRefs) || !uniqueSorted(input.approvalRefs as string[])) {
    errors.push("approval_refs_not_unique_sorted");
  }
  if (!Array.isArray(input.microSkills) || input.microSkills.length === 0) {
    errors.push("missing_micro_skills");
  } else {
    const skillKeys: string[] = [];
    for (const entry of input.microSkills) {
      if (!isRecord(entry) || !nonEmpty(entry.microSkillKey)) {
        errors.push("invalid_micro_skill");
        continue;
      }
      if (!hasOnlyKeys(entry, ["microSkillKey", "dependencies"])) {
        errors.push(`invalid_micro_skill_shape:${entry.microSkillKey}`);
      }
      skillKeys.push(entry.microSkillKey);
      const route = isRecord(input.route) && nonEmpty(input.route.routeId) && nonEmpty(input.route.routeVersion)
        ? getCurriculumRouteDefinition(input.route.routeId, input.route.routeVersion)
        : null;
      if (!route?.supportedMicroSkillKeys.includes(entry.microSkillKey)) {
        errors.push(`micro_skill_not_supported:${entry.microSkillKey}`);
      }
      if (!Array.isArray(entry.dependencies)) {
        errors.push(`missing_dependencies:${entry.microSkillKey}`);
        continue;
      }
      const seen = new Set<string>();
      let priorOrder = -1;
      for (const dependency of entry.dependencies) {
        if (!isRecord(dependency)) {
          errors.push(`invalid_dependency:${entry.microSkillKey}`);
          continue;
        }
        if (!hasOnlyKeys(dependency, ["authorityKey", "authorityType", "authoritySchemaVersion", "semanticFingerprint"])) {
          errors.push(`invalid_dependency_shape:${entry.microSkillKey}`);
        }
        const type = dependency.authorityType;
        if (!(ADLE_CURRICULUM_DEPENDENCY_TYPES as readonly unknown[]).includes(type)) {
          errors.push(`invalid_dependency_type:${entry.microSkillKey}`);
          continue;
        }
        const dependencyType = type as AdleCurriculumDependencyType;
        const order = DEPENDENCY_ORDER.get(dependencyType) ?? -1;
        if (seen.has(dependencyType)) errors.push(`duplicate_dependency:${entry.microSkillKey}:${dependencyType}`);
        if (order <= priorOrder) errors.push(`dependencies_not_canonical:${entry.microSkillKey}`);
        seen.add(dependencyType);
        priorOrder = order;
        if (!nonEmpty(dependency.authorityKey)) errors.push(`missing_authority_key:${entry.microSkillKey}:${dependencyType}`);
        if (dependency.authoritySchemaVersion !== ADLE_DEPENDENCY_AUTHORITY_SCHEMA_VERSION) {
          errors.push(`unsupported_authority_schema:${entry.microSkillKey}:${dependencyType}`);
        }
        if (typeof dependency.semanticFingerprint !== "string" || !SHA256.test(dependency.semanticFingerprint)) {
          errors.push(`invalid_semantic_fingerprint:${entry.microSkillKey}:${dependencyType}`);
        }
      }
      for (const required of ADLE_CURRICULUM_DEPENDENCY_TYPES) {
        if (!seen.has(required)) errors.push(`missing_dependency:${entry.microSkillKey}:${required}`);
      }
    }
    if (!uniqueSorted(skillKeys)) errors.push("micro_skills_not_unique_sorted");
  }
  return { valid: errors.length === 0, errors };
}

export function dependencyProjectionForRelease(
  manifest: AdleCurriculumReleaseManifestV2,
): unknown {
  return manifest.microSkills.map(({ microSkillKey, dependencies }) => ({
    microSkillKey,
    dependencies,
  }));
}

export function fingerprintAdleCurriculumReleaseManifest(
  manifest: AdleCurriculumReleaseManifestV2,
): { releaseManifestSha256: string; dependencyFingerprint: string } {
  const validation = validateAdleCurriculumReleaseManifestV2(manifest);
  if (!validation.valid) {
    throw new Error(`invalid_adle_curriculum_release_manifest:${validation.errors.join(",")}`);
  }
  return {
    releaseManifestSha256: fingerprintSnapshotValue(manifest),
    dependencyFingerprint: fingerprintSnapshotValue(dependencyProjectionForRelease(manifest)),
  };
}

export function teachingDictionaryClosureSemanticProjection(
  manifest: AdleTeachingDictionaryClosureManifestV1,
): unknown {
  return {
    schemaVersion: manifest.schemaVersion,
    capabilities: manifest.capabilities,
    words: manifest.words,
  };
}

export function validateAdleTeachingDictionaryClosureManifestV1(
  input: unknown,
): AdleCurriculumReleaseValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ["closure_not_object"] };
  if (!hasOnlyKeys(input, ["schemaVersion", "authorityKey", "approvalRefs", "capabilities", "words"])) {
    errors.push("invalid_closure_shape");
  }
  if (input.schemaVersion !== 1) errors.push("unsupported_schema_version");
  if (!nonEmpty(input.authorityKey)) errors.push("missing_authority_key");
  if (!Array.isArray(input.approvalRefs) || !uniqueSorted(input.approvalRefs as string[])) {
    errors.push("approval_refs_not_unique_sorted");
  }
  if (
    !Array.isArray(input.capabilities) ||
    input.capabilities.length !== 2 ||
    input.capabilities[0] !== "canonical_word_identity_display" ||
    input.capabilities[1] !== "canonical_dictation"
  ) {
    errors.push("unsupported_closure_capabilities");
  }
  if (!Array.isArray(input.words) || input.words.length === 0) {
    errors.push("missing_words");
  } else {
    const keys: string[] = [];
    for (const value of input.words) {
      if (!isRecord(value) || !nonEmpty(value.wordKey)) {
        errors.push("invalid_word");
        continue;
      }
      if (!hasOnlyKeys(value, [
        "wordKey", "normalisedWord", "displayWord", "dialectCode",
        "dictationSentence", "dictationTargetTokenIndex", "audioText",
      ])) errors.push(`invalid_word_shape:${value.wordKey}`);
      keys.push(value.wordKey);
      for (const field of ["normalisedWord", "displayWord", "dialectCode", "dictationSentence", "audioText"] as const) {
        if (!nonEmpty(value[field])) errors.push(`invalid_${field}:${value.wordKey}`);
      }
      if (typeof value.normalisedWord === "string" && value.normalisedWord !== value.normalisedWord.toLowerCase()) {
        errors.push(`normalised_word_not_lowercase:${value.wordKey}`);
      }
      if (!Number.isInteger(value.dictationTargetTokenIndex) || Number(value.dictationTargetTokenIndex) < 0) {
        errors.push(`invalid_dictation_target_token_index:${value.wordKey}`);
      }
    }
    if (!uniqueSorted(keys)) errors.push("words_not_unique_sorted");
  }
  return { valid: errors.length === 0, errors };
}
