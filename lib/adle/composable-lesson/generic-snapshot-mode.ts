export type GenericSnapshotMode = "off" | "observe" | "enforce";

export const ADLE_GENERIC_SNAPSHOT_MODE_ENV = "ADLE_GENERIC_SNAPSHOT_MODE" as const;

/** Temporary server-only rollout control. Unknown/missing values fail safely
 * to off; snapshot presence is still validated by the reader in every mode. */
export function genericSnapshotMode(
  value: string | undefined = process.env[ADLE_GENERIC_SNAPSHOT_MODE_ENV],
): GenericSnapshotMode {
  return value === "observe" || value === "enforce" ? value : "off";
}

export function genericSnapshotWritesEnabled(mode = genericSnapshotMode()): boolean {
  return mode === "observe" || mode === "enforce";
}
