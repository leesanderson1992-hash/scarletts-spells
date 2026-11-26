import assert from "node:assert/strict";
import { evaluateLessonCandidate } from "../lib/teaching-dictionary-manager/lesson-candidate";
for (const [word, base, ending, surface] of [["children", "child", "ren", "child"], ["knives", "knife", "es", "kniv"]]) {
  const decision = evaluateLessonCandidate({ wordId: word, displayWord: word,
    skillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE", senseId: "review",
    senseSet: { senses: [{ id: "review", definition: `More than one ${base}.`, partOfSpeech: "noun", pronunciationId: "spoken",
      dictationSentence: `The ${word} are here.`, dictationTargetTokenIndex: 1 }],
      pronunciations: [{ id: "spoken", ipa: "/tɛst/", spokenSyllableCount: 1, stressPattern: "primary" }] },
    morphology: { parts: [{ id: "base", kind: "base", sourceText: base, surfaceText: surface, gloss: "Reviewed base meaning", displayRange: { start: 0, end: surface.length } },
      { id: "ending", kind: "suffix", sourceText: ending, surfaceText: ending, gloss: "More than one", displayRange: { start: surface.length, end: word.length } }],
      joins: [{ afterPartId: "base", beforePartId: "ending", joinType: "none" }], transformations: base === "knife" ? [{ type: "change_final_fe_to_v", sourcePartId: "base", sourceText: "knife", surfaceText: "kniv", explanation: "Change final fe to v." }] : [], wordSum: `${base} + ${ending} → ${word}`, analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" },
    familyLinks: [{ sense_id: "review", family_key: `${base}_family`, component_part_id: "base", relationship_kind: "irregular_inflection" }] });
  assert.equal(decision.status, "ready");
  assert(!decision.issues.some(issue => issue.code === "IRREGULAR_FORM"));
  assert(!decision.issues.some(issue => issue.code === "FAMILY_LINK"), "A valid irregular family link must not be reported missing");
}
console.log("PASS: children and knives keep their family links and remain eligible through reviewed spelling connections");
