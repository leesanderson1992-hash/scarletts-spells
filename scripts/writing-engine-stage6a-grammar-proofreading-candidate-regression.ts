import assert from "node:assert/strict";

import { analyzeStage6aAuthenticSubmissionGrammarProofreading } from "../lib/writing-engine/grammar/stage6a-authentic-submission-analysis";

function testGrammarCandidatePreservesCanonicalProvenance() {
  const result = analyzeStage6aAuthenticSubmissionGrammarProofreading({
    taskSubmission: {
      id: "submission-6a-1",
      childId: "child-6a-1",
      submissionText: "unused fallback text",
    },
    writingSample: {
      id: "sample-6a-1",
      taskSubmissionId: "submission-6a-1",
      sampleText: "i went home.",
    },
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.normalization.sourceTextOrigin, "writing_sample");

  const candidate = result.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.domainModule === "grammar" &&
      entry.rule === "standalone_lowercase_i",
  );

  assert.ok(candidate);
  if (!candidate || candidate.status !== "candidate") {
    throw new Error("Expected a Stage 6A grammar candidate.");
  }

  assert.equal(candidate.observedText, "i");
  assert.equal(candidate.targetText, "I");
  assert.equal(candidate.candidateHypothesis.domainModule, "grammar");
  assert.equal(candidate.sourceRef.taskSubmissionId, "submission-6a-1");
  assert.equal(candidate.sourceRef.writingSampleId, "sample-6a-1");
  assert.deepEqual(candidate.sourceRef.metadata?.sourceSpan, {
    positionStart: candidate.positionStart,
    positionEnd: candidate.positionEnd,
  });
  assert.equal(candidate.sourceRef.metadata?.targetText, "I");
  assert.equal(candidate.sourceRef.metadata?.childAttemptText, "i");
}

function testProofreadingCandidateUsesFallbackSubmissionTextDeterministically() {
  const input = {
    taskSubmission: {
      id: "submission-6a-2",
      childId: "child-6a-2",
      submissionText: "Prompt: ignore this\n\nwe  went home",
    },
    writingSample: null,
  } satisfies Parameters<
    typeof analyzeStage6aAuthenticSubmissionGrammarProofreading
  >[0];

  const first = analyzeStage6aAuthenticSubmissionGrammarProofreading(input);
  const second = analyzeStage6aAuthenticSubmissionGrammarProofreading(input);

  assert.deepEqual(first, second);
  assert.equal(first.normalization.sourceTextOrigin, "task_submission_text");
  assert.ok(first.normalization.analysisText.includes("we  went home"));
  assert.ok(!first.normalization.analysisText.includes("Prompt: ignore this"));

  const candidate = first.results.find(
    (entry) =>
      entry.status === "candidate" &&
      entry.domainModule === "proofreading" &&
      entry.rule === "repeated_internal_spacing",
  );

  assert.ok(candidate);
  if (!candidate || candidate.status !== "candidate") {
    throw new Error("Expected a Stage 6A proofreading candidate.");
  }

  assert.equal(candidate.observedText, "we  went");
  assert.equal(candidate.targetText, "we went");
  assert.equal(candidate.candidateHypothesis.domainModule, "proofreading");
}

function testOutOfScopeCasesStayExplicitlyUnresolved() {
  const result = analyzeStage6aAuthenticSubmissionGrammarProofreading({
    taskSubmission: {
      id: "submission-6a-3",
      childId: "child-6a-3",
      submissionText: "",
    },
    writingSample: {
      id: "sample-6a-3",
      taskSubmissionId: "submission-6a-3",
      sampleText: "a apple \"later",
    },
  });

  const taxonomy = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "requires_undocumented_taxonomy_truth",
  );
  assert.ok(taxonomy);
  if (!taxonomy || taxonomy.status !== "unresolved") {
    throw new Error(
      "Expected an unresolved Stage 6A taxonomy-dependent grammar result.",
    );
  }
  assert.equal(taxonomy.domainModule, "grammar");
  assert.equal(taxonomy.observedText, "a apple");
  assert.equal(taxonomy.sourceRef.metadata?.targetText, null);

  const proofreading = result.results.find(
    (entry) =>
      entry.status === "unresolved" &&
      entry.reason === "requires_broad_proofreading_ownership",
  );
  assert.ok(proofreading);
  if (!proofreading || proofreading.status !== "unresolved") {
    throw new Error(
      "Expected an unresolved Stage 6A broad-proofreading result.",
    );
  }
  assert.equal(proofreading.domainModule, "proofreading");
  assert.equal(proofreading.sourceRef.metadata?.targetText, null);
}

function testNoWritesAreIntroduced() {
  const result = analyzeStage6aAuthenticSubmissionGrammarProofreading({
    taskSubmission: {
      id: "submission-6a-4",
      childId: "child-6a-4",
      submissionText: "",
    },
    writingSample: {
      id: "sample-6a-4",
      taskSubmissionId: "submission-6a-4",
      sampleText: "i  went home",
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
  testGrammarCandidatePreservesCanonicalProvenance();
  testProofreadingCandidateUsesFallbackSubmissionTextDeterministically();
  testOutOfScopeCasesStayExplicitlyUnresolved();
  testNoWritesAreIntroduced();
  console.log("writing-engine-stage6a-grammar-proofreading-candidate-regression: ok");
}

main();
