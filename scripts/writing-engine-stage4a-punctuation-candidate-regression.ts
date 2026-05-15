import assert from "node:assert/strict";

import { analyzeStage4aAuthenticSubmissionPunctuation } from "../lib/writing-engine/punctuation/stage4a-authentic-submission-analysis";

function testSuccessfulPunctuationCandidateGenerationPreservesProvenance() {
  const result = analyzeStage4aAuthenticSubmissionPunctuation({
    taskSubmission: {
      id: "submission-1",
      childId: "child-1",
      submissionText: "unused fallback text",
    },
    writingSample: {
      id: "sample-1",
      taskSubmissionId: "submission-1",
      sampleText: "Hello ! I like apples,pears;grapes too.",
    },
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.normalization.sourceTextOrigin, "writing_sample");

  const spaceBefore = result.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.rule === "space_before_punctuation",
  );
  assert.ok(spaceBefore);
  if (!spaceBefore || spaceBefore.status !== "candidate") {
    throw new Error("Expected a punctuation candidate for spacing before punctuation.");
  }
  assert.equal(spaceBefore.sourceRef.sourceType, "authentic_writing");
  assert.equal(spaceBefore.sourceRef.taskSubmissionId, "submission-1");
  assert.equal(spaceBefore.sourceRef.writingSampleId, "sample-1");
  assert.equal(spaceBefore.targetText, "!");
  assert.equal(spaceBefore.candidateHypothesis.domainModule, "punctuation");
  assert.equal(spaceBefore.candidateHypothesis.suggestedCategoryCode, null);
  assert.equal(spaceBefore.candidateHypothesis.suggestedMicroSkillKey, null);
  assert.equal(spaceBefore.candidateHypothesis.suggestedTemplateKey, null);
  assert.deepEqual(spaceBefore.sourceRef.metadata?.sourceSpan, {
    positionStart: spaceBefore.positionStart,
    positionEnd: spaceBefore.positionEnd,
  });
  assert.equal(spaceBefore.sourceRef.metadata?.targetText, "!");

  const missingSpaceAfter = result.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.rule === "missing_space_after_punctuation" &&
      entry.observedText === ",",
  );
  assert.ok(missingSpaceAfter);
  if (!missingSpaceAfter || missingSpaceAfter.status !== "candidate") {
    throw new Error("Expected a punctuation candidate for missing inline space after punctuation.");
  }
  assert.equal(missingSpaceAfter.targetText, ", ");
  assert.equal(missingSpaceAfter.sourceRef.metadata?.targetText, ", ");
}

function testResultIsDeterministic() {
  const input = {
    taskSubmission: {
      id: "submission-2",
      childId: "child-2",
      submissionText: "Prompt: ignore this\n\nHello ! I like apples,pears",
    },
    writingSample: null,
  } satisfies Parameters<typeof analyzeStage4aAuthenticSubmissionPunctuation>[0];

  const first = analyzeStage4aAuthenticSubmissionPunctuation(input);
  const second = analyzeStage4aAuthenticSubmissionPunctuation(input);

  assert.deepEqual(first, second);
  assert.equal(first.normalization.sourceTextOrigin, "task_submission_text");
  assert.ok(first.normalization.analysisText.includes("Hello ! I like apples,pears"));
  assert.ok(!first.normalization.analysisText.includes("Prompt: ignore this"));
}

function testSentenceBoundaryDependentCasesStayExplicitlyUnresolved() {
  const result = analyzeStage4aAuthenticSubmissionPunctuation({
    taskSubmission: {
      id: "submission-3",
      childId: "child-3",
      submissionText: "",
    },
    writingSample: {
      id: "sample-3",
      taskSubmissionId: "submission-3",
      sampleText: "I went home",
    },
  });

  const unresolved = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "requires_sentence_boundary_semantics",
  );
  assert.ok(unresolved);
  if (!unresolved || unresolved.status !== "unresolved") {
    throw new Error("Expected a sentence-boundary unresolved punctuation result.");
  }
  assert.equal(unresolved.targetText, null);
  assert.equal(unresolved.sourceRef.taskSubmissionId, "submission-3");
  assert.equal(unresolved.sourceRef.writingSampleId, "sample-3");
  assert.deepEqual(unresolved.sourceRef.metadata?.sourceSpan, {
    positionStart: unresolved.positionStart,
    positionEnd: unresolved.positionEnd,
  });
}

function testUnsupportedPunctuationCasesStayExplicitlyUnresolved() {
  const result = analyzeStage4aAuthenticSubmissionPunctuation({
    taskSubmission: {
      id: "submission-4",
      childId: "child-4",
      submissionText: "",
    },
    writingSample: {
      id: "sample-4",
      taskSubmissionId: "submission-4",
      sampleText: "She said \"hello.",
    },
  });

  const unresolved = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "unsupported_punctuation_pattern",
  );
  assert.ok(unresolved);
  if (!unresolved || unresolved.status !== "unresolved") {
    throw new Error("Expected an unsupported punctuation unresolved result.");
  }
  assert.equal(unresolved.sourceRef.metadata?.targetText, null);
}

function testGrammarDependentCasesStayExplicitlyUnresolved() {
  const result = analyzeStage4aAuthenticSubmissionPunctuation({
    taskSubmission: {
      id: "submission-5",
      childId: "child-5",
      submissionText: "",
    },
    writingSample: {
      id: "sample-5",
      taskSubmissionId: "submission-5",
      sampleText: "I dont know",
    },
  });

  const unresolved = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "requires_grammar_semantics",
  );
  assert.ok(unresolved);
  if (!unresolved || unresolved.status !== "unresolved") {
    throw new Error("Expected a grammar-dependent unresolved punctuation result.");
  }
  assert.equal(unresolved.observedText, "dont");
}

function testNoWritesAreIntroduced() {
  const result = analyzeStage4aAuthenticSubmissionPunctuation({
    taskSubmission: {
      id: "submission-6",
      childId: "child-6",
      submissionText: "",
    },
    writingSample: {
      id: "sample-6",
      taskSubmissionId: "submission-6",
      sampleText: "Hello !",
    },
  });

  const [firstResult] = result.results;
  assert.ok(firstResult);
  assert.ok(!("verificationRecord" in firstResult));
  assert.ok(!("verifiedOutcome" in firstResult));
  assert.ok(!("writingIssueRecord" in firstResult));
  if (firstResult.status === "candidate") {
    assert.ok(!("learningItemId" in firstResult.candidateHypothesis));
  }
}

function main() {
  testSuccessfulPunctuationCandidateGenerationPreservesProvenance();
  testResultIsDeterministic();
  testSentenceBoundaryDependentCasesStayExplicitlyUnresolved();
  testUnsupportedPunctuationCasesStayExplicitlyUnresolved();
  testGrammarDependentCasesStayExplicitlyUnresolved();
  testNoWritesAreIntroduced();
  console.log("writing-engine-stage4a-punctuation-candidate-regression: ok");
}

main();
