import assert from "node:assert/strict";
import { familyDisplayName, lexicalFamilyDisplayName, legacyFamilyBase } from "../lib/teaching-dictionary-manager/family-display-name";
import { familySearchResults } from "../lib/teaching-dictionary-manager/family-search";
import { mergeWordFamilySummaries } from "../lib/teaching-dictionary-manager/base-family-summary";

assert.equal(familyDisplayName({ base: "clean", partOfSpeech: "verb", meaning: "To remove dirt." }), "clean (verb) — To remove dirt");
assert.equal(familyDisplayName({ base: "popul", partOfSpeech: "bound_root", kind: "bound_root", meaning: "people" }), "popul (root) — people");
assert.equal(familyDisplayName({ base: "of", partOfSpeech: "preposition", meaning: "belonging to" }), "of (preposition) — belonging to");
assert.equal(familyDisplayName({ base: "joy", meaning: "" }), "joy (base)");
assert.equal(legacyFamilyBase("mother_in_law_noun_legacy_sense_123_base_family"), "mother in law");
const families = [
  { family_key: "act_verb_sense_one_base_family", revision: 1, base_lemma: "act", base_part_of_speech: "verb", base_kind: "free_base" as const, base_meaning: "Do something." },
  { family_key: "act_verb_sense_two_base_family", revision: 1, base_lemma: "act", base_part_of_speech: "verb", base_kind: "free_base" as const, base_meaning: "Perform a character." },
];
const results = familySearchResults(families, "act");
assert.equal(new Set(results.map(r => r.name)).size, 2, "same spelling and POS retain distinct sense labels");
assert.deepEqual(results.map(r => r.id), families.map(f => f.family_key), "selection values remain original family keys");
assert(results.every(r => !r.name.includes("_base_family")));
const changedWording = { ...families[0], base_meaning: "Carry out an action." };
assert.notEqual(lexicalFamilyDisplayName(changedWording), lexicalFamilyDisplayName(families[0]));
const summaries = families.map(f => ({ name: f.family_key, displayName: lexicalFamilyDisplayName(f), meaning: f.base_meaning, words: [{ id: "member", word: "act" }] }));
const merged = mergeWordFamilySummaries([], summaries, [], new Set());
assert.deepEqual(merged.map(f => f.name), families.map(f => f.family_key));
assert.deepEqual(merged.map(f => f.words), summaries.map(f => f.words), "display labels do not modify family members");
const workbookOptions = families.map(f => `${lexicalFamilyDisplayName(f)} | ${f.family_key}`);
assert.deepEqual(workbookOptions.map(label => label.split(" | ").at(-1)), families.map(f => f.family_key), "workbook labels round-trip exact IDs");
console.log("PASS: sense-specific family names, root labels, stable links, current wording and workbook ID round-trip");
