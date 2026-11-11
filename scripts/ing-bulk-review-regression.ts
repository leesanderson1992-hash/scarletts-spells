import assert from "node:assert/strict";
import { ING_REVIEW_COLUMNS, REGULAR_ING_SKILL, parseIngReviewSheet, planIngReview,
  type IngReviewRow } from "../lib/teaching-dictionary-manager/ing-bulk-review";

const parsed = parseIngReviewSheet([
  ING_REVIEW_COLUMNS.join(","),
  "picking,Choosing something.,pick,/ˈpɪkɪŋ/,2,primary-unstressed,She is picking a book.",
  "boxing,,,,,,",
].join("\n"));
const picking: IngReviewRow = { ...parsed[0], requestId: "new", existing: null,
  families: [{ key: "pick", meaning: "To choose.", revision: 1 }] };
assert.equal(planIngReview(picking).group, "Confirm base families");
const planned = planIngReview({ ...picking, familyKey: "pick" });
assert.equal(planned.group, "Ready to apply");
assert.equal(planned.bundle?.senseSet.senses[0].dictationTargetTokenIndex, 2);
assert.deepEqual(planned.bundle?.analyses[0].requestedSkillKeys, [REGULAR_ING_SKILL]);
assert.equal(planIngReview({ ...picking, input: { ...picking.input, sentence: "She is picking while picking." } }).group,
  "Fix dictation sentences");
const boxing: IngReviewRow = { ...parsed[1], requestId: "existing", families: [], existing: {
  id: "existing-id", display: "boxing", revision: "original-revision", approved: true, source: "Reviewed source",
  analyses: [], links: [], senses: { pronunciations: [], senses: [
    { id: "sport", partOfSpeech: "noun", definition: "The sport.", pronunciationId: null },
    { id: "packing", partOfSpeech: "verb", definition: "Packing a box.", pronunciationId: null },
  ] },
} };
assert.equal(planIngReview(boxing).group, "Choose a meaning");
assert.equal(planIngReview({ ...boxing, senseId: "sport" }).group, "Spelling rule");
assert.throws(() => parseIngReviewSheet("word\nboxing\nBoxing\n"), /appears twice/);
console.log("Passed mixed sheet parsing, explicit sense selection, family confirmation and dictation validation.");
