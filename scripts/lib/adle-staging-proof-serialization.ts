import { fingerprintSnapshotValue } from "../../lib/adle/composable-lesson/canonical-fingerprint";

/** Match the JSONB boundary: optional undefined properties are not persisted. */
export function fingerprintSerializableProofValue(value: unknown): string {
  return fingerprintSnapshotValue(JSON.parse(JSON.stringify(value)) as unknown);
}
