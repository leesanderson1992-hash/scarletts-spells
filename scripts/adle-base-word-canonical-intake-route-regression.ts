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
  type BaseWordIntakeFamilyRow,
  type BaseWordIntakeMemberRow,
} from "../lib/adle/canonical-intake/base-word-route-readiness";
import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";
import { getNewAssignmentCurriculumRouteForMicroSkill } from "../lib/adle/curriculum-readiness/route-registry";
import { compileBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";
import { BASE_WORD_FAMILY_PREVIEW_READ_MODEL } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { buildBaseWordFamilyPilotItems } from "../lib/adle/morphology/base-word-family-pilot-plan";
import type { AdleLessonRouteActivation } from "../lib/adle/loaders/lesson-route-activations";

const SKILLS = ["D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_PRESERVE_BASE"] as const;
const WORD_ID = "word-playing";
const ACTIVATION_ID = "activation-base-word-production";

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

const activation: AdleLessonRouteActivation = {
  activationId: ACTIVATION_ID,
  microSkillKey: SKILLS[0],
  lessonRouteKey: "base_word_family_v1",
  payloadVersion: 1,
  activationStatus: "production_enabled",
  contentVersion: "base-word-v1",
  importBatchId: "batch-current",
  readinessReport: { approved: true },
};
const family: BaseWordIntakeFamilyRow = { id: "family-play", microSkillKey: SKILLS[0], importBatchId: "batch-current", rowStatus: "active", reviewStatus: "approved_for_first_exposure" };
const authenticMember: BaseWordIntakeMemberRow = { baseWordFamilyId: family.id, canonicalWordId: WORD_ID, importBatchId: "batch-current", memberRole: "authentic_target", assignmentEligible: true, rowStatus: "active", reviewStatus: "approved_for_first_exposure" };
function compileMembership(
  member = authenticMember,
  familyRow = family,
  activationRow = activation,
) {
  return compileBaseWordCanonicalIntakeRouteFacts({
    activations: [activationRow],
    families: [familyRow],
    members: [member],
  });
}
assert.equal(compileMembership().readyPairs.has(canonicalWordSkillPair(WORD_ID, SKILLS[0])), true);
assert.equal(compileBaseWordCanonicalIntakeRouteFacts({ activations: [activation], families: [family], members: [] }).readyPairs.size, 0, "missing exact membership fails");
assert.equal(compileMembership({ ...authenticMember, importBatchId: "batch-old" }).readyPairs.size, 0, "wrong member batch fails");
assert.equal(compileMembership(authenticMember, { ...family, importBatchId: "batch-old" }).readyPairs.size, 0, "wrong family batch fails");
assert.equal(compileMembership(authenticMember, { ...family, microSkillKey: SKILLS[1] }).readyPairs.size, 0, "wrong family skill fails");
assert.equal(compileMembership(authenticMember, { ...family, rowStatus: "draft" }).readyPairs.size, 0, "inactive family fails");
assert.equal(compileMembership(authenticMember, { ...family, reviewStatus: "in_review" }).readyPairs.size, 0, "unapproved family fails");
assert.equal(compileMembership(authenticMember, family, { ...activation, activationStatus: "paused" }).readyPairs.size, 0, "paused activation fails");
assert.equal(compileMembership(authenticMember, family, { ...activation, payloadVersion: 2 }).readyPairs.size, 0, "wrong payload version fails");
for (const memberRole of ["base", "transfer", "optional_transfer_check"]) {
  const result = compileMembership({ ...authenticMember, canonicalWordId: `word-${memberRole}`, memberRole });
  assert.equal(result.readyPairs.size, 0, `${memberRole} cannot be an authentic target`);
  assert.equal(result.routeReadiness[0]?.ready, false);
}
for (const member of [
  { ...authenticMember, rowStatus: "draft" },
  { ...authenticMember, reviewStatus: "in_review" },
  { ...authenticMember, assignmentEligible: false },
]) {
  assert.equal(compileMembership(member).readyPairs.size, 0, "inactive, unapproved, or ineligible membership fails");
}
for (const canonicalWordId of ["bed", "foot", "sun"]) {
  const result = compileMembership({ ...authenticMember, canonicalWordId, memberRole: "base" });
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
    routeReadiness: [{ canonicalWordId: WORD_ID, microSkillKey: skill, ready: true, blockers: [], routeActivationId: ACTIVATION_ID }],
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
  blocked.routeReadiness = [{ canonicalWordId: WORD_ID, microSkillKey: SKILLS[0], ready: false, blockers: [blocker], routeActivationId: ACTIVATION_ID }];
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
const migration = readFileSync("supabase/migrations/20260809120000_guard_base_word_canonical_intake_persistence.sql", "utf8");
assert.match(loader, /BASE_WORD_ROUTE\.supportedMicroSkillKeys/);
assert.match(loader, /\.in\("import_batch_id", importBatchIds\)/);
assert.match(membershipCompiler, /memberRole === "authentic_target"/);
assert.match(membershipCompiler, /routeActivationId: owner\.activation\.activationId/);
assert.match(migration, /member\.member_role = 'authentic_target'/);
assert.match(migration, /member\.import_batch_id = manifest\.import_batch_id/);
assert.match(migration, /p_route_activation_id uuid default null/);
assert.match(assignmentLoader, /\.eq\("import_batch_id", activation\.importBatchId\)/);
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
