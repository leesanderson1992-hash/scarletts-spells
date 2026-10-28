/** Prefer the active R6 specialist snapshot; a frozen lesson-only assignment
 * still supplies its own fingerprint for durable checkpoints. */
export function specialistSnapshotFingerprint(
  r6Snapshot: unknown,
  frozenAssignmentSnapshot: unknown,
): string | undefined {
  const snapshot = r6Snapshot ?? frozenAssignmentSnapshot;
  if (!snapshot || typeof snapshot !== "object" || !("provenance" in snapshot)) return undefined;
  const provenance = snapshot.provenance;
  if (!provenance || typeof provenance !== "object" || !("sourceFingerprint" in provenance)) return undefined;
  return typeof provenance.sourceFingerprint === "string" && /^[a-f0-9]{64}$/.test(provenance.sourceFingerprint)
    ? provenance.sourceFingerprint : undefined;
}
