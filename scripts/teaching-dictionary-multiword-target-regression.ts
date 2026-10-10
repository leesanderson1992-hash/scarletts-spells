import assert from "node:assert/strict";
import { emptyMetadata, emptyMorphology, publicationBlockers } from "../lib/teaching-dictionary-manager/contracts";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const [row] = parseDictionaryCsv("targetWord,dictation1_sentence\nice cream,We can share ice cream today.\n");
assert.equal(row.payload.dictationTargetTokenIndex, 3);
const payload = {
  ...row.payload, definition: "A frozen dessert.", ageBand: "7-11", frequencyBand: "common",
  metadata: emptyMetadata(), canonicalMorphology: emptyMorphology(),
};
assert(!publicationBlockers(payload, "ice cream").some((blocker) => blocker.includes("dictation target")));
assert(publicationBlockers({ ...payload, dictationTargetTokenIndex: 2 }, "ice cream")
  .some((blocker) => blocker.includes("dictation target")));
console.log("Teaching Dictionary multiword dictation target regression passed");
