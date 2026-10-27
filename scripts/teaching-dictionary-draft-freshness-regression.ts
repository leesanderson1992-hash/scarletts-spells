import assert from "node:assert/strict";
import { approvedFactsSupersedeDraft, unpublishedDraftWordIds } from "../lib/teaching-dictionary-manager/draft-freshness";

const rows = [
  { id: "old-a", canonical_word_id: "ingredients" },
  { id: "new-a", canonical_word_id: "ingredients" },
  { id: "new-b", canonical_word_id: "colourful" },
  { id: "published", canonical_word_id: "where" },
  { id: "rolled-back", canonical_word_id: "were" },
];
const published = new Set(["published"]);
const rolledBack = new Set(["rolled-back"]);
assert.deepEqual(unpublishedDraftWordIds(rows, published, rolledBack), ["ingredients", "colourful"]);
assert.deepEqual(unpublishedDraftWordIds(rows, published, rolledBack, "ingredients"), ["ingredients"]);
assert.deepEqual(unpublishedDraftWordIds(rows, published, rolledBack, "where"), []);
assert(approvedFactsSupersedeDraft("2026-10-26T12:00:00Z", ["2026-10-27T12:00:00Z"]));
assert(!approvedFactsSupersedeDraft("2026-10-27T12:00:00Z", ["2026-10-26T12:00:00Z"]));
console.log("PASS: route-wide and word-scoped readers examine the same current unpublished drafts");
