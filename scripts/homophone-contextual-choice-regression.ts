import assert from "node:assert/strict";
import { compileContextualChoiceSnapshot, evaluateContextualChoice, validateContextualChoiceContent,
  type ContextualChoiceContent } from "../lib/adle/homophone/contextual-choice-contract";

const content: ContextualChoiceContent = {
  microSkillKey: "D4_HOM_FUNCTION_WORD_HOMOPHONES_BY_BYE_BUY",
  contentVersion: "review-fixture-v1",
  teachingExplanation: "Choose the word that fits what the sentence means.",
  approvalReference: "regression-fixture",
  reviewStatus: "approved",
  sets: [{
    setId: "set-by-bye-buy", setKey: "BY_BYE_BUY", revision: 1,
    semanticFingerprint: "a".repeat(64), relationKind: "homophone", reviewStatus: "approved",
    memberWordIds: ["id-by", "id-bye", "id-buy"],
    members: [
      { canonicalWordId: "id-by", word: "by", intendedSense: "beside", grammaticalRole: "preposition",
        teachingSentence: "The dog sat by the door." },
      { canonicalWordId: "id-bye", word: "bye", intendedSense: "farewell", grammaticalRole: "interjection",
        teachingSentence: "She waved and said bye." },
      { canonicalWordId: "id-buy", word: "buy", intendedSense: "purchase", grammaticalRole: "verb",
        teachingSentence: "We will buy fresh apples." },
    ],
  }],
  questions: [
    { questionId: "q-by", setId: "set-by-bye-buy", sentenceWithBlank: "The dog sat ____ the door.",
      correctWordId: "id-by", optionWordIds: ["id-by", "id-bye", "id-buy"], evidenceMode: "independent_sentence" },
    { questionId: "q-bye", setId: "set-by-bye-buy", sentenceWithBlank: "She waved and said ____.",
      correctWordId: "id-bye", optionWordIds: ["id-by", "id-bye", "id-buy"], evidenceMode: "independent_sentence" },
    { questionId: "q-buy", setId: "set-by-bye-buy", sentenceWithBlank: "We will ____ fresh apples.",
      correctWordId: "id-buy", optionWordIds: ["id-by", "id-bye", "id-buy"], evidenceMode: "independent_sentence" },
  ],
};
validateContextualChoiceContent(content);
const snapshot = compileContextualChoiceSnapshot({ content, queuedItems: [], masteredWordIds: new Set(), rotationIndex: 0 });
assert.equal(snapshot?.selectedSets.length, 1);
assert.equal(snapshot?.selectedSets[0].members.length, 3);
assert.equal(snapshot?.questions.length, 3);
assert.deepEqual(evaluateContextualChoice({ snapshot: snapshot!, responses: [
  { questionId: "q-by", selectedWordId: "id-by" },
  { questionId: "q-bye", selectedWordId: "id-by" },
  { questionId: "q-buy", selectedWordId: "id-buy" },
] }), { microSkillKey: content.microSkillKey, evidenceMode: "independent_sentence", wordOutcomes: [
  { canonicalWordId: "id-by", correct: true, questionIds: ["q-by"] },
  { canonicalWordId: "id-bye", correct: false, questionIds: ["q-bye"] },
  { canonicalWordId: "id-buy", correct: true, questionIds: ["q-buy"] },
] });
assert.throws(() => evaluateContextualChoice({ snapshot: snapshot!, responses: [
  { questionId: "q-by", selectedWordId: "id-by" },
] }), /contextual_response_set_incomplete/);
assert.equal(compileContextualChoiceSnapshot({ content, queuedItems: [], masteredWordIds: new Set(["id-by"]), rotationIndex: 0 }), null);
assert.throws(() => validateContextualChoiceContent({ ...content, questions: content.questions.slice(0, 2) }),
  /contextual_member_not_independently_tested/);
assert.throws(() => validateContextualChoiceContent({ ...content, questions: [
  { ...content.questions[0], sentenceWithBlank: "by" }, ...content.questions.slice(1),
] }), /contextual_sentence_question_invalid/);
assert.throws(() => validateContextualChoiceContent({ ...content, questions: [
  { ...content.questions[0], optionWordIds: ["id-by", "id-bye"] }, ...content.questions.slice(1),
] }), /contextual_sentence_question_invalid/);
console.log("homophone contextual choice contract regression passed");
