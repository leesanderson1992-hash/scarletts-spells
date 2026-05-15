import assert from "node:assert/strict";

import { diagnoseManualSpelling } from "../lib/writing-engine/spelling/manual-diagnostic";

function testExactMatchIsHandledSafely() {
  const result = diagnoseManualSpelling({
    targetWord: "play",
    childSpelling: "play",
  });

  assert.equal(result.sourceType, "manual_diagnostic");
  assert.equal(result.hasDiagnosticConcern, false);
  assert.equal(result.likelyErrorCategory, null);
  assert.equal(result.suggestedMicroSkillKey, null);
  assert.equal(result.candidateHypothesis.sourceRef.sourceType, "manual_diagnostic");
}

function testOmittedLetterCaseProducesCandidateHypothesis() {
  const result = diagnoseManualSpelling({
    targetWord: "clap",
    childSpelling: "cap",
  });

  assert.equal(result.hasDiagnosticConcern, true);
  assert.equal(
    result.suggestedMicroSkillKey,
    "D4_PG_CONSONANT_BLENDS_BLEND_OMISSION_CHECK",
  );
  assert.equal(result.candidateHypothesis.domainModule, "spelling");
}

function testSubstitutedVowelCaseProducesCandidateHypothesis() {
  const result = diagnoseManualSpelling({
    targetWord: "cat",
    childSpelling: "cot",
  });

  assert.equal(result.likelyErrorCategory, "Phonic");
  assert.equal(
    result.suggestedMicroSkillKey,
    "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
  );
}

function testFinalSilentECaseProducesCandidateHypothesis() {
  const result = diagnoseManualSpelling({
    targetWord: "make",
    childSpelling: "mak",
  });

  assert.equal(result.likelyErrorCategory, "Pattern/rule");
  assert.equal(result.ruleMetadata.errorPattern, "missing_final_e");
  assert.equal(result.suggestedMicroSkillKey, "D4_PG_LONG_AI_SPLIT_A_E");
}

function testDoubledConsonantCaseProducesCandidateHypothesis() {
  const result = diagnoseManualSpelling({
    targetWord: "running",
    childSpelling: "runing",
  });

  assert.equal(result.hasDiagnosticConcern, true);
  assert.equal(result.ruleMetadata.errorPattern, "missing_double_letter");
  assert.equal(result.ruleMetadata.teachingFamilyId, "double_letters");
}

function testSimilarPracticeWordsAreDeterministic() {
  const resultA = diagnoseManualSpelling({
    targetWord: "play",
    childSpelling: "plai",
  });
  const resultB = diagnoseManualSpelling({
    targetWord: "play",
    childSpelling: "plai",
  });

  assert.deepEqual(resultA.similarPracticeWords, resultB.similarPracticeWords);
  assert.equal(resultA.similarPracticeWords[0], "play");
  assert.ok(resultA.similarPracticeWords.length > 1);
}

function testConfidenceIsClamped() {
  const result = diagnoseManualSpelling({
    targetWord: "there",
    childSpelling: "their",
    sentenceContext: "Their dog is over there.",
  });

  assert.ok(result.confidenceScore >= 0);
  assert.ok(result.confidenceScore <= 1);
  assert.equal(result.candidateHypothesis.confidence, result.confidenceScore);
}

function testResultIsDeterministic() {
  const first = diagnoseManualSpelling({
    targetWord: "make",
    childSpelling: "mak",
    sentenceContext: "I will make a cake.",
  });
  const second = diagnoseManualSpelling({
    targetWord: "make",
    childSpelling: "mak",
    sentenceContext: "I will make a cake.",
  });

  assert.deepEqual(first, second);
}

function testNoPersistenceOrMasteryMutationIsInvolved() {
  const result = diagnoseManualSpelling({
    targetWord: "cat",
    childSpelling: "cot",
  });

  assert.ok(!("verification" in result.candidateHypothesis));
  assert.ok(!("learningItemId" in result));
  assert.ok(!("parentVerificationId" in result.ruleMetadata.metadata));
  assert.equal(result.candidateHypothesis.sourceRef.sourceType, "manual_diagnostic");
}

function main() {
  testExactMatchIsHandledSafely();
  testOmittedLetterCaseProducesCandidateHypothesis();
  testSubstitutedVowelCaseProducesCandidateHypothesis();
  testFinalSilentECaseProducesCandidateHypothesis();
  testDoubledConsonantCaseProducesCandidateHypothesis();
  testSimilarPracticeWordsAreDeterministic();
  testConfidenceIsClamped();
  testResultIsDeterministic();
  testNoPersistenceOrMasteryMutationIsInvolved();

  console.log("writing-engine-stage1b-diagnostic-regression: ok");
}

main();
