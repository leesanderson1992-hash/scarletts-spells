import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canonicalWordSkillPair,
  evaluateCanonicalIntakeReadiness,
  resolveCanonicalIntakeReadiness,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";
import { isBaseWordIntakeSkill, resolveCanonicalIntakeRoute } from "../lib/adle/canonical-intake/route-readiness";
import {
  compileBaseWordCanonicalIntakeRouteFacts,
} from "../lib/adle/canonical-intake/base-word-route-readiness";
import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";
import { getNewAssignmentCurriculumRouteForMicroSkill } from "../lib/adle/curriculum-readiness/route-registry";
import { compileBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";
import { BASE_WORD_FAMILY_PREVIEW_READ_MODEL } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { buildBaseWordFamilyPilotItems } from "../lib/adle/morphology/base-word-family-pilot-plan";
import type { ActivatedBaseWordReleaseAuthority } from "../lib/adle/curriculum-release-activation";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../lib/adle/composable-lesson/contracts";

const SKILLS = ["D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_PRESERVE_BASE"] as const;
const WORD_ID = "word-playing";
const ACTIVATION_ID = "11111111-1111-4111-8111-111111111111";
const RELEASE_ID = "22222222-2222-4222-8222-222222222222";
const AUTHORITY_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);
const CURRICULUM_RELEASE: PersistedCurriculumReleaseAuthorityV2 = {
  activationRevisionId: ACTIVATION_ID,
  releaseManifestId: RELEASE_ID,
  releaseKey: "base-word-release-test-v1",
  releaseManifestSha256: HASH,
  dependencyFingerprint: "b".repeat(64),
};

for (const skill of SKILLS) {
  assert.equal(isBaseWordIntakeSkill(skill), true);
  assert.deepEqual(resolveCanonicalIntakeRoute(skill), { routeId: "base_word_lab", routeVersion: "v2" });
  assert.equal(getNewAssignmentCurriculumRouteForMicroSkill(skill)?.routeId, "base_word_lab");
}
assert.equal(isBaseWordIntakeSkill("D4_MOR_BASE_WORDS_INVENTED"), false);
assert.deepEqual(resolveCanonicalIntakeRoute("D4_MOR_BASE_WORDS_INVENTED"), { routeId: "adle_word_level", routeVersion: "v1" });
assert.deepEqual(resolveCanonicalIntakeRoute("D4_MOR_PREFIXES_UN"), { routeId: "dynamic_prefix_word_lab", routeVersion: "v2" });
assert.deepEqual(resolveCanonicalIntakeRoute("D4_MOR_SUFFIXES_MENT"), { routeId: "dynamic_affix_word_lab", routeVersion: "v3" });
assert.deepEqual(resolveCanonicalIntakeRoute("D4_MOR_SPELLING_OTHER"), { routeId: "adle_word_level", routeVersion: "v1" });

const member = (canonicalWordId: string, memberRole: "base" | "authentic_target" | "transfer" | "optional_transfer_check" = "authentic_target", assignmentEligible = true) => ({
  memberId: `member-${canonicalWordId}`,
  canonicalWordId,
  memberRole,
  assignmentEligible,
  complexityLevel: null,
  wordSum: canonicalWordId,
  morphologyParts: [{ text: canonicalWordId }],
  morphologyJoins: [],
  morphologyTransformations: [],
  transformationNotes: "",
  childFriendlyMeaning: "meaning",
});
const activation: ActivatedBaseWordReleaseAuthority = {
  activationRevisionId: ACTIVATION_ID,
  environmentKey: "production",
  microSkillKey: SKILLS[0],
  releaseManifestId: RELEASE_ID,
  releaseKey: CURRICULUM_RELEASE.releaseKey,
  releaseManifestSha256: HASH,
  dependencyFingerprint: CURRICULUM_RELEASE.dependencyFingerprint,
  familyAuthorityId: AUTHORITY_ID,
  familyAuthorityFingerprint: "c".repeat(64),
  family: { schemaVersion: 1, microSkillKey: SKILLS[0], importBatchId: "batch-current", families: [{
    familyId: "family-play", baseFamilyKey: "PLAY", baseWordId: "word-play", baseMeaning: "play", etymologyRoute: { kind: "base" },
    members: [member(WORD_ID), member("word-play", "base")],
  }] },
  teachingContentAuthorityId: "44444444-4444-4444-8444-444444444444",
  teachingContentAuthorityFingerprint: "d".repeat(64),
  teachingContent: { schemaVersion: 1, microSkillKey: SKILLS[0], contentVersionId: "55555555-5555-4555-8555-555555555555", contentVersion: "base-word-v1", teachingObjective: "objective", childFriendlyExplanation: "explanation", ruleExplanation: "rule", memoryTip: "", commonMisconceptions: "", firstExposureProgression: [], guidedPracticeProgression: [], reviewProofreadingProgression: [], exampleSelectionGuidance: "", contrastPolicyGuidance: "" },
  dictionaryClosureAuthorityId: "66666666-6666-4666-8666-666666666666",
  dictionaryClosureAuthorityFingerprint: "e".repeat(64),
  dictionaryWords: [{ canonicalWordId: WORD_ID, wordKey: "playing_en_gb", normalisedWord: "playing", displayWord: "playing", dialectCode: "en-GB", dictationSentence: "I am playing.", dictationTargetTokenIndex: 2, audioText: "I am playing." }],
};
function compileMembership(memberOverride = member(WORD_ID), activationOverride: ActivatedBaseWordReleaseAuthority = activation) {
  return compileBaseWordCanonicalIntakeRouteFacts({ activations: [{
    ...activationOverride,
    family: { ...activationOverride.family, families: [{ ...activationOverride.family.families[0], members: [memberOverride] }] },
  }] });
}
assert.equal(compileMembership().readyPairs.has(canonicalWordSkillPair(WORD_ID, SKILLS[0])), true);
assert.equal(compileBaseWordCanonicalIntakeRouteFacts({ activations: [{ ...activation, family: { ...activation.family, families: [] } }] }).readyPairs.size, 0, "missing exact membership fails");
assert.equal(compileMembership(member(WORD_ID), { ...activation, family: { ...activation.family, microSkillKey: SKILLS[1] } }).readyPairs.size, 0, "wrong family skill fails");
for (const memberRole of ["base", "transfer", "optional_transfer_check"]) {
  const result = compileMembership(member(`word-${memberRole}`, memberRole as "base" | "transfer" | "optional_transfer_check"));
  assert.equal(result.readyPairs.size, 0, `${memberRole} cannot be an authentic target`);
  assert.equal(result.routeReadiness[0]?.ready, false);
}
assert.equal(compileMembership(member(WORD_ID, "authentic_target", false)).readyPairs.size, 0, "non-assignment-eligible membership fails");
for (const canonicalWordId of ["bed", "foot", "sun"]) {
  const result = compileMembership(member(canonicalWordId, "base"));
  assert.equal(result.readyPairs.size, 0, `${canonicalWordId} remains support-only through its base role`);
}

function facts(skill: string = SKILLS[0]): CanonicalIntakeReadinessFacts {
  return {
    candidate: { candidateMappingId: `candidate-${skill}`, parentUserId: "parent-1", childId: "child-1", misspellingNormalized: "plaing", correctSpellingNormalized: "playing", microSkillKey: skill, candidateStatus: "parent_local_promoted", verifiedOn: "2026-08-09" },
    canonicalMappings: [{ mappingId: `mapping-${skill}`, misspellingNormalized: "plaing", correctSpellingNormalized: "playing", microSkillKey: skill, mappingStatus: "active", resolverVisibilityStatus: "visible", hasVisibilityEnableEvent: true }],
    words: [{ canonicalWordId: WORD_ID, normalisedWord: "playing", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "low", ageBand: "middle_primary" }],
    microSkills: [{ microSkillKey: skill, masteryDomainKey: "D4", isActive: true, isAssignable: true }],
    supports: [], selectorProfiles: [], contentVersions: [],
    productionEnabledSkillKeys: new Set([skill]),
    routeSpecificReadyWordSkillPairs: new Set([canonicalWordSkillPair(WORD_ID, skill)]),
    routeReadiness: [{ canonicalWordId: WORD_ID, microSkillKey: skill, ready: true, blockers: [], routeActivationId: ACTIVATION_ID, curriculumRelease: CURRICULUM_RELEASE }],
    allowedFrequencyBands: new Set(["high"]), allowedAgeBands: new Set(["middle_primary"]),
  };
}

for (const skill of SKILLS) {
  const outcome = resolveCanonicalIntakeReadiness(facts(skill));
  assert.equal(outcome.status, "eligible");
  if (outcome.status === "eligible") {
    assert.equal(`${outcome.routeId}:${outcome.routeVersion}`, "base_word_lab:v2");
    assert.equal(outcome.routeActivationId, ACTIVATION_ID);
  }
}

const selectorOnly = facts();
selectorOnly.routeReadiness = [];
selectorOnly.routeSpecificReadyWordSkillPairs = new Set();
selectorOnly.selectorProfiles = [{ microSkillKey: SKILLS[0], rowStatus: "active", reviewStatus: "approved_for_first_exposure", allowedAgeBands: ["middle_primary"] }];
assert.equal(evaluateCanonicalIntakeReadiness(selectorOnly).status, "blocked");
const supportOnly = facts();
supportOnly.routeReadiness = [];
supportOnly.routeSpecificReadyWordSkillPairs = new Set();
supportOnly.supports = [{ canonicalWordId: WORD_ID, microSkillKey: SKILLS[0], supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure" }];
assert.equal(evaluateCanonicalIntakeReadiness(supportOnly).status, "blocked");

for (const blocker of ["profile_membership_missing", "profile_member_unapproved"] as const) {
  const blocked = facts();
  blocked.routeSpecificReadyWordSkillPairs = new Set();
  blocked.routeReadiness = [{ canonicalWordId: WORD_ID, microSkillKey: SKILLS[0], ready: false, blockers: [blocker], routeActivationId: ACTIVATION_ID, curriculumRelease: CURRICULUM_RELEASE }];
  assert.equal(evaluateCanonicalIntakeReadiness(blocked).status, "blocked");
}
const missingActivation = facts();
missingActivation.routeReadiness = [{ canonicalWordId: WORD_ID, microSkillKey: SKILLS[0], ready: true, blockers: [] }];
assert.equal(evaluateCanonicalIntakeReadiness(missingActivation).status, "blocked");

const loader = readFileSync("lib/adle/loaders/canonical-intake-live.ts", "utf8");
const evaluator = readFileSync("lib/adle/canonical-intake.ts", "utf8");
const membershipCompiler = readFileSync("lib/adle/canonical-intake/base-word-route-readiness.ts", "utf8");
const assignmentLoader = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
const assignmentSelector = readFileSync("lib/adle/base-word-family-selection.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260809150000_integrate_base_word_release_authority.sql", "utf8");
assert.match(loader, /BASE_WORD_ROUTE\.supportedMicroSkillKeys/);
assert.match(loader, /loadEnabledBaseWordReleaseAuthorities/);
assert.match(membershipCompiler, /memberRole === "authentic_target"/);
assert.match(membershipCompiler, /curriculumRelease: persistedReleaseAuthority/);
assert.match(migration, /member->>'memberRole' = 'authentic_target'/);
assert.match(migration, /family_authority\.semantic_projection/);
assert.match(migration, /p_route_activation_id uuid default null/);
assert.match(assignmentLoader, /loadEnabledBaseWordReleaseAuthorities/);
assert.match(assignmentLoader, /releaseAuthority: activation/);
assert.match(assignmentSelector, /member\.memberRole === "authentic_target"/);
assert.doesNotMatch(`${loader}\n${evaluator}\n${membershipCompiler}\n${assignmentLoader}\n${assignmentSelector}\n${migration}`, /(?:^|[^a-z])(bed|foot|sun)(?:[^a-z]|$)/i, "Base Word production eligibility must be role-driven, never a word blacklist");

const approved = { assignmentEligible: true, complexityLevel: 1, rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const };
const selection = selectBaseWordFamilyLesson("child-1", SKILLS[0], {
  learningItems: [
    { learningItemId: "item-playing", childId: "child-1", canonicalWordId: "playing", microSkillKey: SKILLS[0], itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "candidate-playing", sourceAttemptText: "plaing", reteachPriority: false, ejectedOn: null, intakeOn: "2026-08-08", rowStatus: "active" },
    { learningItemId: "item-government", childId: "child-1", canonicalWordId: "government", microSkillKey: SKILLS[0], itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "candidate-government", sourceAttemptText: "goverment", reteachPriority: false, ejectedOn: null, intakeOn: "2026-08-09", rowStatus: "active" },
  ],
  families: [
    { baseFamilyKey: "PLAY", microSkillKey: SKILLS[0], rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
    { baseFamilyKey: "GOVERN", microSkillKey: SKILLS[0], rowStatus: "active", reviewStatus: "approved_for_first_exposure" },
  ],
  members: [
    { baseFamilyKey: "PLAY", canonicalWordId: "playing", memberRole: "authentic_target", ...approved },
    { baseFamilyKey: "PLAY", canonicalWordId: "play", memberRole: "base", ...approved },
    { baseFamilyKey: "PLAY", canonicalWordId: "replay", memberRole: "transfer", ...approved },
    { baseFamilyKey: "GOVERN", canonicalWordId: "government", memberRole: "authentic_target", ...approved },
    { baseFamilyKey: "GOVERN", canonicalWordId: "govern", memberRole: "base", ...approved },
    { baseFamilyKey: "GOVERN", canonicalWordId: "governor", memberRole: "transfer", ...approved },
  ],
});
assert.equal(selection.skipReasons.length, 0);
assert.equal(selection.slots.filter((slot) => slot.provenance === "authentic_target").length, 2);
assert.equal(selection.slots.filter((slot) => slot.provenance === "transfer").length, 4);
const snapshot = compileBaseWordFamilyLessonSnapshot(BASE_WORD_FAMILY_PREVIEW_READ_MODEL);
assert.equal(buildBaseWordFamilyPilotItems({ payload: snapshot, parentUserId: "parent-1", childId: "child-1", planDate: "2026-08-09" }).length, 18);

console.log("adle-base-word-canonical-intake-route-regression: ok");
