import assert from "node:assert/strict";
import { mergeWordFamilySummaries } from "../lib/teaching-dictionary-manager/base-family-summary";

const old = { name: "veget_bound_root_base_family", meaning: "old root meaning",
  pronunciation: "old pronunciation", words: [{ id: "word", word: "vegetable" }] };
const current = { name: old.name, meaning: "To grow or live",
  pronunciation: "Not applicable (bound root)", words: old.words };
assert.deepEqual(mergeWordFamilySummaries([old], [current], [], new Set([old.name])), [current]);
assert.deepEqual(mergeWordFamilySummaries([old], [], [], new Set([old.name])), []);
assert.deepEqual(mergeWordFamilySummaries([old], [], [], new Set()), [old]);
assert.deepEqual(mergeWordFamilySummaries([old], [current], [old], new Set([old.name])), [current]);
const actual = { name: "actual_adjective_base_family", baseWordId: "actual", baseKind: "free_base",
  meaning: "Real or true.", words: [{ id: "actual", word: "actual" }, { id: "actually", word: "actually" }] };
const lesson = { ...actual, name: "actual_family" };
assert.deepEqual(mergeWordFamilySummaries([], [actual], [lesson], new Set([actual.name])), [actual],
  "An exact lesson compatibility family does not duplicate its canonical Dictionary family");
const differentMeaning = { ...lesson, meaning: "A different reviewed meaning." };
assert.equal(mergeWordFamilySummaries([], [actual], [differentMeaning], new Set([actual.name])).length, 2);
const additionalMember = { ...lesson, words: [...lesson.words, { id: "actuality", word: "actuality" }] };
assert.equal(mergeWordFamilySummaries([], [actual], [additionalMember], new Set([actual.name])).length, 2,
  "Unrepresented historical members must remain visible");
assert.equal(mergeWordFamilySummaries([], [actual, { ...actual, name: "distinct_reviewed_family" }], [lesson], new Set()).length, 3,
  "Ambiguous canonical matches must not silently merge");
console.log("Latest approved lexical family precedence passed");
