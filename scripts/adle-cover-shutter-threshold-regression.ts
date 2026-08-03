import assert from "node:assert/strict";

import { coverTrackProgress, shouldSnapCoverClosed } from "../components/adle/activities/shared/cover-shutter";

const width = 464;
const track = width - 64;
assert.equal(coverTrackProgress(track * 0.79, width), 0.79);
assert.equal(shouldSnapCoverClosed(track * 0.79, width, { kind: "track_ratio", threshold: 0.8 }), false);
assert.equal(shouldSnapCoverClosed(track * 0.8, width, { kind: "track_ratio", threshold: 0.8 }), true);
assert.equal(shouldSnapCoverClosed(track * 0.95, width, { kind: "track_ratio", threshold: 0.8 }), true);
assert.equal(coverTrackProgress(-10, width), 0);
assert.equal(coverTrackProgress(999, width), 1);
assert.equal(coverTrackProgress(1, 64), 1);
assert.equal(shouldSnapCoverClosed(79, width), false, "legacy consumers retain the 80px threshold");
assert.equal(shouldSnapCoverClosed(80, width), true, "legacy consumers retain the 80px threshold");

console.log("PASS: CoverShutter ratio policy distinguishes 79%, 80%, above-threshold, clamped, and legacy behavior");
