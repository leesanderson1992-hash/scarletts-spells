import { getAdleLessonRouteDefinition, type AdleRouteActivationStatus } from "./lesson-route-registry";

export const ADLE_CURRICULUM_MANIFEST_SCHEMA_VERSION = 1 as const;

export interface AdleCurriculumImportManifest {
  schemaVersion: 1;
  manifestKey: string;
  sourcePackagePath: string;
  sourcePackageSha256: string;
  approvalRefs: string[];
  excludedBatchStatuses: string[];
  artifacts: Array<{
    artifactKind:
      | "canonical_words"
      | "word_support"
      | "teaching_content"
      | "route_specialised_content";
    path: string;
    sha256: string;
    rowCount: number;
    lessonRouteKey?: string;
  }>;
  routes: Array<{
    microSkillKey: string;
    lessonRouteKey: string;
    payloadVersion: number;
    requestedStatus: AdleRouteActivationStatus;
    contentVersion: string;
    importBatchId: string;
    readinessReport: Record<string, unknown>;
  }>;
}

export interface AdleCurriculumManifestValidation {
  valid: boolean;
  errors: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAdleCurriculumImportManifest(
  input: unknown,
): AdleCurriculumManifestValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { valid: false, errors: ["manifest_not_object"] };
  const value = input as Partial<AdleCurriculumImportManifest>;
  if (value.schemaVersion !== ADLE_CURRICULUM_MANIFEST_SCHEMA_VERSION) errors.push("unsupported_schema_version");
  if (!value.manifestKey?.trim()) errors.push("missing_manifest_key");
  if (!value.sourcePackagePath?.trim()) errors.push("missing_source_package_path");
  if (!SHA256.test(value.sourcePackageSha256 ?? "")) errors.push("invalid_source_package_sha256");
  if (!Array.isArray(value.approvalRefs) || value.approvalRefs.length === 0 || value.approvalRefs.some((ref) => !ref.trim())) errors.push("missing_approval_refs");
  if (!Array.isArray(value.excludedBatchStatuses) || !value.excludedBatchStatuses.includes("in_review")) errors.push("in_review_batch_not_excluded");
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) errors.push("missing_curriculum_artifacts");
  for (const artifact of value.artifacts ?? []) {
    if (!["canonical_words", "word_support", "teaching_content", "route_specialised_content"].includes(artifact.artifactKind)) errors.push(`invalid_artifact_kind:${artifact.artifactKind}`);
    if (!artifact.path?.trim() || !SHA256.test(artifact.sha256 ?? "") || !Number.isInteger(artifact.rowCount) || artifact.rowCount < 0) errors.push(`invalid_artifact:${artifact.path}`);
    if (artifact.lessonRouteKey && !getAdleLessonRouteDefinition(artifact.lessonRouteKey)) errors.push(`artifact_route_not_registered:${artifact.lessonRouteKey}`);
  }
  if (!Array.isArray(value.routes) || value.routes.length === 0) errors.push("missing_routes");
  for (const route of value.routes ?? []) {
    const definition = getAdleLessonRouteDefinition(route.lessonRouteKey);
    if (!definition) errors.push(`route_not_registered:${route.lessonRouteKey}`);
    else if (!definition.payloadVersions.includes(route.payloadVersion)) errors.push(`unsupported_payload:${route.lessonRouteKey}:${route.payloadVersion}`);
    if (!route.microSkillKey?.startsWith("D4_")) errors.push(`invalid_micro_skill:${route.microSkillKey}`);
    if (!route.contentVersion?.trim()) errors.push(`missing_content_version:${route.microSkillKey}`);
    if (!UUID.test(route.importBatchId ?? "")) errors.push(`invalid_import_batch_id:${route.microSkillKey}`);
    if (route.requestedStatus === "production_enabled" && Object.keys(route.readinessReport ?? {}).length === 0) errors.push(`missing_readiness_report:${route.microSkillKey}`);
  }
  const identities = (value.routes ?? []).map((route) => `${route.microSkillKey}\u0000${route.lessonRouteKey}`);
  if (new Set(identities).size !== identities.length) errors.push("duplicate_route_identity");
  return { valid: errors.length === 0, errors };
}
