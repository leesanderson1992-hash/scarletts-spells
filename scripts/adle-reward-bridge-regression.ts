/**
 * ADLE Slice 7a (7a-C): reward-bridge reconciliation regression — pure, DB-free.
 *
 * Proves the one guarantee the owner flagged as the main risk: a given real
 * authentic use (a target word in a parent-approved writing sample) advances a
 * Golden Bar EXACTLY ONCE across the ADLE and free-writing paths, in either
 * order, with in-batch duplicates collapsed — and the bar is awarded on the
 * threshold crossing exactly once.
 */

import {
  applyForgeUses,
  authenticUseDedupKey,
  parseWritingSampleFromPieceRef,
  reconcileAuthenticUses,
} from "../lib/rewards/adle-reward-bridge-core";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// --- piece_ref parsing (fail closed) ----------------------------------------

assert(parseWritingSampleFromPieceRef("ws:sample-1") === "sample-1", "ws: prefix yields the sample id");
assert(parseWritingSampleFromPieceRef("ws:") === null, "empty ws ref is null (never credited)");
assert(parseWritingSampleFromPieceRef("task:field") === null, "a non-ws ref is null");
assert(parseWritingSampleFromPieceRef("") === null, "empty ref is null");

// --- key shape --------------------------------------------------------------

assert(authenticUseDedupKey("T", "S") === "T::S", "dedup key is treasure::sample");

// --- cross-path dedup: free-writing counted first, ADLE skips ----------------

{
  const alreadyCounted = new Set([authenticUseDedupKey("T", "S1"), authenticUseDedupKey("T", "S2")]);
  const adle = [
    { treasureId: "T", writingSampleId: "S1" }, // already counted by free-writing
    { treasureId: "T", writingSampleId: "S3" },
    { treasureId: "T", writingSampleId: "S2" }, // already counted by free-writing
    { treasureId: "T", writingSampleId: "S3" }, // in-batch duplicate
    { treasureId: "T", writingSampleId: "S4" },
  ];
  const { credited, skipped } = reconcileAuthenticUses(adle, alreadyCounted);
  assert(credited.length === 2, "only the two genuinely-new samples are credited");
  assert(credited.map((u) => u.writingSampleId).join(",") === "S3,S4", "credited = S3, S4");
  assert(skipped.length === 3, "S1, S2 (cross-path) and the duplicate S3 (in-batch) are skipped");
}

// --- reverse order: ADLE counted first, free-writing skips ------------------

{
  const alreadyCounted = new Set([authenticUseDedupKey("T", "S1")]); // ADLE recorded S1
  const freeWriting = [
    { treasureId: "T", writingSampleId: "S1" }, // same real use ADLE already counted
    { treasureId: "T", writingSampleId: "S5" },
  ];
  const { credited } = reconcileAuthenticUses(freeWriting, alreadyCounted);
  assert(credited.length === 1 && credited[0].writingSampleId === "S5", "free-writing skips the ADLE-counted piece");
}

// --- different treasures never collide on the same sample -------------------

{
  const { credited } = reconcileAuthenticUses(
    [
      { treasureId: "A", writingSampleId: "S1" },
      { treasureId: "B", writingSampleId: "S1" },
    ],
    new Set(),
  );
  assert(credited.length === 2, "same sample, different words -> two distinct credits");
}

// --- Golden Bar awarded exactly once on the threshold crossing ---------------

assert(applyForgeUses(4, 5, 1).awardsBar === true, "5th use awards the bar");
assert(applyForgeUses(4, 5, 1).nextUses === 5, "count reaches the threshold");
assert(applyForgeUses(3, 5, 1).awardsBar === false, "4th use does not award yet");
assert(applyForgeUses(5, 5, 1).awardsBar === false, "already at threshold -> never re-awarded");
assert(applyForgeUses(6, 5, 1).awardsBar === false, "past threshold -> never re-awarded");
assert(applyForgeUses(3, 5, 2).awardsBar === true, "a batch that crosses the threshold awards once");

// --- end-to-end: 5 distinct samples across both paths award one bar ----------

{
  // Free-writing already credited S1, S2 (treasure count therefore 2).
  const alreadyCounted = new Set([authenticUseDedupKey("T", "S1"), authenticUseDedupKey("T", "S2")]);
  const currentUses = 2;
  const required = 5;
  const adle = [
    { treasureId: "T", writingSampleId: "S1" }, // dup (free-writing)
    { treasureId: "T", writingSampleId: "S3" },
    { treasureId: "T", writingSampleId: "S4" },
    { treasureId: "T", writingSampleId: "S5" },
    { treasureId: "T", writingSampleId: "S3" }, // dup (in-batch)
  ];
  const { credited } = reconcileAuthenticUses(adle, alreadyCounted);
  assert(credited.length === 3, "three new distinct samples credited (S3, S4, S5)");
  const { nextUses, awardsBar } = applyForgeUses(currentUses, required, credited.length);
  assert(nextUses === 5, "2 prior + 3 new = 5 distinct real uses (no double count)");
  assert(awardsBar === true, "the bar is awarded exactly at the 5th distinct use");
}

console.log("adle-reward-bridge-regression: all checks passed");
