import assert from "node:assert/strict";

import { analyzeStage5aAuthenticSubmissionSentenceBoundaries } from "../lib/writing-engine/sentence-boundaries/stage5a-authentic-submission-analysis";

function testSentenceBoundaryCandidatesPreserveCanonicalProvenance() {
  const result = analyzeStage5aAuthenticSubmissionSentenceBoundaries({
    taskSubmission: {
      id: "submission-5a-1",
      childId: "child-5a-1",
      submissionText: "unused fallback text",
    },
    writingSample: {
      id: "sample-5a-1",
      taskSubmissionId: "submission-5a-1",
      sampleText: "hello world.hello again",
    },
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.normalization.sourceTextOrigin, "writing_sample");

  const capitalization = result.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.rule === "sentence_start_not_capitalized" &&
      entry.observedText === "h" &&
      entry.positionStart === 0,
  );
  assert.ok(capitalization);
  if (!capitalization || capitalization.status !== "candidate") {
    throw new Error("Expected a sentence-start capitalization candidate.");
  }
  assert.equal(capitalization.candidateHypothesis.domainModule, "sentence_boundaries");
  assert.equal(capitalization.sourceRef.taskSubmissionId, "submission-5a-1");
  assert.equal(capitalization.sourceRef.writingSampleId, "sample-5a-1");
  assert.deepEqual(capitalization.sourceRef.metadata?.sourceSpan, {
    positionStart: capitalization.positionStart,
    positionEnd: capitalization.positionEnd,
  });

  const spacing = result.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.rule === "missing_space_after_sentence_end",
  );
  assert.ok(spacing);
  if (!spacing || spacing.status !== "candidate") {
    throw new Error("Expected a missing-space-after-sentence-end candidate.");
  }
  assert.equal(spacing.observedText, ".h");
  assert.equal(spacing.targetText, ". h");
  assert.equal(spacing.sourceRef.metadata?.targetText, ". h");
}

function testMissingTerminalPunctuationCandidateUsesFallbackSubmissionText() {
  const input = {
    taskSubmission: {
      id: "submission-5a-2",
      childId: "child-5a-2",
      submissionText: "Prompt: ignore this\n\nthis is the ending",
    },
    writingSample: null,
  } satisfies Parameters<
    typeof analyzeStage5aAuthenticSubmissionSentenceBoundaries
  >[0];

  const first = analyzeStage5aAuthenticSubmissionSentenceBoundaries(input);
  const second = analyzeStage5aAuthenticSubmissionSentenceBoundaries(input);

  assert.deepEqual(first, second);
  assert.equal(first.normalization.sourceTextOrigin, "task_submission_text");
  assert.ok(first.normalization.analysisText.includes("this is the ending"));
  assert.ok(!first.normalization.analysisText.includes("Prompt: ignore this"));

  const terminal = first.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.rule === "missing_terminal_punctuation",
  );
  assert.ok(terminal);
  if (!terminal || terminal.status !== "candidate") {
    throw new Error("Expected a missing terminal punctuation candidate.");
  }
  assert.equal(terminal.observedText, "ending");
  assert.equal(terminal.targetText, "ending.");
}

function testGrammarAndProofreadingDependentCasesStayExplicitlyUnresolved() {
  const result = analyzeStage5aAuthenticSubmissionSentenceBoundaries({
    taskSubmission: {
      id: "submission-5a-3",
      childId: "child-5a-3",
      submissionText: "",
    },
    writingSample: {
      id: "sample-5a-3",
      taskSubmissionId: "submission-5a-3",
      sampleText: "i went home \"later",
    },
  });

  const grammar = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "requires_grammar_semantics",
  );
  assert.ok(grammar);
  if (!grammar || grammar.status !== "unresolved") {
    throw new Error("Expected a grammar-dependent unresolved sentence-boundary result.");
  }
  assert.equal(grammar.observedText, "i");

  const proofreading = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "requires_proofreading_semantics",
  );
  assert.ok(proofreading);
  if (!proofreading || proofreading.status !== "unresolved") {
    throw new Error("Expected a proofreading-dependent unresolved sentence-boundary result.");
  }
  assert.equal(proofreading.sourceRef.metadata?.targetText, null);
}

function testUnsupportedSentenceBoundaryPatternsStayExplicitlyUnresolved() {
  const result = analyzeStage5aAuthenticSubmissionSentenceBoundaries({
    taskSubmission: {
      id: "submission-5a-4",
      childId: "child-5a-4",
      submissionText: "",
    },
    writingSample: {
      id: "sample-5a-4",
      taskSubmissionId: "submission-5a-4",
      sampleText: "Wait... what happened",
    },
  });

  const unresolved = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "unsupported_sentence_boundary_pattern",
  );
  assert.ok(unresolved);
  if (!unresolved || unresolved.status !== "unresolved") {
    throw new Error("Expected an unsupported sentence-boundary unresolved result.");
  }
  assert.equal(unresolved.observedText, "...");
}

function testNoWritesAreIntroduced() {
  const result = analyzeStage5aAuthenticSubmissionSentenceBoundaries({
    taskSubmission: {
      id: "submission-5a-5",
      childId: "child-5a-5",
      submissionText: "",
    },
    writingSample: {
      id: "sample-5a-5",
      taskSubmissionId: "submission-5a-5",
      sampleText: "hello world",
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
  testSentenceBoundaryCandidatesPreserveCanonicalProvenance();
  testMissingTerminalPunctuationCandidateUsesFallbackSubmissionText();
  testGrammarAndProofreadingDependentCasesStayExplicitlyUnresolved();
  testUnsupportedSentenceBoundaryPatternsStayExplicitlyUnresolved();
  testNoWritesAreIntroduced();
  console.log("writing-engine-stage5a-sentence-boundary-candidate-regression: ok");
}

main();
