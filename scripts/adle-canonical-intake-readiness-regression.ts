import assert from "node:assert/strict";

import {
  canonicalIntakeDemandStableKey,
  canonicalWordSkillPair,
  evaluateCanonicalIntakeReadiness,
  isCanonicalIntakeEnabled,
  type CanonicalIntakeReadinessFacts,
  type IntakeReadinessBlockerCode,
} from "../lib/adle/canonical-intake";
import { resolveCanonicalIntakeRoute } from "../lib/adle/canonical-intake/route-readiness";
import { getCurriculumRouteDefinition } from "../lib/adle/curriculum-readiness/route-registry";

const SKILL = "D4_MOR_PREFIXES_UN";
const WORD_ID = "word-unlocked";

assert.equal(isCanonicalIntakeEnabled("enabled"), true);
assert.equal(isCanonicalIntakeEnabled(" enabled "), true);
assert.equal(isCanonicalIntakeEnabled("Enabled"), false);
assert.equal(isCanonicalIntakeEnabled("disabled"), false);
assert.equal(isCanonicalIntakeEnabled(undefined), false);

function facts(): CanonicalIntakeReadinessFacts {
  return {
    candidate: {
      candidateMappingId: "candidate-urnlocked",
      parentUserId: "parent-1",
      childId: "child-1",
      misspellingNormalized: "urnlocked",
      correctSpellingNormalized: "unlocked",
      microSkillKey: SKILL,
      candidateStatus: "parent_local_promoted",
      verifiedOn: "2026-08-04",
    },
    canonicalMappings: [
      {
        mappingId: "mapping-urnlocked-unlocked",
        misspellingNormalized: "urnlocked",
        correctSpellingNormalized: "unlocked",
        microSkillKey: SKILL,
        mappingStatus: "active",
        resolverVisibilityStatus: "visible",
        hasVisibilityEnableEvent: true,
      },
    ],
    words: [],
    microSkills: [
      {
        microSkillKey: SKILL,
        masteryDomainKey: "D4",
        skillClusterKey: "D4_MOR_PREFIXES",
        isActive: true,
        isAssignable: true,
      },
    ],
    supports: [],
    contentVersions: [],
    productionEnabledSkillKeys: new Set([SKILL]),
    routeSpecificReadyWordSkillPairs: new Set(),
    allowedFrequencyBands: new Set(["high"]),
    allowedAgeBands: new Set(["middle_primary"]),
  };
}

const missingWord = evaluateCanonicalIntakeReadiness(facts());
assert.equal(missingWord.status, "blocked");
if (missingWord.status === "blocked") {
  assert.equal(missingWord.targetIdentityStatus, "established");
  assert.equal(missingWord.candidateState, "pending_content");
  assert.equal(missingWord.canonicalTargetToken, "unlocked");
  assert.equal(missingWord.blockers[0].code, "canonical_word_missing");
  assert.equal(missingWord.blockers[0].demandType, "teaching_content");
  assert.ok(!JSON.stringify(missingWord).includes('"unlock"'));
}

const hidden = facts();
hidden.canonicalMappings = hidden.canonicalMappings.map((mapping) => ({
  ...mapping,
  resolverVisibilityStatus: "hidden",
  hasVisibilityEnableEvent: false,
}));
const hiddenOutcome = evaluateCanonicalIntakeReadiness(hidden);
assert.equal(hiddenOutcome.status, "blocked");
if (hiddenOutcome.status === "blocked") {
  assert.equal(hiddenOutcome.targetIdentityStatus, "unresolved");
  assert.equal(hiddenOutcome.candidateState, "pending_mapping");
  assert.equal(hiddenOutcome.blockers[0].code, "mapping_hidden");
  assert.equal(hiddenOutcome.blockers[0].demandType, "resolver");
}

const missing = facts();
missing.canonicalMappings = [];
const missingMapping = evaluateCanonicalIntakeReadiness(missing);
assert.equal(missingMapping.status, "blocked");
if (missingMapping.status === "blocked") {
  assert.equal(missingMapping.blockers[0].code, "mapping_missing");
  assert.equal(missingMapping.candidateState, "pending_mapping");
}

const contentBlockers: IntakeReadinessBlockerCode[] = [
  "metadata_missing",
  "morphology_missing",
  "meaning_missing",
  "dictation_missing",
  "profile_membership_missing",
  "choice_audit_missing",
  "payload_not_compilable",
];
for (const code of contentBlockers) {
  const partial = facts();
  partial.words = [
    {
      canonicalWordId: WORD_ID,
      normalisedWord: "unlocked",
      rowStatus: "active",
      reviewStatus: "approved_for_first_exposure",
      frequencyBand: "high",
      ageBand: "middle_primary",
    },
  ];
  partial.routeReadiness = [
    {
      canonicalWordId: WORD_ID,
      microSkillKey: SKILL,
      ready: false,
      blockers: [code],
    },
  ];
  const outcome = evaluateCanonicalIntakeReadiness(partial);
  assert.equal(outcome.status, "blocked", `${code} must block`);
  if (outcome.status === "blocked") {
    assert.equal(outcome.candidateState, "pending_content");
    assert.equal(outcome.blockers[0].demandType, "teaching_content");
  }
}

const ready = facts();
ready.words = [
  {
    canonicalWordId: WORD_ID,
    normalisedWord: "unlocked",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "high",
    ageBand: "middle_primary",
  },
];
ready.routeSpecificReadyWordSkillPairs = new Set([
  canonicalWordSkillPair(WORD_ID, SKILL),
]);
const readyOutcome = evaluateCanonicalIntakeReadiness(ready);
assert.equal(readyOutcome.status, "ready");
if (readyOutcome.status === "ready") {
  assert.equal(readyOutcome.canonicalTargetToken, "unlocked");
  assert.equal(readyOutcome.canonicalWordId, WORD_ID);
}

const routeCertifiedPrefixMember = facts();
routeCertifiedPrefixMember.words = [
  {
    canonicalWordId: WORD_ID,
    normalisedWord: "unlocked",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "low",
    ageBand: "middle_primary",
  },
];
routeCertifiedPrefixMember.routeSpecificReadyWordSkillPairs = new Set([
  canonicalWordSkillPair(WORD_ID, SKILL),
]);
routeCertifiedPrefixMember.routeReadiness = [
  {
    canonicalWordId: WORD_ID,
    microSkillKey: SKILL,
    ready: true,
    blockers: [],
  },
];
assert.equal(
  evaluateCanonicalIntakeReadiness(routeCertifiedPrefixMember).status,
  "ready",
  "a complete reviewed Prefix member uses its route-owned assignment eligibility",
);

const uncertifiedOutOfBand = facts();
uncertifiedOutOfBand.words = routeCertifiedPrefixMember.words;
uncertifiedOutOfBand.routeSpecificReadyWordSkillPairs = new Set([
  canonicalWordSkillPair(WORD_ID, SKILL),
]);
const uncertifiedOutcome = evaluateCanonicalIntakeReadiness(
  uncertifiedOutOfBand,
);
assert.equal(uncertifiedOutcome.status, "ready",
  "an advanced verified child word remains eligible when its exact route facts are ready");

const missingBand = facts();
missingBand.words = [{ ...routeCertifiedPrefixMember.words[0], ageBand: null, frequencyBand: null }];
missingBand.routeSpecificReadyWordSkillPairs = new Set([canonicalWordSkillPair(WORD_ID, SKILL)]);
assert.equal(evaluateCanonicalIntakeReadiness(missingBand).status, "ready",
  "missing band metadata does not veto a verified child word with an approved route pair");

const keyBeforeWord = canonicalIntakeDemandStableKey({
  demandType: "teaching_content",
  normalizedTargetToken: "unlocked",
  routeId: "dynamic_prefix_word_lab",
  routeVersion: "v2",
  microSkillKey: SKILL,
});
const keyAfterWord = canonicalIntakeDemandStableKey({
  demandType: "teaching_content",
  normalizedTargetToken: "UNLOCKED",
  routeId: "dynamic_prefix_word_lab",
  routeVersion: "v2",
  microSkillKey: SKILL,
});
assert.equal(keyBeforeWord, keyAfterWord);
assert.equal(keyBeforeWord.length, 64);

const AFFIX_SKILL = "D4_MOR_SUFFIXES_MENT";
const AFFIX_WORD_ID = "word-enjoyment";
const affixFacts = facts();
affixFacts.candidate = {
  ...affixFacts.candidate,
  candidateMappingId: "candidate-enjoymint",
  misspellingNormalized: "enjoymint",
  correctSpellingNormalized: "enjoyment",
  microSkillKey: AFFIX_SKILL,
};
affixFacts.canonicalMappings = [{
  mappingId: "mapping-enjoymint-enjoyment",
  misspellingNormalized: "enjoymint",
  correctSpellingNormalized: "enjoyment",
  microSkillKey: AFFIX_SKILL,
  mappingStatus: "active",
  resolverVisibilityStatus: "visible",
  hasVisibilityEnableEvent: true,
}];
affixFacts.words = [{
  canonicalWordId: AFFIX_WORD_ID,
  normalisedWord: "enjoyment",
  rowStatus: "active",
  reviewStatus: "approved_for_first_exposure",
  frequencyBand: "low",
  ageBand: "middle_primary",
}];
affixFacts.microSkills = [{
  microSkillKey: AFFIX_SKILL,
  masteryDomainKey: "D4",
  skillClusterKey: "D4_MOR_SUFFIXES",
  isActive: true,
  isAssignable: true,
}];
affixFacts.productionEnabledSkillKeys = new Set([AFFIX_SKILL]);
affixFacts.routeSpecificReadyWordSkillPairs = new Set([
  canonicalWordSkillPair(AFFIX_WORD_ID, AFFIX_SKILL),
]);
affixFacts.routeReadiness = [{
  canonicalWordId: AFFIX_WORD_ID,
  microSkillKey: AFFIX_SKILL,
  ready: true,
  blockers: [],
}];
const affixReady = evaluateCanonicalIntakeReadiness(affixFacts);
assert.equal(affixReady.status, "ready");
assert.deepEqual(resolveCanonicalIntakeRoute(AFFIX_SKILL), {
  routeId: "dynamic_affix_word_lab",
  routeVersion: "v3",
});

const affixInBandWords = affixFacts.words.map((word) => ({
  ...word,
  frequencyBand: "high",
}));
const affixWrongMember = {
  ...affixFacts,
  words: affixInBandWords,
  routeSpecificReadyWordSkillPairs: new Set<string>(),
};
const wrongMemberOutcome = evaluateCanonicalIntakeReadiness(affixWrongMember);
assert.equal(wrongMemberOutcome.status, "blocked");
if (wrongMemberOutcome.status === "blocked") {
  assert.equal(wrongMemberOutcome.blockers[0].code, "profile_membership_missing");
}

const affixWrongSkill = {
  ...affixFacts,
  candidate: { ...affixFacts.candidate, microSkillKey: "D4_MOR_SUFFIXES_NESS" },
  canonicalMappings: [{ ...affixFacts.canonicalMappings[0]!, microSkillKey: "D4_MOR_SUFFIXES_NESS" }],
  microSkills: [{ ...affixFacts.microSkills[0]!, microSkillKey: "D4_MOR_SUFFIXES_NESS" }],
  words: affixInBandWords,
  productionEnabledSkillKeys: new Set(["D4_MOR_SUFFIXES_NESS"]),
  routeSpecificReadyWordSkillPairs: new Set<string>(),
};
const wrongSkillOutcome = evaluateCanonicalIntakeReadiness(affixWrongSkill);
assert.equal(wrongSkillOutcome.status, "blocked");
if (wrongSkillOutcome.status === "blocked") {
  assert.equal(wrongSkillOutcome.blockers[0].code, "profile_membership_missing");
}

const affixDisabled = { ...affixFacts, productionEnabledSkillKeys: new Set<string>() };
const disabledOutcome = evaluateCanonicalIntakeReadiness(affixDisabled);
assert.equal(disabledOutcome.status, "blocked");
if (disabledOutcome.status === "blocked") {
  assert.equal(disabledOutcome.blockers[0].code, "profile_not_enabled");
}

const affixInvalidMember = {
  ...affixFacts,
  words: affixInBandWords,
  routeReadiness: [{
    canonicalWordId: AFFIX_WORD_ID,
    microSkillKey: AFFIX_SKILL,
    ready: false,
    blockers: ["payload_not_compilable" as const],
  }],
};
const invalidMemberOutcome = evaluateCanonicalIntakeReadiness(affixInvalidMember);
assert.equal(invalidMemberOutcome.status, "blocked");
if (invalidMemberOutcome.status === "blocked") {
  assert.equal(invalidMemberOutcome.blockers[0].code, "payload_not_compilable");
}

assert.deepEqual(resolveCanonicalIntakeRoute("D4_MOR_SPELLING_OTHER"), {
  routeId: "adle_word_level",
  routeVersion: "v1",
});

for (const [routeId, routeVersion] of [
  ["weak_vowel_word_lab", "v1"], ["homophone_word_lab", "v2"],
  ["ing_endings_word_lab", "v1"], ["comparative_superlative_word_lab", "v1"],
] as const) {
  const skill = getCurriculumRouteDefinition(routeId, routeVersion)?.supportedMicroSkillKeys[0];
  assert.ok(skill);
  assert.deepEqual(resolveCanonicalIntakeRoute(skill), { routeId, routeVersion });
}

const weak = facts();
weak.candidate = { ...weak.candidate, microSkillKey: "D4_SCHWA_FINAL_A_FINAL", correctSpellingNormalized: "camera" };
weak.canonicalMappings = [{ ...weak.canonicalMappings[0]!, microSkillKey: weak.candidate.microSkillKey, correctSpellingNormalized: "camera" }];
weak.microSkills = [{ ...weak.microSkills[0]!, microSkillKey: weak.candidate.microSkillKey, skillClusterKey: null }];
weak.words = [{ canonicalWordId: "camera-id", normalisedWord: "camera", rowStatus: "active",
  reviewStatus: "approved_for_first_exposure", ageBand: "middle_primary", frequencyBand: "high" }];
weak.productionEnabledSkillKeys = new Set([weak.candidate.microSkillKey]);
weak.routeSpecificReadyWordSkillPairs = new Set([canonicalWordSkillPair("camera-id", weak.candidate.microSkillKey)]);
weak.routeReadiness = [{ canonicalWordId: "camera-id", microSkillKey: weak.candidate.microSkillKey,
  ready: true, blockers: [], contentReady: true, memberReady: true, activationReady: true,
  routeActivationId: "activation-id", curriculumRelease: { releaseManifestId: "release-id",
    releaseKey: "weak-vowels", releaseManifestSha256: "a".repeat(64), dependencyFingerprint: "b".repeat(64) } }];
assert.equal(evaluateCanonicalIntakeReadiness(weak).status, "ready", "an exact published weak-vowel member enters intake");
weak.routeReadiness = [{ ...weak.routeReadiness[0]!, ready: false, contentReady: false, blockers: ["payload_not_compilable"] }];
assert.equal(evaluateCanonicalIntakeReadiness(weak).status, "blocked", "publication gaps cannot use generic teaching content");

console.log("adle-canonical-intake-readiness-regression: ok");
