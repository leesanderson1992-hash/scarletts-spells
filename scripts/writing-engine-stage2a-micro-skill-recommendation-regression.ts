import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  recommendStage2aMicroSkillForSpellingPair,
  type WritingEngineStage2aRecommendationInput,
} from "../lib/writing-engine/spelling/stage2a-micro-skill-recommendation";
import type { WritingEngineStage1d1CatalogEntry } from "../lib/writing-engine/types";

function catalogEntry(
  microSkillKey: string,
  displayName: string,
  metadata: Record<string, unknown> = {},
  options: Partial<WritingEngineStage1d1CatalogEntry> = {},
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey,
    masteryDomainKey: options.masteryDomainKey ?? "D4",
    skillFamilyKey: options.skillFamilyKey ?? "spelling-patterns",
    skillClusterKey: options.skillClusterKey ?? "spelling-patterns.core",
    practiceRoute: options.practiceRoute ?? "word_practice",
    isAssignable: options.isAssignable ?? true,
    isActive: options.isActive ?? true,
    displayName,
    allowedTemplateKeys: options.allowedTemplateKeys ?? [],
    metadata: {
      recommendation_features: metadata.recommendation_features ?? [],
      ...metadata,
    },
  };
}

const finalE = catalogEntry("d4.final_e_missing", "Missing final e", {
  recommendation_features: ["missing_final_e", "final e", "magic e"],
});
const consonantDoubling = catalogEntry(
  "d4.final_consonant_doubling",
  "Final consonant doubling",
  {
    recommendation_features: ["final_consonant_doubling", "double consonant"],
  },
);
const businessPattern = catalogEntry("d4.business_irregular", "Business spelling pattern", {
  recommendation_features: ["schwa", "unstressed vowel"],
});
const naturalPattern = catalogEntry("d4.natural_schwa", "Natural schwa spelling", {
  recommendation_features: ["schwa", "unstressed vowel"],
});
const vowelChoice = catalogEntry("d4.vowel_choice", "Vowel substitution", {
  recommendation_features: ["vowel_substitution", "vowel choice"],
});
const baseCatalog = [finalE, consonantDoubling, businessPattern, naturalPattern, vowelChoice];

function recommend(input: Partial<WritingEngineStage2aRecommendationInput>) {
  return recommendStage2aMicroSkillForSpellingPair({
    misspelling: input.misspelling ?? "hav",
    correction: input.correction ?? "have",
    catalogEntries: input.catalogEntries ?? baseCatalog,
    canonicalMappings: input.canonicalMappings,
    parentLocalPromotedMappings: input.parentLocalPromotedMappings,
    historicalReviewedEvidence: input.historicalReviewedEvidence,
    auditFrequencySignals: input.auditFrequencySignals,
    wordMapMetadataSignals: input.wordMapMetadataSignals,
    contextText: input.contextText,
    parentUserId: input.parentUserId,
    childId: input.childId,
    taskSubmissionId: input.taskSubmissionId,
    writingSampleId: input.writingSampleId,
  });
}

{
  const result = recommend({
    misspelling: "buisness",
    correction: "business",
    canonicalMappings: [{
      mappingId: "canonical-business",
      misspellingNormalized: "buisness",
      correctSpellingNormalized: "business",
      microSkillKey: businessPattern.microSkillKey,
      mappingStatus: "active",
    }],
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendedMicroSkillKey, businessPattern.microSkillKey);
  assert.equal(result.recommendedFamilyKey, businessPattern.skillFamilyKey);
  assert.equal(result.recommendedClusterKey, businessPattern.skillClusterKey);
  assert.equal(result.isPrefillAllowed, true);
  assert.equal(result.sourceSignals[0]?.type, "exact_active_canonical_mapping");
}

{
  const result = recommend({
    misspelling: "natrual",
    correction: "natural",
    canonicalMappings: [{
      mappingId: "canonical-natural",
      misspellingNormalized: "natrual",
      correctSpellingNormalized: "natural",
      microSkillKey: naturalPattern.microSkillKey,
      mappingStatus: "active",
    }],
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendedMicroSkillKey, naturalPattern.microSkillKey);
  assert.equal(result.confidence, "high");
}

{
  const result = recommend({
    parentUserId: "parent-1",
    childId: "child-1",
    parentLocalPromotedMappings: [{
      mappingId: "parent-local-like",
      parentUserId: "parent-1",
      childId: "child-1",
      misspellingNormalized: "lik",
      correctSpellingNormalized: "like",
      microSkillKey: finalE.microSkillKey,
      candidateStatus: "parent_local_promoted",
      promotionScope: "parent_local",
    }],
    misspelling: "lik",
    correction: "like",
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendedMicroSkillKey, finalE.microSkillKey);
  assert.equal(result.sourceSignals[0]?.type, "same_scope_parent_local_promoted_mapping");
}

{
  const result = recommend({
    misspelling: "hav",
    correction: "have",
    catalogEntries: [finalE],
  });

  assert.equal(result.recommendationStatus, "low_confidence");
  assert.equal(result.rankedMicroSkillCandidates[0]?.microSkillKey, finalE.microSkillKey);
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "gras",
    correction: "grass",
    catalogEntries: [consonantDoubling],
  });

  assert.equal(result.recommendationStatus, "low_confidence");
  assert.equal(result.rankedMicroSkillCandidates[0]?.microSkillKey, consonantDoubling.microSkillKey);
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "dierbeties",
    correction: "diabetes",
    catalogEntries: [
      catalogEntry("d4.unrelated", "Unrelated active skill", {
        recommendation_features: ["prefix_issue"],
      }),
    ],
  });

  assert.equal(result.recommendationStatus, "word_level_only_candidate");
  assert.equal(result.fallbackReason, "word_level_only");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const alternateFinalE = catalogEntry("d4.final_e_alternate", "Magic e alternate", {
    recommendation_features: ["missing_final_e", "final e"],
  });
  const result = recommend({
    misspelling: "lik",
    correction: "like",
    catalogEntries: [finalE, alternateFinalE],
  });

  assert.equal(result.recommendationStatus, "conflict");
  assert.equal(result.fallbackReason, "conflicting_candidates");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "zxp",
    correction: "zop",
    catalogEntries: [finalE],
  });

  assert.equal(result.recommendationStatus, "insufficient_evidence");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const inactiveSkill = catalogEntry(
    "d4.inactive.canonical",
    "Inactive canonical target",
    {},
    { isActive: false },
  );
  const result = recommend({
    misspelling: "xzy",
    correction: "xyz",
    catalogEntries: [inactiveSkill, finalE],
    canonicalMappings: [{
      mappingId: "inactive-canonical",
      misspellingNormalized: "xzy",
      correctSpellingNormalized: "xyz",
      microSkillKey: inactiveSkill.microSkillKey,
      mappingStatus: "active",
    }],
  });

  assert.notEqual(result.recommendedMicroSkillKey, inactiveSkill.microSkillKey);
  assert.equal(
    result.rankedMicroSkillCandidates.some(
      (candidate) => candidate.microSkillKey === inactiveSkill.microSkillKey,
    ),
    false,
  );
}

{
  const frequencyOnlySkill = catalogEntry("d4.frequency_only", "Frequency-only signal", {
    recommendation_features: ["prefix_issue"],
  });
  const result = recommend({
    misspelling: "wurd",
    correction: "word",
    catalogEntries: [frequencyOnlySkill],
    auditFrequencySignals: [{
      sourceId: "slice-1-frequency",
      misspellingNormalized: "wurd",
      correctSpellingNormalized: "word",
      microSkillKey: frequencyOnlySkill.microSkillKey,
      evidenceCount: 100,
    }],
  });

  assert.equal(result.recommendationStatus, "insufficient_evidence");
  assert.equal(result.isPrefillAllowed, false);
  assert.equal(result.rankedMicroSkillCandidates[0]?.confidence, "none");
}

{
  const result = recommend({
    misspelling: "world",
    correction: "would",
    historicalReviewedEvidence: [{
      sourceId: "reviewed-not-issue",
      misspellingNormalized: "world",
      correctSpellingNormalized: "would",
      microSkillKey: vowelChoice.microSkillKey,
      finalClassification: "not_an_issue",
      reviewStatus: "finalised",
    }],
  });

  assert.equal(result.recommendationStatus, "likely_false_positive");
  assert.equal(result.fallbackReason, "likely_false_positive");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const helperSource = readFileSync(
    "lib/writing-engine/spelling/stage2a-micro-skill-recommendation.ts",
    "utf8",
  );
  const readModelSource = readFileSync(
    "lib/writing-engine/persistence/stage2a-micro-skill-recommendation.ts",
    "utf8",
  );
  const forbiddenMutationCalls = /\.(insert|update|upsert|delete|rpc)\s*\(/;

  assert.equal(forbiddenMutationCalls.test(helperSource), false);
  assert.equal(forbiddenMutationCalls.test(readModelSource), false);
}

console.log("writing-engine-stage2a-micro-skill-recommendation-regression: ok");
