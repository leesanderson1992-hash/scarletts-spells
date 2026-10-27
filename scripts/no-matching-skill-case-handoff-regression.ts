import assert from "node:assert/strict";
import { caseTargetsDictionaryWord, normaliseCaseWord } from "../lib/admin/no-matching-skill-cases";

assert.equal(normaliseCaseWord("  They’re  "), "they're");
const activeWord = { normalised_word: "ingredients", dialect_code: "en-GB", row_status: "active" };
assert.equal(caseTargetsDictionaryWord("ingredients", activeWord), true);
assert.equal(caseTargetsDictionaryWord("ingredient", activeWord), false,
  "a case cannot be redirected to a different canonical word");
assert.equal(caseTargetsDictionaryWord("ingredients", { ...activeWord, row_status: "withdrawn" }), false);
assert.equal(caseTargetsDictionaryWord("ingredients", { ...activeWord, dialect_code: "en-US" }), false);
assert.equal(caseTargetsDictionaryWord("they’re", { ...activeWord, normalised_word: "they're" }), true);

console.log("PASS: spelling cases bind to the exact active en-GB dictionary word");
