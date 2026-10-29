import assert from "node:assert/strict";
import { chooseWeakVowelFamily } from "../lib/teaching-dictionary-manager/weak-vowel-family-choice";

const oldFamily = { id: "july", createdAt: "2026-07-01T00:00:00Z",
  baseFamilyKey: "nature_base_family", baseWordId: "nature", baseMeaning: "the natural world",
  memberIds: ["nature", "natural"], eligibleMemberIds: ["nature", "natural"],
  memberWords: ["nature", "natural"] };
const newFamily = { ...oldFamily, id: "august", createdAt: "2026-08-01T00:00:00Z" };
assert.equal(chooseWeakVowelFamily([oldFamily, newFamily]).authorityId, "august");
assert.deepEqual(chooseWeakVowelFamily([]), { status: "none", authorityId: null, members: [] });
assert.deepEqual(chooseWeakVowelFamily([oldFamily, { ...newFamily, baseMeaning: "a different meaning" }]),
  { status: "ambiguous", authorityId: null, members: [] });
assert.deepEqual(chooseWeakVowelFamily([oldFamily, { ...newFamily, memberIds: ["nature", "naturally"] }]),
  { status: "ambiguous", authorityId: null, members: [] });
assert.deepEqual(chooseWeakVowelFamily([oldFamily, { ...newFamily, eligibleMemberIds: ["nature"] }]),
  { status: "ambiguous", authorityId: null, members: [] });
console.log("Weak-vowel family authority choice regression passed.");
