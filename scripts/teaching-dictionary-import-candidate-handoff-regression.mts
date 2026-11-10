import assert from "node:assert/strict";
import { approveImportedCandidates, factFirstImportSkills } from "../lib/teaching-dictionary-manager/import-candidate-handoff";
import type { WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";

const requested = { skillKeys: ["D4_INF_ING_ENDINGS_REGULAR", "D4_MOR_SUFFIXES_ABLE_IBLE"] } as WordDraftPayload;
const factsFirst = factFirstImportSkills(requested, ["D4_EXISTING", "D4_EXISTING"]);
assert.deepEqual(factsFirst.requestedSkillKeys, requested.skillKeys);
assert.deepEqual(factsFirst.skillKeys, ["D4_EXISTING"]);
assert.deepEqual(requested.skillKeys, ["D4_INF_ING_ENDINGS_REGULAR", "D4_MOR_SUFFIXES_ABLE_IBLE"],
  "the imported proposal must remain intact for validation and audit");
assert.deepEqual(factFirstImportSkills(requested, []).skillKeys, [],
  "new words cannot gain a governed pair merely by importing a tag");

const approved: string[] = [];
const result = await approveImportedCandidates({
  wordId: "00000000-0000-4000-8000-000000000001", word: "reading", senseId: "reading-verb",
  skillKeys: ["D4_INF_ING_ENDINGS_REGULAR", "D4_INF_ING_ENDINGS_REGULAR",
    "D4_MOR_SUFFIXES_ABLE_IBLE", "D4_MOR_PREFIXES_UN", "D4_OTHER_LEGACY"],
  approve: async (skillKey, senseId) => {
    assert.equal(senseId, "reading-verb");
    approved.push(skillKey);
    return skillKey.endsWith("REGULAR") || skillKey === "D4_MOR_PREFIXES_UN" ? { ok: true }
      : { ok: false, blocked: [{ reason: "Review the derived family link." }] };
  },
});
assert.deepEqual(approved, ["D4_INF_ING_ENDINGS_REGULAR", "D4_MOR_SUFFIXES_ABLE_IBLE",
  "D4_MOR_PREFIXES_UN"]);
assert.equal(result.approved, 2);
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
