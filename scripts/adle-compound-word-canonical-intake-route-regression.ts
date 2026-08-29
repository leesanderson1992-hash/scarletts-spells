import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canonicalWordSkillPair,
  resolveCanonicalIntakeReadiness,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";
import {
  compileCompoundWordCanonicalIntakeRouteFacts,
  type CompoundWordReleaseFact,
} from "../lib/adle/canonical-intake/compound-word-release-readiness";
import {
  isCompoundWordIntakeSkill,
  resolveCanonicalIntakeRoute,
} from "../lib/adle/canonical-intake/route-readiness";
import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  getNewAssignmentCurriculumRouteForMicroSkill,
} from "../lib/adle/curriculum-readiness/route-registry";

const CLOSED = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const SEPARATED = "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED";
const CLUSTER = "D4_MOR_COMPOUND_WORDS";
const WORD_ID = "11111111-1111-4111-8111-111111111111";
const RELEASE_ID = "22222222-2222-4222-8222-222222222222";
const STRUCTURE_ID = "33333333-3333-4333-8333-333333333333";
const TEACHING_ID = "44444444-4444-4444-8444-444444444444";
const CLOSURE_ID = "55555555-5555-4555-8555-555555555555";
const HASH = "a".repeat(64);

for (const skill of [CLOSED, SEPARATED]) {
  assert.equal(isCompoundWordIntakeSkill(skill, CLUSTER), true);
  assert.deepEqual(resolveCanonicalIntakeRoute(skill, CLUSTER), {
    routeId: "compound_word_lab",
    routeVersion: "v2",
  });
  const assignmentRoute = getNewAssignmentCurriculumRouteForMicroSkill(skill);
  assert.equal(assignmentRoute?.routeId, "compound_word_lab");
  assert.equal(assignmentRoute?.activationAuthority, "database_route_activation",
    "assignment capability remains independently gated by exact operational activation");
}
assert.equal(isCompoundWordIntakeSkill(CLOSED, "D4_MOR_PREFIXES"), false);
assert.deepEqual(resolveCanonicalIntakeRoute("D4_MOR_PREFIXES_UN", "D4_MOR_PREFIXES"), {
  routeId: "dynamic_prefix_word_lab", routeVersion: "v2",
});
assert(!ADLE_CURRICULUM_ROUTE_REGISTRY.some((entry) => entry.routeId === "closed_compound_word_lab"));

const structure = {
  wholeCanonicalWordId: WORD_ID,
  displayForm: "sunflower",
  microSkillKey: CLOSED,
  assignmentEligible: true,
  components: [
    { ordinal: 1, canonicalWordId: "66666666-6666-4666-8666-666666666666", displaySurface: "sun" },
    { ordinal: 2, canonicalWordId: "77777777-7777-4777-8777-777777777777", displaySurface: "flower" },
  ],
  joins: ["none"],
  dictation: { sentence: "The sunflower grew.", targetStart: 1, targetEndExclusive: 2, exactGovernedAnswer: "sunflower" },
};
const authority = (id: string, authorityType: string, authorityKey: string, semanticProjection: unknown) => ({
  id, authorityType, authorityKey, schemaVersion: 1, semanticFingerprint: HASH, semanticProjection,
});
const dependencies = [
  { authorityType: "compound_structure", authorityId: STRUCTURE_ID, authorityKey: "structure", authoritySchemaVersion: 1, semanticFingerprint: HASH, authority: authority(STRUCTURE_ID, "compound_structure", "structure", { schemaVersion: 1, structures: [structure] }) },
  { authorityType: "teaching_content", authorityId: TEACHING_ID, authorityKey: "teaching", authoritySchemaVersion: 1, semanticFingerprint: HASH, authority: authority(TEACHING_ID, "teaching_content", "teaching", { schemaVersion: 1, microSkillKey: CLOSED }) },
  { authorityType: "teaching_dictionary_closure", authorityId: CLOSURE_ID, authorityKey: "closure", authoritySchemaVersion: 2, semanticFingerprint: HASH, authority: { ...authority(CLOSURE_ID, "teaching_dictionary_closure", "closure", { schemaVersion: 2 }), schemaVersion: 2 } },
];
const release: CompoundWordReleaseFact = {
  releaseManifestId: RELEASE_ID,
  releaseKey: "compound-release",
  releaseManifestSha256: HASH,
  dependencyFingerprint: "b".repeat(64),
  routeId: "compound_word_lab",
  routeVersion: "v2",
  activationRouteKey: "compound_word_lab:v2",
  payloadVersion: 2,
  manifestPayload: { microSkills: [{ microSkillKey: CLOSED }] },
  microSkillKey: CLOSED,
  publishedAt: "2026-08-11T21:57:05.937Z",
  dependencies,
};
const compile = (releaseOverride: CompoundWordReleaseFact = release) => compileCompoundWordCanonicalIntakeRouteFacts({
  releases: [releaseOverride],
  publishedStructures: [{ canonicalWordId: WORD_ID, microSkillKey: CLOSED, assignmentEligible: true, rowStatus: "active", reviewStatus: "approved_for_first_exposure", dependencyAuthorityId: STRUCTURE_ID }],
  closureWords: [{ authorityId: CLOSURE_ID, canonicalWordId: WORD_ID, displayWord: "sunflower", dictationSentence: "The sunflower grew.", dictationTargetStart: 1, dictationTargetEndExclusive: 2, exactGovernedAnswer: "sunflower" }],
});
const compiled = compile();
assert.deepEqual([...compiled.enabledSkills], [CLOSED]);
assert.equal(compiled.readyPairs.has(canonicalWordSkillPair(WORD_ID, CLOSED)), true);
assert.equal(compiled.routeReadiness[0]?.routeActivationId, undefined,
  "environment-neutral intake authority must not fabricate activation");

const facts: CanonicalIntakeReadinessFacts = {
  candidate: { candidateMappingId: "candidate", parentUserId: "parent", childId: "child", misspellingNormalized: "sunflour", correctSpellingNormalized: "sunflower", microSkillKey: CLOSED, candidateStatus: "parent_local_promoted", verifiedOn: "2026-08-12" },
  canonicalMappings: [{ mappingId: "mapping", misspellingNormalized: "sunflour", correctSpellingNormalized: "sunflower", microSkillKey: CLOSED, mappingStatus: "active", resolverVisibilityStatus: "visible", hasVisibilityEnableEvent: true }],
  words: [{ canonicalWordId: WORD_ID, normalisedWord: "sunflower", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: null, ageBand: null }],
  microSkills: [{ microSkillKey: CLOSED, masteryDomainKey: "D4", skillClusterKey: CLUSTER, isActive: true, isAssignable: true }],
  supports: [], contentVersions: [],
  productionEnabledSkillKeys: compiled.enabledSkills,
  routeSpecificReadyWordSkillPairs: compiled.readyPairs,
  routeReadiness: compiled.routeReadiness,
  allowedFrequencyBands: new Set(), allowedAgeBands: new Set(),
};
const ready = resolveCanonicalIntakeReadiness(facts);
assert.equal(ready.status, "eligible");
if (ready.status === "eligible") {
  assert.equal(`${ready.routeId}:${ready.routeVersion}`, "compound_word_lab:v2");
  assert.equal(ready.routeActivationId, undefined);
  assert.equal(ready.curriculumRelease?.releaseManifestId, RELEASE_ID);
}
const noRelease = structuredClone(facts);
noRelease.productionEnabledSkillKeys = new Set();
noRelease.routeSpecificReadyWordSkillPairs = new Set();
noRelease.routeReadiness = [];
assert.equal(resolveCanonicalIntakeReadiness(noRelease).status, "blocked");
assert.equal(compile({ ...release, dependencies: dependencies.slice(0, 2) }).readyPairs.size, 0,
  "missing exact dependency fails closed");
assert.equal(compile({ ...release, activationRouteKey: "wrong" }).readyPairs.size, 0,
  "wrong route release fails closed");
const correctedRelease = {
  ...release,
  releaseManifestId: "88888888-8888-4888-8888-888888888888",
  releaseKey: "compound-release-reading-correction",
  publishedAt: "2026-08-12T12:00:00.000Z",
};
const historicalAndCorrected = compileCompoundWordCanonicalIntakeRouteFacts({
  releases: [release, correctedRelease],
  publishedStructures: [{ canonicalWordId: WORD_ID, microSkillKey: CLOSED, assignmentEligible: true, rowStatus: "active", reviewStatus: "approved_for_first_exposure", dependencyAuthorityId: STRUCTURE_ID }],
  closureWords: [{ authorityId: CLOSURE_ID, canonicalWordId: WORD_ID, displayWord: "sunflower", dictationSentence: "The sunflower grew.", dictationTargetStart: 1, dictationTargetEndExclusive: 2, exactGovernedAnswer: "sunflower" }],
});
assert.equal(historicalAndCorrected.routeReadiness.length, 1, "only the newest immutable release is current for intake");
assert.equal(historicalAndCorrected.routeReadiness[0]?.curriculumRelease?.releaseManifestId, correctedRelease.releaseManifestId);

const migration = readFileSync("supabase/migrations/20260812100000_integrate_compound_word_v2_canonical_intake.sql", "utf8");
for (const token of [
  "adle_micro_skill_owns_compound_word_lab_v2",
  "adle_compound_word_release_is_intake_ready_v2",
  "Compound Word candidate must request compound_word_lab:v2",
  "route_activation_revision_id is null",
  "curriculum_release_manifest_id is not null",
]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const forbidden of ["insert into public.daily_assignments", "insert into public.assignment_items", "adle_route_activation_heads(", "adle_route_activation_revisions("])
  assert.equal(migration.toLowerCase().includes(forbidden), false, `migration must not contain ${forbidden}`);

console.log("Compound Word v2 canonical-intake route regression passed.");
