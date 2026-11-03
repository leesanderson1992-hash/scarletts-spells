import assert from "node:assert/strict";
import { selectLexicalLessonFamily } from "../lib/teaching-dictionary-manager/lexical-lesson-family";

const memberships = [{ family_key: "after_noun_base_family", revision: 2 },
  { family_key: "noon_noun_base_family", revision: 1 }];
assert.deepEqual(selectLexicalLessonFamily(memberships, "noon_noun_base_family"), memberships[1]);
assert.throws(() => selectLexicalLessonFamily(memberships, ""),
  /BASE_FAMILY_LEXICAL_SELECTION_REQUIRED/);
assert.throws(() => selectLexicalLessonFamily(memberships, "unrelated_base_family"),
  /BASE_FAMILY_LEXICAL_SELECTION_STALE/);
assert.deepEqual(selectLexicalLessonFamily([memberships[0]!], ""), memberships[0]);
assert.equal(selectLexicalLessonFamily([], ""), null);
console.log("Lexical lesson family selection regression passed");
