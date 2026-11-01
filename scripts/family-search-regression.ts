import assert from "node:assert/strict";
import { familySearchResults, familySearchTerm } from "../lib/teaching-dictionary-manager/family-search";

assert.equal(familySearchTerm("  ICE   CREAM  "), "ice cream");
assert.equal(familySearchTerm("re%_"), "re");

const rows = [
  { family_key: "un_bound_root_base_family", revision: 1, base_lemma: "un",
    base_meaning: "one", base_kind: "bound_root" as const },
  { family_key: "under_verb_base_family", revision: 1, base_lemma: "under",
    base_meaning: "below", base_kind: "free_base" as const },
  { family_key: "run_verb_base_family", revision: 1, base_lemma: "run",
    base_meaning: "to move quickly", base_kind: "free_base" as const },
  { family_key: "run_verb_base_family", revision: 2, base_lemma: "run",
    base_meaning: "to move at speed", base_kind: "free_base" as const },
  { family_key: "play_verb_base_family", revision: 1, base_lemma: "play",
    base_meaning: "to take part in a game", base_kind: "free_base" as const },
];
const matches = familySearchResults(rows, "un");
assert.deepEqual(matches.map((row) => [row.baseLemma, row.baseKind]), [
  ["un", "bound_root"], ["under", "free_base"], ["run", "free_base"],
]);
assert.equal(matches.find((row) => row.baseLemma === "run")?.meaning, "to move at speed",
  "latest approved family revision wins");
assert.deepEqual(familySearchResults(rows, "ba"), [],
  "the common family-key suffix cannot create false matches");
console.log("PASS: lemma search ranks roots and bases without suffix false matches");
