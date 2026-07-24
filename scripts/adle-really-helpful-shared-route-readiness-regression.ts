/**
 * Pure regression for the approved staging-proof identities. It creates no
 * database rows; the guarded staging runner must still verify reviewed
 * content, catalog state, and human sign-off before any intake is persisted.
 */
import { strict as assert } from "node:assert";

import { resolveCanonicalIntakeReadiness } from "../lib/adle/canonical-intake";
import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";

const CHILD = "shared-route-proof-child";
const PRESERVE = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const IDENTIFY = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const routes = [
  { misspelling: "reelly", word: "really", skill: PRESERVE },
  { misspelling: "realy", word: "really", skill: IDENTIFY },
  { misspelling: "helful", word: "helpful", skill: PRESERVE },
  { misspelling: "halpful", word: "helpful", skill: IDENTIFY },
] as const;

function readiness(route: (typeof routes)[number]) {
  return resolveCanonicalIntakeReadiness({
    candidate: { candidateMappingId: `candidate:${route.misspelling}`, parentUserId: "parent", childId: CHILD, misspellingNormalized: route.misspelling, correctSpellingNormalized: route.word, microSkillKey: route.skill, candidateStatus: "parent_local_promoted", verifiedOn: "2026-07-23" },
    canonicalMappings: [{ mappingId: `mapping:${route.misspelling}`, misspellingNormalized: route.misspelling, correctSpellingNormalized: route.word, microSkillKey: route.skill, mappingStatus: "active", resolverVisibilityStatus: "hidden", hasVisibilityEnableEvent: false }],
    words: [{ canonicalWordId: `word:${route.word}`, normalisedWord: route.word, rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "common", ageBand: "7-8" }],
    microSkills: [{ microSkillKey: route.skill, masteryDomainKey: "D4", isActive: true, isAssignable: true }],
    supports: [{ canonicalWordId: `word:${route.word}`, microSkillKey: route.skill, supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" }],
    contentVersions: [{ microSkillKey: route.skill, versionStatus: "active", isActive: true, finalReadinessReviewStatus: "signed_off", childFriendlyExplanation: "Find the base word before spelling.", ruleExplanation: "Use the reviewed base-word route." }],
    productionEnabledSkillKeys: new Set([route.skill]), routeSpecificReadyWordSkillPairs: new Set([`word:${route.word}\u0000${route.skill}`]),
    allowedFrequencyBands: new Set(["common"]), allowedAgeBands: new Set(["7-8"]),
  });
}

for (const route of routes) {
  const result = readiness(route);
  assert.equal(result.status, "eligible", `${route.misspelling} must retain its exact reviewed route`);
  if (result.status === "eligible") assert.equal(result.microSkillKey, route.skill);
}

const facts = {
  learningItems: routes.map((route, index) => ({ learningItemId: `item:${route.misspelling}`, childId: CHILD, canonicalWordId: `word:${route.word}`, microSkillKey: route.skill, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const, sourceRef: `proof:${route.misspelling}`, sourceAttemptText: route.misspelling, reteachPriority: false, ejectedOn: null, intakeOn: `2026-07-2${index + 1}`, rowStatus: "active" as const })),
  families: [PRESERVE, IDENTIFY].flatMap((skill) => ["real", "help"].map((baseFamilyKey) => ({ baseFamilyKey: `${baseFamilyKey}:${skill}`, microSkillKey: skill, rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const }))),
  members: [PRESERVE, IDENTIFY].flatMap((skill) => [
    { baseFamilyKey: `real:${skill}`, canonicalWordId: "word:really", memberRole: "authentic_target" as const },
    { baseFamilyKey: `real:${skill}`, canonicalWordId: "word:real", memberRole: "base" as const },
    { baseFamilyKey: `real:${skill}`, canonicalWordId: "word:realism", memberRole: "transfer" as const },
    { baseFamilyKey: `help:${skill}`, canonicalWordId: "word:helpful", memberRole: "authentic_target" as const },
    { baseFamilyKey: `help:${skill}`, canonicalWordId: "word:help", memberRole: "base" as const },
    { baseFamilyKey: `help:${skill}`, canonicalWordId: "word:helper", memberRole: "transfer" as const },
  ].map((member) => ({ ...member, assignmentEligible: true, complexityLevel: 2, rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const }))),
};

for (const skill of [PRESERVE, IDENTIFY]) {
  const lesson = selectBaseWordFamilyLesson(CHILD, skill, facts);
  assert.deepEqual(lesson.slots.slice(0, 2).map((slot) => slot.canonicalWordId), ["word:really", "word:helpful"], `${skill} must start with exactly the two authentic targets`);
  assert.equal(lesson.slots.filter((slot) => slot.provenance === "transfer").length, 4, `${skill} must retain four transfers`);
}

console.log("adle-really-helpful-shared-route-readiness-regression: ok");
