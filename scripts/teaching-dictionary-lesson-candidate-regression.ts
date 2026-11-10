import assert from "node:assert/strict";
import { evaluateLessonCandidate } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { routeBlockers, routeWithSharedFacts, sharedRouteContentKeys, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";

const reading = {
  wordId: "00000000-0000-4000-8000-000000000101",
  displayWord: "reading",
  skillKey: "D4_INF_ING_ENDINGS_REGULAR",
  senseId: "reading-verb",
  senseSet: { pronunciations: [{ id: "reading-ipa", ipa: "/ˈriːdɪŋ/",
    spokenSyllableCount: 2, stressPattern: "primary-unstressed" }],
  senses: [{ id: "reading-verb", partOfSpeech: "verb", definition: "The act of reading.",
    pronunciationId: "reading-ipa", dictationSentence: "She is reading a book.",
    dictationTargetTokenIndex: 2 }] },
  morphology: { analysisStatus: "approved", reviewStatus: "approved_for_first_exposure",
    wordSum: "read + ing → reading", joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
    parts: [{ id: "base", kind: "base", sourceText: "read", surfaceText: "read", gloss: "read text" },
      { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "action in progress" }] },
  familyLinks: [{ sense_id: "reading-verb", family_key: "read_verb_base_family",
    component_part_id: "base", relationship_kind: "regular_inflection" }],
};

assert.equal(evaluateLessonCandidate(reading).status, "ready");
assert.deepEqual(evaluateLessonCandidate({ ...reading, familyLinks: [] }).issues.map(issue => issue.code),
  ["FAMILY_LINK"]);
assert.equal(evaluateLessonCandidate({ ...reading, skillKey: "D4_INF_ING_ENDINGS_DROP_E" }).status,
  "not_match");
const vegetable = evaluateLessonCandidate({ ...reading, displayWord: "vegetable",
  skillKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  morphology: { ...reading.morphology, wordSum: "veget + able → vegetable",
    parts: [{ id: "root", kind: "root", sourceText: "veget", surfaceText: "veget", gloss: "To grow or live" },
      { id: "suffix", kind: "suffix", sourceText: "able", surfaceText: "able", gloss: "able to be" }] },
  familyLinks: [{ sense_id: "reading-verb", family_key: "veget_bound_root_base_family",
    component_part_id: "root", relationship_kind: "historical_relative" }] });
assert.equal(vegetable.status, "not_match");
const ingRoute = { routeId: "ing_endings_word_lab", routeVersion: "v1",
  microSkillKey: reading.skillKey, wordMeaning: "", wordSum: "", content: {} };
const payload = {
  displayWord: "reading", definition: "Legacy meaning", senseSet: reading.senseSet,
  skillSenseIds: { [reading.skillKey]: reading.senseId },
  dictationSentence: "Legacy sentence.", metadata: { phoneme_hint: "/old/", syllables: "1",
    stress_pattern: "primary" },
  canonicalMorphology: { ...reading.morphology, rawSegmentation: "", rawPartOfSpeech: "verb",
    featureKeys: [], transformationNotes: "", transformations: [], reviewNotes: "" },
  provenance: { sourceCategory: "internal_reviewed_seed", sourceName: "Reviewed import",
    sourceUrl: "", sourceLicence: "internal_authored", sourceUseNote: "", confidence: "high" },
} as unknown as WordDraftPayload;
const generated = routeWithSharedFacts(ingRoute, payload);
assert.equal(generated.wordMeaning, "The act of reading.");
assert.equal(generated.content.base, "read");
assert.deepEqual(generated.content.sourceRefs, ["Reviewed import"]);
assert.deepEqual(sharedRouteContentKeys("ing_endings_word_lab", payload), ["base", "sourceRefs"]);
assert.deepEqual(routeBlockers(ingRoute, payload), []);
const staleRoute = { ...ingRoute, wordMeaning: "Old meaning",
  content: { base: "reed", sourceRefs: ["Old source"] } };
const regenerated = routeWithSharedFacts(staleRoute, payload);
assert.equal(regenerated.wordMeaning, "The act of reading.");
assert.equal(regenerated.content.base, "read");
assert.deepEqual(regenerated.content.sourceRefs, ["Reviewed import"]);
assert.deepEqual(routeBlockers(staleRoute, { ...payload, provenance: { ...payload.provenance,
  sourceName: "", sourceUrl: "" } }), ["Add reviewed Overview provenance for the derived form."]);
console.log("lesson candidate rules: passed");
