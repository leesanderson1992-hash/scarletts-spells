import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAdleLessonRouteDefinition,
  type AdleLessonRouteKey,
  type AdleRouteActivationStatus,
} from "../lesson-route-registry";
import type { AdleRouteActivationEnvironment } from "../route-activation-environment";

export interface AdleLessonRouteActivation {
  microSkillKey: string;
  lessonRouteKey: AdleLessonRouteKey;
  payloadVersion: number;
  activationStatus: AdleRouteActivationStatus;
  contentVersion: string;
  /** Immutable family-data batch selected by the activation manifest. */
  importBatchId: string;
  readinessReport: Record<string, unknown>;
}

type RouteActivationQueryError = { code?: string | null; message?: string | null };

/**
 * The activation migration is deliberately deployed before its consumers.
 * Old databases therefore have no table and must behave as having no enabled
 * routes. Do not broaden this: permission, network, or malformed-query
 * errors remain operational failures and must surface.
 */
function activationTableIsUnavailable(error: RouteActivationQueryError): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("adle_lesson_route_activations")
    && (message.includes("does not exist") || message.includes("could not find"));
}

export async function loadAdleLessonRouteActivations(
  client: SupabaseClient,
  input: {
    microSkillKeys: readonly string[];
    environmentKey: AdleRouteActivationEnvironment;
  },
): Promise<AdleLessonRouteActivation[]> {
  if (input.microSkillKeys.length === 0) return [];
  const { data, error } = await client
    .from("adle_lesson_route_activations")
    .select("micro_skill_key,lesson_route_key,payload_version,activation_status,content_version,import_manifest_id,readiness_report")
    .in("micro_skill_key", [...input.microSkillKeys])
    .eq("environment_key", input.environmentKey)
    .eq("row_status", "active");
  if (error) {
    if (activationTableIsUnavailable(error)) return [];
    throw new Error(`loadAdleLessonRouteActivations: ${error.message}`);
  }
  const rows = data ?? [];
  const manifestIds = [...new Set(rows.map((row) => row.import_manifest_id).filter((id): id is string => typeof id === "string"))];
  if (manifestIds.length === 0) return [];
  const { data: manifests, error: manifestsError } = await client
    .from("adle_curriculum_import_manifests")
    .select("id,import_batch_id")
    .in("id", manifestIds);
  if (manifestsError) throw new Error(`loadAdleLessonRouteActivations: ${manifestsError.message}`);
  const importBatchByManifestId = new Map(
    (manifests ?? []).flatMap((manifest) =>
      typeof manifest.id === "string" && typeof manifest.import_batch_id === "string"
        ? [[manifest.id, manifest.import_batch_id] as const]
        : [],
    ),
  );
  return rows.flatMap((row) => {
    const definition = getAdleLessonRouteDefinition(row.lesson_route_key);
    const importBatchId = typeof row.import_manifest_id === "string"
      ? importBatchByManifestId.get(row.import_manifest_id)
      : undefined;
    if (!definition || !definition.payloadVersions.includes(row.payload_version) || !importBatchId) {
      return [];
    }
    return [{
      microSkillKey: row.micro_skill_key,
      lessonRouteKey: definition.lessonRouteKey,
      payloadVersion: row.payload_version,
      activationStatus: row.activation_status as AdleRouteActivationStatus,
      contentVersion: row.content_version,
      importBatchId,
      readinessReport: row.readiness_report as Record<string, unknown>,
    }];
  });
}

export async function isAdleLessonRouteProductionEnabled(
  client: SupabaseClient,
  microSkillKey: string,
  lessonRouteKey: AdleLessonRouteKey,
): Promise<boolean> {
  const rows = await loadAdleLessonRouteActivations(client, {
    microSkillKeys: [microSkillKey],
    environmentKey: "production",
  });
  return rows.some(
    (row) =>
      row.microSkillKey === microSkillKey
      && row.lessonRouteKey === lessonRouteKey
      && row.activationStatus === "production_enabled",
  );
}
