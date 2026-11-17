import assert from "node:assert/strict";
import { COMPARATIVE_MICRO_SKILLS } from "../lib/adle/inflection/contracts";
import { evaluateLessonCandidate, type CandidateInput } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { canonicalWordSum, type CanonicalPart } from "../lib/teaching-dictionary-manager/canonical-morphology";

const cases = [
  ["small", "small"],
  ["nice", "nic"],
  ["happy", "happi"],
  ["big", "bigg"],
] as const;
for (const [index, skill] of COMPARATIVE_MICRO_SKILLS.entries()) {
  const [base, stem] = cases[index];
  for (const ending of ["", "er", "est"]) {
    const word = ending ? stem + ending : base;
    const parts: CanonicalPart[] = [{id: "base", kind: "base", sourceText: base, surfaceText: ending ? stem : base,
      gloss: "Reviewed adjective meaning", displayRange: {start: 0, end: ending ? stem.length : base.length}}];
    if (ending) parts.push({id: "ending", kind: "suffix", sourceText: ending, surfaceText: ending,
      gloss: "Reviewed degree meaning", displayRange: {start: stem.length, end: word.length}});
    const input: CandidateInput = {
      wordId: word, displayWord: word, skillKey: skill, senseId: "adjective",
      senseSet: {senses: [{id: "adjective", definition: "Reviewed adjective meaning", partOfSpeech: "adjective",
        pronunciationId: "british", dictationSentence: word, dictationTargetTokenIndex: 0}],
        pronunciations: [{id: "british", ipa: "/test/", spokenSyllableCount: 1, stressPattern: "primary"}]},
      morphology: {parts, joins: ending ? [{afterPartId: "base", beforePartId: "ending", joinType: "none"}] : [],
        analysisStatus: "approved", reviewStatus: "approved_for_first_exposure", wordSum: canonicalWordSum(parts, word)},
      familyLinks: [{sense_id: "adjective", family_key: base, component_part_id: "base",
        relationship_kind: ending ? "regular_inflection" : "free_base"}],
    };
    assert.equal(evaluateLessonCandidate(input).status, "ready", word);
    assert.equal(evaluateLessonCandidate({...input, familyLinks: []}).status, "needs_facts");
    const noun = structuredClone(input);
    noun.senseSet!.senses[0].partOfSpeech = "noun";
    assert.equal(evaluateLessonCandidate(noun).status, "not_match");
    if (ending && stem !== base) {
      const wrong = structuredClone(input);
      const raw = wrong.morphology!.parts as CanonicalPart[];
      raw[0].sourceText = "incorrect";
      wrong.morphology!.wordSum = canonicalWordSum(raw, word);
      assert.equal(evaluateLessonCandidate(wrong).status, "not_match");
    }
  }
}
console.log("Comparative workbook candidates passed for all four rules.");
