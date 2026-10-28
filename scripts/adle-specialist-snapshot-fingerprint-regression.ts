import assert from "node:assert/strict";
import { specialistSnapshotFingerprint } from "../lib/adle/specialist-snapshot-fingerprint";

const r6 = { provenance: { sourceFingerprint: "a".repeat(64) } };
const frozen = { provenance: { sourceFingerprint: "b".repeat(64) } };
assert.equal(specialistSnapshotFingerprint(r6, frozen), "a".repeat(64));
assert.equal(specialistSnapshotFingerprint(null, frozen), "b".repeat(64));
assert.equal(specialistSnapshotFingerprint(null, { provenance: { sourceFingerprint: "compatibility" } }), undefined);
console.log("Specialist assignment fingerprint regression passed");
