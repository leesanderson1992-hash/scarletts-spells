import assert from "node:assert/strict";
import { evaluateLessonCandidate } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { canonicalWordSum, type CanonicalPart } from "../lib/teaching-dictionary-manager/canonical-morphology";
import { resolveSeparatedHyphenatedReadingIntroductionV2 } from "../lib/adle/morphology/compound-word-reading-release-v2";

for (const [word, components, joinType, skill] of [
  ["bedroom", ["bed", "room"], "none", "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS"],
  ["ice cream", ["ice", "cream"], "space", "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED"],
  ["part-time", ["part", "time"], "hyphen", "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED"],
] as const) {
  let start = 0;
  const parts: CanonicalPart[] = components.map((text, index) => {
    if (index && joinType !== "none") start++;
    const offset = start; start += text.length;
    return { id: `part-${index}`, kind: "base", sourceText: text, surfaceText: text, gloss: `Reviewed meaning of ${text}`, displayRange: { start: offset, end: start } };
  });
  const joins = [{ afterPartId: parts[0].id, beforePartId: parts[1].id, joinType }];
  const input = {
    wordId: "00000000-0000-4000-8000-000000000001", displayWord: word, skillKey: skill, senseId: "meaning",
    senseSet: { pronunciations: [{ id: "spoken", ipa: "/test/", spokenSyllableCount: 1, stressPattern: "primary" }],
      senses: [{ id: "meaning", definition: `Reviewed meaning of ${word}`, partOfSpeech: "noun", pronunciationId: "spoken", dictationSentence: `We discussed ${word}.`, dictationTargetTokenIndex: 2 }] },
    morphology: { parts, joins, wordSum: canonicalWordSum(parts, word), analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" },
    familyLinks: [{ sense_id: "meaning", component_part_id: parts[0].id, family_key: "reviewed-family", relationship_kind: "derived" }],
  };
  assert.equal(evaluateLessonCandidate(input).status, "ready", word);
  assert.equal(evaluateLessonCandidate({ ...input, familyLinks: [] }).status, "needs_facts", `${word}: family required`);
  assert.notEqual(evaluateLessonCandidate({ ...input, morphology: { ...input.morphology, joins: [{ ...joins[0], joinType: joinType === "none" ? "space" : "none" }] } }).status, "ready", `${word}: wrong join blocked`);
  assert.equal(evaluateLessonCandidate({ ...input, skillKey: skill.endsWith("CLOSED_COMPOUNDS")
    ? "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED" : "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS" }).status, "not_match", `${word}: correct lesson only`);
}
assert.equal(resolveSeparatedHyphenatedReadingIntroductionV2({ schemaVersion: 1,
  microSkillKey: "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED", childFriendlyExplanation: "Historical teaching", ruleExplanation: "Join the components." }), null);
console.log("PASS: closed, open and hyphenated compounds, family requirement, wrong joins, lesson matching and historical teaching fallback");
