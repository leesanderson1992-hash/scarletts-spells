import assert from "node:assert/strict";
import { approvedLexicalBaseTexts, lexicalMorphologyReady } from "../lib/teaching-dictionary-manager/lexical-family-candidates";

const oldApproved = {
  analysisStatus: "approved", reviewStatus: "approved_for_first_exposure",
  wordSum: "ingredient + s → ingredients", joins: [], transformations: [],
  parts: [{ type: "base", text: "ingredient" }, { type: "suffix", text: "s" }],
};
assert.deepEqual(approvedLexicalBaseTexts(oldApproved), ["ingredient"]);
assert.equal(lexicalMorphologyReady(oldApproved, "ingredients", "ingredient"), false,
  "legacy parts can suggest a family but must not authorize a revision");
assert.deepEqual(approvedLexicalBaseTexts({ ...oldApproved, reviewStatus: "draft" }), []);

const currentApproved = { ...oldApproved, parts: [
  { kind: "base", sourceText: "ingredient", surfaceText: "ingredient" },
  { kind: "suffix", sourceText: "s", surfaceText: "s" },
] };
assert.equal(lexicalMorphologyReady(currentApproved, "ingredients", "ingredient"), true);
assert.equal(lexicalMorphologyReady(currentApproved, "ingredients", "in"), false);
assert.equal(lexicalMorphologyReady({ ...currentApproved, reviewStatus: "draft" }, "ingredients", "ingredient"), false);
console.log("Lexical family candidate regressions passed");
