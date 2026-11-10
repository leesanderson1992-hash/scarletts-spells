import assert from "node:assert/strict";
import { approveImportedCandidates } from "../lib/teaching-dictionary-manager/import-candidate-handoff";

const approved: string[] = [];
const result = await approveImportedCandidates({
  wordId: "00000000-0000-4000-8000-000000000001", word: "reading", senseId: "reading-verb",
  skillKeys: ["D4_INF_ING_ENDINGS_REGULAR", "D4_INF_ING_ENDINGS_REGULAR",
    "D4_MOR_SUFFIXES_ABLE_IBLE", "D4_OTHER_LEGACY"],
  approve: async (skillKey, senseId) => {
    assert.equal(senseId, "reading-verb");
    approved.push(skillKey);
    return skillKey.endsWith("REGULAR") ? { ok: true }
      : { ok: false, blocked: [{ reason: "Review the derived family link." }] };
  },
});
assert.deepEqual(approved, ["D4_INF_ING_ENDINGS_REGULAR", "D4_MOR_SUFFIXES_ABLE_IBLE"]);
assert.equal(result.approved, 1);
assert.deepEqual(result.pending, [{ wordId: "00000000-0000-4000-8000-000000000001",
  word: "reading", skillKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  reason: "Review the derived family link." }]);

let called = false;
const missingSense = await approveImportedCandidates({
  wordId: "00000000-0000-4000-8000-000000000001", word: "reading",
  senseId: undefined, skillKeys: ["D4_INF_ING_ENDINGS_REGULAR"],
  approve: async () => { called = true; return { ok: true }; },
});
assert.equal(called, false);
assert.equal(missingSense.approved, 0);
assert.equal(missingSense.pending[0].reason, "Choose the reviewed meaning on the word page.");
console.log("import candidate handoff: passed");
