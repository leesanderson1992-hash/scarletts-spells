import assert from "node:assert/strict";
import { pendingImportDrafts, type ImportDraftSummary } from "../lib/teaching-dictionary-manager/import-review";

const rows: ImportDraftSummary[] = [
  { id: "a-old", canonical_word_id: "a", normalised_word: "ability", created_at: "2026-10-10T09:00:00Z" },
  { id: "a-new", canonical_word_id: "a", normalised_word: "ability", created_at: "2026-10-11T09:00:00Z" },
  { id: "b", canonical_word_id: "b", normalised_word: "about", created_at: "2026-10-10T09:00:00Z" },
  { id: "c", canonical_word_id: null, normalised_word: "newword", created_at: "2026-10-10T09:00:00Z" },
];

assert.deepEqual(pendingImportDrafts(rows, new Set(["a-old", "b"])).map((row) => row.id), ["a-new", "c"]);
assert.deepEqual(pendingImportDrafts(rows, new Set(["a-new", "b", "c"])), []);
console.log("Teaching dictionary import review regression passed");
