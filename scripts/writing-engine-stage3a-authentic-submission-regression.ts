import assert from "node:assert/strict";

import { analyzeStage3aAuthenticSubmissionSpelling } from "../lib/writing-engine/spelling/stage3a-authentic-submission-analysis";
import type { WritingEngineStage1d1CatalogEntry } from "../lib/writing-engine/types";

function buildCatalogEntry(
  overrides?: Partial<WritingEngineStage1d1CatalogEntry>,
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey: "D4_PG_FINAL_E_DROP",
    masteryDomainKey: "D4",
    skillFamilyKey: "D4_PG",
    skillClusterKey: "D4_PG_SUFFIXES",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    displayName: "Drop final e before suffixes",
    allowedTemplateKeys: ["T03"],
    metadata: {
      starter_word_bank: [
        { word: "taste", difficulty: "easy" },
        { word: "make", difficulty: "easy" },
        { word: "bake", difficulty: "medium" },
      ],
      example_words: ["taste", "tasting"],
      teaching_point: "Keep the base word clear before adding the suffix.",
    },
    ...overrides,
  };
}

function testAuthenticWritingCandidatesPreserveCanonicalSourceRefs() {
  const result = analyzeStage3aAuthenticSubmissionSpelling({
    taskSubmission: {
      id: "submission-1",
      childId: "child-1",
      submissionText: "unused fallback text",
    },
    writingSample: {
      id: "sample-1",
      taskSubmissionId: "submission-1",
      sampleText: "I tast cake and plai outside becuase it is sunny.",
    },
    catalogEntries: [
      buildCatalogEntry(),
      buildCatalogEntry({
        microSkillKey: "D4_PG_LONG_AI_FINAL_AY",
        skillClusterKey: "D4_PG_LONG_AI",
        displayName: "Long /a/ final ay",
        metadata: {
          starter_word_bank: [{ word: "play", difficulty: "easy" }],
          example_words: ["day"],
          teaching_point: "Use ay at the end of many long /a/ words.",
        },
      }),
      buildCatalogEntry({
        microSkillKey: "D4_PG_LONG_AI_AI_AY_CONTRAST",
        skillClusterKey: "D4_PG_LONG_AI",
        displayName: "Long /a/ ai/ay contrast",
        metadata: {
          starter_word_bank: [{ word: "play", difficulty: "easy" }],
          example_words: ["rain"],
          teaching_point: "Compare ai and ay spellings for long /a/.",
        },
      }),
    ],
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.normalization.sourceTextOrigin, "writing_sample");
  assert.equal(result.hypotheses.length, 3);

  const taste = result.hypotheses.find(
    (hypothesis) => hypothesis.suggestedReplacement === "taste",
  );
  assert.ok(taste);
  assert.equal(taste.sourceRef.sourceType, "authentic_writing");
  assert.equal(taste.sourceRef.taskSubmissionId, "submission-1");
  assert.equal(taste.sourceRef.writingSampleId, "sample-1");
  assert.equal(
    taste.candidateHypothesis.metadata?.targetText,
    "taste",
  );
  assert.equal(
    taste.candidateHypothesis.metadata?.childAttemptText,
    "tast",
  );
  assert.deepEqual(
    taste.candidateHypothesis.metadata?.sourceSpan,
    {
      positionStart: taste.positionStart,
      positionEnd: taste.positionEnd,
    },
  );
  assert.equal(taste.categoryResolution.status, "resolved");
  assert.equal(taste.microSkillResolution.status, "resolved");
  assert.equal(taste.candidateHypothesis.suggestedMicroSkillKey, "D4_PG_FINAL_E_DROP");
  assert.equal(taste.templateResolution?.status, "resolved");
  assert.equal(taste.complexityResolution?.status, "resolved");
  assert.equal(taste.similarPracticeResolution?.status, "resolved");
}

function testAmbiguousAndUnresolvedMappingStayExplicit() {
  const result = analyzeStage3aAuthenticSubmissionSpelling({
    taskSubmission: {
      id: "submission-2",
      childId: "child-2",
      submissionText: "",
    },
    writingSample: {
      id: "sample-2",
      taskSubmissionId: "submission-2",
      sampleText: "I tast cake and plai outside becuase it is sunny.",
    },
    catalogEntries: [
      buildCatalogEntry(),
      buildCatalogEntry({
        microSkillKey: "D4_PG_LONG_AI_FINAL_AY",
        skillClusterKey: "D4_PG_LONG_AI",
        displayName: "Long /a/ final ay",
        metadata: {
          starter_word_bank: [{ word: "play", difficulty: "easy" }],
          example_words: ["day"],
        },
      }),
      buildCatalogEntry({
        microSkillKey: "D4_PG_LONG_AI_AI_AY_CONTRAST",
        skillClusterKey: "D4_PG_LONG_AI",
        displayName: "Long /a/ ai/ay contrast",
        metadata: {
          starter_word_bank: [{ word: "play", difficulty: "easy" }],
          example_words: ["rain"],
        },
      }),
    ],
  });

  const play = result.hypotheses.find(
    (hypothesis) => hypothesis.suggestedReplacement === "play",
  );
  assert.ok(play);
  assert.equal(play.microSkillResolution.status, "ambiguous");
  assert.equal(play.candidateHypothesis.suggestedMicroSkillKey, null);
  assert.equal(play.templateResolution, null);
  assert.equal(play.complexityResolution, null);
  assert.equal(play.similarPracticeResolution, null);

  const because = result.hypotheses.find(
    (hypothesis) => hypothesis.suggestedReplacement === "because",
  );
  assert.ok(because);
  assert.equal(because.microSkillResolution.status, "unresolved");
  assert.equal(because.microSkillResolution.reason, "unmapped_word");
  assert.equal(because.candidateHypothesis.suggestedMicroSkillKey, null);
  assert.equal(because.templateResolution, null);
  assert.equal(because.complexityResolution, null);
  assert.equal(because.similarPracticeResolution, null);
}

function testResultIsDeterministic() {
  const input = {
    taskSubmission: {
      id: "submission-3",
      childId: "child-3",
      submissionText: "Prompt: ignore this\n\nI tast cake and becuase I can.",
    },
    writingSample: null,
    catalogEntries: [buildCatalogEntry()],
  } satisfies Parameters<typeof analyzeStage3aAuthenticSubmissionSpelling>[0];

  const first = analyzeStage3aAuthenticSubmissionSpelling(input);
  const second = analyzeStage3aAuthenticSubmissionSpelling(input);

  assert.deepEqual(first, second);
  assert.equal(first.normalization.sourceTextOrigin, "task_submission_text");
  assert.ok(first.normalization.analysisText.includes("I tast cake"));
  assert.ok(!first.normalization.analysisText.includes("Prompt: ignore this"));
}

function testNoWritesOrMasteryMutationAreIntroduced() {
  const result = analyzeStage3aAuthenticSubmissionSpelling({
    taskSubmission: {
      id: "submission-4",
      childId: "child-4",
      submissionText: "",
    },
    writingSample: {
      id: "sample-4",
      taskSubmissionId: "submission-4",
      sampleText: "I tast cake.",
    },
    catalogEntries: [buildCatalogEntry()],
  });

  const [hypothesis] = result.hypotheses;
  assert.ok(hypothesis);
  assert.ok(!("verification" in hypothesis.candidateHypothesis));
  assert.ok(!("learningItemId" in hypothesis));
  assert.ok(!("parentVerificationId" in (hypothesis.candidateHypothesis.metadata ?? {})));
}

function main() {
  testAuthenticWritingCandidatesPreserveCanonicalSourceRefs();
  testAmbiguousAndUnresolvedMappingStayExplicit();
  testResultIsDeterministic();
  testNoWritesOrMasteryMutationAreIntroduced();
  console.log("writing-engine-stage3a-authentic-submission-regression: ok");
}

main();
