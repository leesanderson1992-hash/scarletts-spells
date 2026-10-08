import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTEXT_CALIBRATION_POLICY_SCHEMA_VERSION,
  CONTEXT_DECISION_SCHEMA_VERSION,
  CONTEXT_RESOLVER_CONTRACT_VERSION,
  isContextDecisionContractAdmissible,
  type ContextNotRequiredDecision,
  type ContextualUsageDecision,
} from "../lib/adle/context-resolver/contracts";
import {
  calculateContextRegressionCorpusV1Fingerprint,
  CONTEXT_CALIBRATION_BOUNDARY_SCENARIOS_V1,
  CONTEXT_REGRESSION_CASES_V1,
  CONTEXT_REGRESSION_CORPUS_V1_FINGERPRINT,
} from "../lib/adle/context-resolver/regression-corpus-v1";
import {
  activateContextRegistryV1,
  CONTEXT_REGISTRY_V1,
  CONTEXT_REGISTRY_V1_FINGERPRINT,
  contextRequirementForCanonicalWord,
  type ContextCanonicalAuthorityFact,
  type ContextMicroSkillAuthorityFact,
} from "../lib/adle/context-resolver/registry-v1";
import {
  createContextOccurrenceIdentity,
  normalizeContextObservedSurface,
} from "../lib/adle/context-resolver/occurrence-identity";
import { fingerprintContextValue } from "../lib/adle/context-resolver/fingerprint";
import { parseCsv } from "./teaching-dictionary-release-contract";

const CANONICAL_AUTHORITY_PATH =
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/canonical_words.csv";
const MICRO_SKILL_AUTHORITY_PATH =
  "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json";

const expectedCandidateKeys = CONTEXT_REGISTRY_V1.families.flatMap((family) =>
  family.candidates.map((candidate) => candidate.canonicalWordKey)
);
assert.equal(new Set(expectedCandidateKeys).size, 10, "V1 must govern exactly ten unique canonical words");
assert.equal(CONTEXT_REGISTRY_V1.families.length, 4, "V1 must govern exactly four families");
assert.equal(
  fingerprintContextValue(CONTEXT_REGISTRY_V1),
  CONTEXT_REGISTRY_V1_FINGERPRINT,
  "the governed registry fingerprint must change when its semantic projection changes",
);

const canonicalRows = parseCsv(readFileSync(CANONICAL_AUTHORITY_PATH, "utf8"));
const canonicalFacts: ContextCanonicalAuthorityFact[] = expectedCandidateKeys.map((canonicalWordKey) => {
  const matches = canonicalRows.filter((row) => row.word_key === canonicalWordKey);
  assert.equal(matches.length, 1, `${canonicalWordKey} must have exactly one row in canonical source authority`);
  const row = matches[0];
  assert.equal(row.row_status, "active", `${canonicalWordKey} must be active`);
  assert.equal(row.review_status, "approved_for_first_exposure", `${canonicalWordKey} must be approved`);
  assert.equal(row.dialect_code, "en-GB", `${canonicalWordKey} must be en-GB`);
  return {
    canonicalWordId: `canonical-authority:${canonicalWordKey}`,
    canonicalWordKey,
    normalisedWord: row.normalised_word,
    dialectCode: row.dialect_code,
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    identityStable: true,
  };
});

type Domain4MicroSkillRow = {
  micro_skill_key: string;
  is_active: boolean;
  mastery_domain_key: string;
};
const domain4Rows = JSON.parse(readFileSync(MICRO_SKILL_AUTHORITY_PATH, "utf8")) as Domain4MicroSkillRow[];
const expectedMicroSkillKeys = CONTEXT_REGISTRY_V1.families.map((family) => family.microSkillKey);
const microSkillFacts: ContextMicroSkillAuthorityFact[] = expectedMicroSkillKeys.map((microSkillKey) => {
  const matches = domain4Rows.filter((row) => row.micro_skill_key === microSkillKey);
  assert.equal(matches.length, 1, `${microSkillKey} must have exactly one Domain 4 authority row`);
  assert.equal(matches[0].is_active, true, `${microSkillKey} must be active`);
  assert.equal(matches[0].mastery_domain_key, "D4", `${microSkillKey} must belong to Domain 4`);
  return { microSkillKey, masteryDomainKey: "D4", isActive: true, identityStable: true };
});

const activation = activateContextRegistryV1({ canonicalWords: canonicalFacts, microSkills: microSkillFacts });
assert.equal(activation.active, true, "the exact repository V1 authority bindings must activate");
assert(activation.registry);
assert.equal(activation.registry.families.flatMap((family) => family.candidates).length, 10);

for (const canonical of canonicalFacts) {
  const requirement = contextRequirementForCanonicalWord(activation.registry, canonical.canonicalWordId);
  assert.equal(requirement.requirement, "REQUIRED", `${canonical.canonicalWordKey} must require context`);
  assert(requirement.confusionSetKey);
  assert(requirement.microSkillKey);
}
const requirementOutsideRegistry = contextRequirementForCanonicalWord(
  activation.registry,
  "canonical-authority:ordinary-unambiguous-word",
);
assert.equal(requirementOutsideRegistry.requirement, "NOT_REQUIRED");
const notRequired: ContextNotRequiredDecision = requirementOutsideRegistry;
assert.deepEqual(
  { requirement: notRequired.requirement, confusionSetKey: notRequired.confusionSetKey, confusionSetVersion: notRequired.confusionSetVersion, microSkillKey: notRequired.microSkillKey },
  { requirement: "NOT_REQUIRED", confusionSetKey: null, confusionSetVersion: null, microSkillKey: null },
  "NOT_REQUIRED records registry non-membership only and carries no positive semantic result",
);
assert.equal("result" in notRequired, false, "NOT_REQUIRED must not masquerade as VALID");

function blockerCodes(input: {
  canonicalWords?: readonly ContextCanonicalAuthorityFact[];
  microSkills?: readonly ContextMicroSkillAuthorityFact[];
}): Set<string> {
  const result = activateContextRegistryV1({
    canonicalWords: input.canonicalWords ?? canonicalFacts,
    microSkills: input.microSkills ?? microSkillFacts,
  });
  assert.equal(result.active, false, "invalid authority input must fail closed");
  return new Set(result.blockers.map((entry) => entry.code));
}

assert(blockerCodes({ canonicalWords: canonicalFacts.slice(1) }).has("CANONICAL_CANDIDATE_MISSING"));
assert(blockerCodes({ canonicalWords: [...canonicalFacts, { ...canonicalFacts[0], canonicalWordId: "conflicting-id" }] }).has("CANONICAL_CANDIDATE_AMBIGUOUS"));
assert(blockerCodes({ canonicalWords: [...canonicalFacts, { ...canonicalFacts[0], canonicalWordId: "conflicting-surface-id", canonicalWordKey: "conflicting_word_key" }] }).has("CANONICAL_CANDIDATE_AMBIGUOUS"));
assert(blockerCodes({ canonicalWords: canonicalFacts.map((row, index) => index === 0 ? { ...row, identityStable: false } : row) }).has("CANONICAL_CANDIDATE_IDENTITY_UNSTABLE"));
assert(blockerCodes({ canonicalWords: canonicalFacts.map((row, index) => index === 0 ? { ...row, rowStatus: "superseded" } : row) }).has("CANONICAL_CANDIDATE_INACTIVE_OR_UNAPPROVED"));
assert(blockerCodes({ canonicalWords: canonicalFacts.map((row, index) => index === 0 ? { ...row, normalisedWord: "conflict" } : row) }).has("CANONICAL_CANDIDATE_SURFACE_CONFLICT"));
assert(blockerCodes({ microSkills: microSkillFacts.slice(1) }).has("MICRO_SKILL_MISSING"));
assert(blockerCodes({ microSkills: [...microSkillFacts, { ...microSkillFacts[0] }] }).has("MICRO_SKILL_AMBIGUOUS"));
assert(blockerCodes({ microSkills: microSkillFacts.map((row, index) => index === 0 ? { ...row, isActive: false } : row) }).has("MICRO_SKILL_INACTIVE"));
assert(blockerCodes({ microSkills: microSkillFacts.map((row, index) => index === 0 ? { ...row, identityStable: false } : row) }).has("MICRO_SKILL_IDENTITY_UNSTABLE"));
assert(blockerCodes({ microSkills: microSkillFacts.map((row, index) => index === 0 ? { ...row, masteryDomainKey: "D3" } : row) }).has("MICRO_SKILL_AUTHORITY_CONFLICT"));

assert.equal(
  calculateContextRegressionCorpusV1Fingerprint(),
  CONTEXT_REGRESSION_CORPUS_V1_FINGERPRINT,
  "the governed corpus fingerprint must change when fixtures change",
);
assert.equal(CONTEXT_REGRESSION_CASES_V1.length, 29);
assert.equal(CONTEXT_REGRESSION_CASES_V1.reduce((sum, entry) => sum + entry.occurrences.length, 0), 36);

const boundByKey = new Map(
  activation.registry.families.flatMap((family) => family.candidates).map((candidate) => [candidate.canonicalWordKey, candidate]),
);
const occurrenceIds = new Set<string>();
for (const corpusCase of CONTEXT_REGRESSION_CASES_V1) {
  assert.equal(corpusCase.provenance.sourceClass, corpusCase.source.sourceClass);
  for (const occurrence of corpusCase.occurrences) {
    assert.equal(
      corpusCase.text.slice(occurrence.startOffset, occurrence.endOffset),
      occurrence.observedSurface,
      `${corpusCase.caseId} offsets must select the exact authored surface`,
    );
    const canonicalWord = boundByKey.get(occurrence.canonicalWordKey);
    assert(canonicalWord, `${occurrence.canonicalWordKey} must be a bound V1 candidate`);
    const identity = createContextOccurrenceIdentity({
      learnerId: corpusCase.learnerId,
      source: corpusCase.source,
      canonicalWord,
      observedSurface: occurrence.observedSurface,
      startOffset: occurrence.startOffset,
      endOffset: occurrence.endOffset,
    });
    assert.equal(occurrenceIds.has(identity.occurrenceId), false, "distinct source spans must not collapse");
    occurrenceIds.add(identity.occurrenceId);
  }
}

const firstCase = CONTEXT_REGRESSION_CASES_V1.find((entry) => entry.caseId === "their-possessive")!;
const firstOccurrence = firstCase.occurrences[0];
const firstCanonical = boundByKey.get(firstOccurrence.canonicalWordKey)!;
const occurrenceInput = {
  learnerId: firstCase.learnerId,
  source: firstCase.source,
  canonicalWord: firstCanonical,
  observedSurface: firstOccurrence.observedSurface,
  startOffset: firstOccurrence.startOffset,
  endOffset: firstOccurrence.endOffset,
};
const originalIdentity = createContextOccurrenceIdentity(occurrenceInput);
assert.deepEqual(
  originalIdentity,
  createContextOccurrenceIdentity(occurrenceInput),
  "same-source replay must be byte-stable",
);
assert.notEqual(
  originalIdentity.occurrenceId,
  createContextOccurrenceIdentity({
    ...occurrenceInput,
    source: { ...occurrenceInput.source, sourceFingerprint: "f".repeat(64) },
  }).occurrenceId,
  "changed source fingerprint must produce a new occurrence identity",
);

const repeatedCase = CONTEXT_REGRESSION_CASES_V1.find((entry) => entry.caseId === "missing-punctuation-run-on")!;
const repeatedIdentities = repeatedCase.occurrences.map((occurrence) => createContextOccurrenceIdentity({
  learnerId: repeatedCase.learnerId,
  source: repeatedCase.source,
  canonicalWord: boundByKey.get(occurrence.canonicalWordKey)!,
  observedSurface: occurrence.observedSurface,
  startOffset: occurrence.startOffset,
  endOffset: occurrence.endOffset,
}));
assert.notEqual(repeatedIdentities[0].occurrenceId, repeatedIdentities[1].occurrenceId, "repeated candidate spans remain distinct");
assert.equal(normalizeContextObservedSurface("You’re"), "you're");
assert.equal(normalizeContextObservedSurface("Itʼs"), "it's");
assert.equal(normalizeContextObservedSurface("ＴＷＯ"), "two");

for (const canonicalWordKey of expectedCandidateKeys) {
  assert(
    CONTEXT_REGRESSION_CASES_V1.some((entry) => entry.occurrences.some((occurrence) =>
      occurrence.canonicalWordKey === canonicalWordKey && occurrence.expectedResult === "VALID"
    )),
    `${canonicalWordKey} needs at least one reviewed VALID fixture`,
  );
}
const corpusResults = new Set(CONTEXT_REGRESSION_CASES_V1.flatMap((entry) => entry.occurrences.map((occurrence) => occurrence.expectedResult)));
assert.deepEqual([...corpusResults].sort(), ["INVALID", "UNCERTAIN", "VALID"]);
for (const requiredTag of [
  "missing_punctuation",
  "run_on",
  "line_break",
  "unconventional_capitalization",
  "straight_apostrophe",
  "curly_apostrophe",
  "unrelated_spelling_error",
  "mixed_valid_invalid",
  "copied_target",
  "insufficient_context",
  "unicode_normalization",
  "deterministic_classifier_disagreement",
]) {
  assert(CONTEXT_REGRESSION_CASES_V1.some((entry) => entry.tags.includes(requiredTag)), `corpus tag missing: ${requiredTag}`);
}
assert.deepEqual(
  CONTEXT_CALIBRATION_BOUNDARY_SCENARIOS_V1.map((entry) => entry.position),
  [
    "BELOW_APPROVED_FAMILY_THRESHOLD",
    "AT_APPROVED_FAMILY_THRESHOLD",
    "ABOVE_APPROVED_FAMILY_THRESHOLD",
    "APPROVED_THRESHOLD_WITHOUT_APPROVED_POLICY",
  ],
  "calibration boundaries must be policy-relative rather than fixed CR.1 numbers",
);

const classifierDecision = {
  decisionSchemaVersion: CONTEXT_DECISION_SCHEMA_VERSION,
  decisionId: "synthetic-decision",
  occurrence: originalIdentity,
  provenance: firstCase.provenance,
  confusionSetKey: "THERE_THEIR_THEYRE",
  confusionSetVersion: "ADLE_CONTEXT_CONFUSION_SET_THERE_THEIR_THEYRE_V1",
  result: "VALID",
  expectedAlternative: null,
  method: "CONSTRAINED_CLASSIFIER",
  reasonCodes: ["SYNTHETIC_CONTRACT_PROOF"],
  confidence: { score: 0.5, scale: "CALIBRATED_PROBABILITY" },
  contextFingerprint: "c".repeat(64),
  versions: {
    contractVersion: CONTEXT_RESOLVER_CONTRACT_VERSION,
    registryVersion: activation.registry.registryVersion,
    registryFingerprint: activation.registry.registryFingerprint,
    tokenizerVersion: "synthetic-tokenizer-v1",
    deterministicRuleVersion: null,
    classifierModelVersion: "synthetic-model-v1",
    classifierPromptVersion: "synthetic-prompt-v1",
    classifierCalibrationPolicy: null,
  },
  humanOverride: null,
  supersession: { supersedesDecisionId: null, rootDecisionId: null },
} satisfies ContextualUsageDecision;
assert.equal(isContextDecisionContractAdmissible(classifierDecision), false, "uncalibrated classifier decisions fail closed");
assert.equal(isContextDecisionContractAdmissible({
  ...classifierDecision,
  versions: {
    ...classifierDecision.versions,
    classifierCalibrationPolicy: {
      schemaVersion: CONTEXT_CALIBRATION_POLICY_SCHEMA_VERSION,
      policyKey: "synthetic-family-policy",
      policyVersion: "v1",
      policyFingerprint: "p".repeat(64),
      confusionSetKey: "THERE_THEIR_THEYRE",
      approvalState: "APPROVED",
    },
  },
}), true, "a classifier result requires an approved family-specific policy reference");

type ForbiddenQualificationKey = Extract<
  keyof ContextualUsageDecision,
  "authentic" | "independent" | "goldBarEligible" | "proficiencyEligible" | "retirementEligible"
>;
const contextContractHasNoQualificationKey: ForbiddenQualificationKey extends never ? true : false = true;
assert.equal(contextContractHasNoQualificationKey, true, "context and downstream qualification must remain separate dimensions");

for (const sourcePath of [
  "lib/adle/context-resolver/contracts.ts",
  "lib/adle/context-resolver/registry-v1.ts",
  "lib/adle/context-resolver/occurrence-identity.ts",
]) {
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /0\.98|0\.20|99%|95%/, "CR.1 must not freeze classifier calibration thresholds");
  assert.doesNotMatch(source, /supabase|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/, "CR.1 authority must remain storage-independent and read-only");
}

console.log(
  `PASS: ADLE Context Resolver CR.1 (${CONTEXT_REGISTRY_V1.families.length} families, ` +
  `${expectedCandidateKeys.length} canonical bindings, ${CONTEXT_REGRESSION_CASES_V1.length} cases, ` +
  `${occurrenceIds.size} occurrence fixtures, registry ${CONTEXT_REGISTRY_V1_FINGERPRINT})`,
);
