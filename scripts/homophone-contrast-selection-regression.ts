import assert from "node:assert/strict";
import { selectContrastSets, type ReviewedContrastSet } from "../lib/adle/homophone/contrast-set-selection";

const sets: ReviewedContrastSet[] = Array.from({ length: 5 }, (_, i) => ({
  setId: `id-${i + 1}`, setKey: `pair-${i + 1}`,
  memberWordIds: [`a${i + 1}`, `b${i + 1}`], reviewStatus: "approved",
}));
const run = (rotationIndex: number, masteredWordIds = new Set<string>(), queuedItems: { canonicalWordId: string;
  intakeOn: string; status: "pending" | "pending_reteach" }[] = []) =>
  selectContrastSets({ sets, rotationIndex, masteredWordIds, queuedItems }).map(set => set.setKey);

assert.deepEqual(run(0), ["pair-1", "pair-2", "pair-3"]);
assert.deepEqual(run(3), ["pair-4", "pair-5", "pair-1"]);
assert.deepEqual(run(0, new Set(["a1", "b2", "a3"])), ["pair-4", "pair-5"]);
assert.deepEqual(run(0, new Set(["a1", "b2", "a3", "a4"])), ["pair-5"]);
assert.deepEqual(run(0, new Set(["a1", "a2", "a3", "a4", "a5"])), []);
assert.deepEqual(run(0, new Set(), [
  { canonicalWordId: "b5", intakeOn: "2026-10-20", status: "pending" },
  { canonicalWordId: "a3", intakeOn: "2026-10-19", status: "pending_reteach" },
]), ["pair-3", "pair-5", "pair-1"]);
assert.deepEqual(run(0, new Set(["a3"]), [
  { canonicalWordId: "b3", intakeOn: "2026-10-19", status: "pending" },
]), ["pair-3", "pair-1", "pair-2"]);
assert.deepEqual(run(0, new Set(["a1", "a2", "a3", "a4", "a5"]), [
  { canonicalWordId: "b5", intakeOn: "2026-10-19", status: "pending" },
]), ["pair-5"]);
const triad = [{ setId: "triad", setKey: "triad", memberWordIds: ["rain", "rein", "reign"],
  reviewStatus: "approved" as const }];
assert.deepEqual(selectContrastSets({ sets: triad, queuedItems: [], masteredWordIds: new Set(), rotationIndex: 0 }),
  [{ setId: "triad", setKey: "triad", memberWordIds: ["rain", "rein", "reign"] }]);
console.log("homophone contrast selection regression passed");
