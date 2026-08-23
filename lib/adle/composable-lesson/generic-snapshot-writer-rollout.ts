import type { GenericSnapshotMode } from "./generic-snapshot-mode";

export const ADLE_GENERIC_SNAPSHOT_V3_WRITER_ROLLOUT_ENV =
  "ADLE_GENERIC_SNAPSHOT_V3_WRITER_ROLLOUT" as const;
export const ADLE_GENERIC_SNAPSHOT_V3_WRITER_CHILD_IDS_ENV =
  "ADLE_GENERIC_SNAPSHOT_V3_WRITER_CHILD_IDS" as const;
export const ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV =
  "ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE" as const;
export const ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV =
  "ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID" as const;

export type GenericSnapshotV3ProductionAuthorization = Readonly<{
  kind: "on_for_current_learner";
  childId: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Missing, malformed and unknown configuration is deliberately OFF. */
export function selectProductionGenericSnapshotV3Writer(input: {
  childId: string;
  mode?: string;
  currentLearnerChildId?: string;
}): GenericSnapshotV3ProductionAuthorization | null {
  if (input.mode !== "on_for_current_learner") return null;
  const configuredId = input.currentLearnerChildId?.trim();
  if (!configuredId || !UUID.test(configuredId) || !UUID.test(input.childId)) return null;
  if (configuredId.toLowerCase() !== input.childId.toLowerCase()) return null;
  return Object.freeze({ kind: "on_for_current_learner", childId: input.childId });
}

export function configuredProductionGenericSnapshotV3Writer(
  childId: string,
): GenericSnapshotV3ProductionAuthorization | null {
  return selectProductionGenericSnapshotV3Writer({
    childId,
    mode: process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV],
    currentLearnerChildId: process.env[ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV],
  });
}

export type GenericSnapshotWriterSelection = "v2" | "v3_guarded_non_production";

export interface GenericSnapshotWriterRolloutInput {
  snapshotMode: GenericSnapshotMode;
  childId: string;
  rollout?: string;
  childIds?: string;
  nodeEnv?: string;
  vercelEnv?: string;
}

/**
 * The deployed default is always v2. V3 can be selected only by a second,
 * explicit non-Production allow-list after snapshot writing itself is on.
 */
export function selectGenericSnapshotWriter(
  input: GenericSnapshotWriterRolloutInput,
): GenericSnapshotWriterSelection {
  if (input.snapshotMode === "off") return "v2";
  if (input.nodeEnv === "production" || input.vercelEnv === "production") return "v2";
  if (input.rollout !== "guarded_non_production") return "v2";
  const allowed = new Set((input.childIds ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has(input.childId) ? "v3_guarded_non_production" : "v2";
}

export function configuredGenericSnapshotWriter(input: {
  snapshotMode: GenericSnapshotMode;
  childId: string;
}): GenericSnapshotWriterSelection {
  return selectGenericSnapshotWriter({
    ...input,
    rollout: process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_ROLLOUT_ENV],
    childIds: process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_CHILD_IDS_ENV],
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
