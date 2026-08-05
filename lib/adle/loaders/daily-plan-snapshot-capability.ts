import type { GenericSnapshotMode } from "../composable-lesson/generic-snapshot-mode";

export type DailyPlanSnapshotCapability =
  | { genericSnapshotColumn: "available" }
  | { genericSnapshotColumn: "deferred_absent" };

export interface DailyPlanSnapshotCapabilityError {
  code?: string | null;
  message?: string | null;
}

export const DAILY_PLAN_HEADER_BASELINE_PROJECTION =
  "lesson_route_metadata, assignment_generation_source" as const;

export const DAILY_PLAN_HEADER_SNAPSHOT_PROJECTION =
  `${DAILY_PLAN_HEADER_BASELINE_PROJECTION}, compiled_lesson_snapshot` as const;

const capabilityPromises = new Map<string, Promise<DailyPlanSnapshotCapability>>();

function normalizedMessage(error: DailyPlanSnapshotCapabilityError): string {
  return `${error.message ?? ""}`.trim().toLowerCase();
}

/** Accept only the two database/PostgREST signatures for this exact optional
 * column on this exact relation. Other schema, permission, transport, and
 * malformed-query errors remain fatal. */
export function isDeferredDailyPlanSnapshotColumnError(
  error: DailyPlanSnapshotCapabilityError,
): boolean {
  const code = `${error.code ?? ""}`;
  const message = normalizedMessage(error);
  if (code === "42703") {
    return /^column (?:public\.)?daily_assignments\.compiled_lesson_snapshot does not exist$/.test(
      message,
    );
  }
  if (code === "PGRST204") {
    return /^could not find the ['\"]compiled_lesson_snapshot['\"] column of ['\"]daily_assignments['\"] in the schema cache$/.test(
      message,
    );
  }
  return false;
}

export async function detectDailyPlanSnapshotCapability(input: {
  mode: GenericSnapshotMode;
  probe: () => Promise<{ error: DailyPlanSnapshotCapabilityError | null }>;
}): Promise<DailyPlanSnapshotCapability> {
  const result = await input.probe();
  if (result.error === null) {
    return { genericSnapshotColumn: "available" };
  }
  if (isDeferredDailyPlanSnapshotColumnError(result.error)) {
    return { genericSnapshotColumn: "deferred_absent" };
  }
  throw new Error(
    `getAdleDailyPlanReadModel:snapshotCapability:${result.error.code ?? "unknown"}`,
  );
}

/** Schema capability is deployment/database-wide, so cache one probe per
 * Supabase URL and rollout mode. Rejected probes are evicted and may recover. */
export function getCachedDailyPlanSnapshotCapability(input: {
  mode: GenericSnapshotMode;
  cacheKey: string;
  probe: () => Promise<{ error: DailyPlanSnapshotCapabilityError | null }>;
}): Promise<DailyPlanSnapshotCapability> {
  const key = `${input.cacheKey}:${input.mode}`;
  const existing = capabilityPromises.get(key);
  if (existing) return existing;
  const pending = detectDailyPlanSnapshotCapability(input).catch((error) => {
    capabilityPromises.delete(key);
    throw error;
  });
  capabilityPromises.set(key, pending);
  return pending;
}

export function dailyPlanHeaderProjection(
  capability: DailyPlanSnapshotCapability,
): typeof DAILY_PLAN_HEADER_BASELINE_PROJECTION | typeof DAILY_PLAN_HEADER_SNAPSHOT_PROJECTION {
  return capability.genericSnapshotColumn === "available"
    ? DAILY_PLAN_HEADER_SNAPSHOT_PROJECTION
    : DAILY_PLAN_HEADER_BASELINE_PROJECTION;
}

export function resetDailyPlanSnapshotCapabilityCacheForTests(): void {
  capabilityPromises.clear();
}
