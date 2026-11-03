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
console.log("Latest approved lexical family precedence passed");
