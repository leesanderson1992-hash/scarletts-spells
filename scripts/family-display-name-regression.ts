import assert from "node:assert/strict";
import { familyDisplayName, lexicalFamilyDisplayName, legacyFamilyBase } from "../lib/teaching-dictionary-manager/family-display-name";
import { familySearchResults } from "../lib/teaching-dictionary-manager/family-search";
import { mergeWordFamilySummaries } from "../lib/teaching-dictionary-manager/base-family-summary";

assert.equal(familyDisplayName({ base: "clean", partOfSpeech: "verb", meaning: "To remove dirt." }), "clean (base) — To remove dirt");
assert.equal(familyDisplayName({ base: "popul", partOfSpeech: "bound_root", kind: "bound_root", meaning: "people" }), "popul (bound root) — people");
assert.equal(familyDisplayName({ base: "of", partOfSpeech: "preposition", meaning: "belonging to" }), "of (base) — belonging to");
assert.equal(familyDisplayName({ base: "smile", partOfSpeech: "noun", meaning: "Show happiness." }),
  familyDisplayName({ base: "smile", partOfSpeech: "verb", meaning: "Show happiness." }),
  "Shared spelling-family meaning is not split by noun/verb role");
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
const aliased = mergeWordFamilySummaries([], [{ name: 'smile_current', aliases: ['smile_old'], meaning: 'Show happiness', words: [{id:'smile',word:'smile'}] }], [{name:'smile_old',meaning:'Make a happy face',words:[{id:'smiled',word:'smiled'}]}], new Set(['smile_current']));
assert.equal(aliased.length,1);
assert.equal(aliased[0].meaning,'Show happiness');
assert.deepEqual(aliased[0].words.map(word=>word.word),['smile','smiled']);
console.log('PASS: recorded legacy aliases use current meaning and preserve all members');
