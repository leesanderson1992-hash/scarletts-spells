import assert from "node:assert/strict";
import { parseMultiSenseCsv, prepareReviewedCsv, renderMultiSenseCsv, renderMultiSenseCsvBundles, type MultiSenseCsvBundle } from
  "../lib/teaching-dictionary-manager/multi-sense-csv";

const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
const pronunciationId = "boxing-pronunciation";
const pronunciation = { id: pronunciationId, ipa: "/bˈɒksɪŋ/", spokenSyllableCount: 2,
  stressPattern: "primary-unstressed" };
const definitions = [
  ["sport", "A sport in which two people fight using padded gloves.", "noun", "Boxing requires gloves."],
  ["fighting", "Fighting an opponent using padded gloves.", "verb", "She is boxing her partner."],
  ["packing", "Putting things into boxes.", "verb", "He is boxing the books."],
] as const;
const bundle: MultiSenseCsvBundle = {
  wordId, displayWord: "boxing", sourceSenseReviewedAt: "2026-11-11T05:00:00Z",
  senseSet: { pronunciations: [pronunciation], senses: definitions.map(([id, definition, partOfSpeech,
    dictationSentence]) => ({ id, definition, partOfSpeech, pronunciationId, dictationSentence,
    dictationTargetTokenIndex: id === "sport" ? 0 : 2 })) },
  analyses: definitions.map(([senseId], index) => ({ senseId,
    parts: [
      { id: "part_1", kind: "base", sourceText: "box", surfaceText: "box",
        gloss: index === 2 ? "To put things into boxes." : "To fight using padded gloves.",
        displayRange: { start: 0, end: 3 } },
      { id: "part_2", kind: "suffix", sourceText: "ing", surfaceText: "ing",
        gloss: index ? "An action happening now." : "The activity or sport of doing something.",
        displayRange: { start: 3, end: 6 } },
    ], joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
    transformations: [], wordSum: "box + ing → boxing",
    familyKey: index === 2 ? "box_verb_packing_base_family" : "box_verb_fighting_base_family",
    componentPartId: "part_1", relationshipKind: index ? "regular_inflection" : "derived",
    requestedSkillKeys: index ? ["D4_INF_ING_ENDINGS_REGULAR"] : [],
  })) };

const csv = renderMultiSenseCsv(bundle);
const [parsed] = parseMultiSenseCsv(csv);
assert.equal(parsed.senseSet.senses.length, 3);
assert.equal(parsed.senseSet.pronunciations.length, 1);
assert.deepEqual(parsed.analyses.map(row => row.relationshipKind),
  ["derived", "regular_inflection", "regular_inflection"]);
assert.deepEqual(parsed.analyses.map(row => row.requestedSkillKeys.length), [0, 1, 1]);
assert.equal(parsed.analyses[2].wordSum, "box + ing → boxing");
const second: MultiSenseCsvBundle = { ...bundle,
  wordId: "eea2483f-60e5-463f-87be-2283493f645a",
  senseSet: { ...bundle.senseSet, senses: [bundle.senseSet.senses[0]] },
  analyses: [bundle.analyses[0]] };
assert.equal(parseMultiSenseCsv(renderMultiSenseCsvBundles([bundle, second])).length, 2);

const lines = csv.trim().split("\r\n");
assert.throws(() => parseMultiSenseCsv(`${lines[0]}\r\n${lines[1]}\r\n${lines[1]}\r\n`),
  /Duplicate meaning ID/);
assert.throws(() => parseMultiSenseCsv(csv.replace('"part_1","base","box","box","To fight',
  '"part_1","base","box","bo","To fight')), /spelling-change explanation/);
assert.throws(() => parseMultiSenseCsv(csv.replace('"box_verb_packing_base_family"', '""')),
  /Select a matching base or root part, family and relationship/);
console.log("Three-meaning CSV round-trip and invalid-row checks passed.");

const newWord: MultiSenseCsvBundle = {
  wordId: "", displayWord: "box", sourceSenseReviewedAt: "",
  senseSet: { pronunciations: [pronunciation], senses: [
    { id: "pack", definition: "Put something in a box.", partOfSpeech: "verb", pronunciationId },
  ] },
  analyses: [{ ...bundle.analyses[2], senseId: "pack", parts: [bundle.analyses[2].parts[0]],
    joins: [], wordSum: "box → box", familyKey: "", componentPartId: "", relationshipKind: "" }],
};
const mixed = renderMultiSenseCsvBundles([bundle, newWord]);
assert.deepEqual(prepareReviewedCsv(mixed).map(entry => [entry.bundle?.wordId, entry.rows]),
  [[wordId, [2, 3, 4]], ["", [5]]]);
const partial = prepareReviewedCsv(mixed.replace('"Put something in a box."', '""'));
assert.equal(partial[0].bundle?.wordId, wordId);
assert.match(partial[1].error ?? "", /definition/i);
