import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { adaptExplicitReviewedAssociations, adaptGenericSupport, adaptResolverMappings, adaptSpecialistMemberships } from "../lib/adle/word-skill-relationships/adapters";
import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import {
  PHASE_B_FIXTURE_SKILLS,
  PHASE_B_FIXTURE_WORDS,
  phaseBFixtureFacts,
  phaseBFixtureSkills,
  phaseBFixtureWords,
} from "../lib/adle/word-skill-relationships/fixtures";

function read(facts = phaseBFixtureFacts) {
  return readCanonicalWordSkillRelationships({ words: phaseBFixtureWords, microSkills: phaseBFixtureSkills, facts });
}

const first = read();
const second = read([...phaseBFixtureFacts].reverse());
assert.deepEqual(first, second, "input ordering must not affect canonical output");
assert.equal(JSON.stringify(first), JSON.stringify(read()), "repeated reads must be byte-identical");

const byPair = new Map(first.relationships.map((relationship) => [`${relationship.canonicalWordId}:${relationship.microSkillKey}`, relationship]));
assert(byPair.has(`${PHASE_B_FIXTURE_WORDS.careful}:${PHASE_B_FIXTURE_SKILLS.preserveBase}`), "careful approved generic exact pair admitted");
assert(byPair.has(`${PHASE_B_FIXTURE_WORDS.careful}:${PHASE_B_FIXTURE_SKILLS.suffixFulLess}`), "careful released specialist exact pair admitted independently of unreviewed generic row");
assert(byPair.has(`${PHASE_B_FIXTURE_WORDS.playing}:${PHASE_B_FIXTURE_SKILLS.preserveBase}`), "playing resolver-derived preserve-base pair admitted");
assert(byPair.has(`${PHASE_B_FIXTURE_WORDS.playing}:${PHASE_B_FIXTURE_SKILLS.identifyBase}`), "playing resolver-derived identify-base pair admitted");
assert(!byPair.has(`${PHASE_B_FIXTURE_WORDS.dishonest}:${PHASE_B_FIXTURE_SKILLS.silentH}`), "dishonest wrong exact skill pair fails closed");
assert(byPair.has(`${PHASE_B_FIXTURE_WORDS.hopeful}:${PHASE_B_FIXTURE_SKILLS.suffixFulLess}`), "hopeful specialist-only pair admitted without generic support");

const dishonest = byPair.get(`${PHASE_B_FIXTURE_WORDS.dishonest}:${PHASE_B_FIXTURE_SKILLS.disMis}`)!;
assert.equal(dishonest.sourceProvenance.length, 2, "same pair retains both resolver and specialist provenance");
assert.deepEqual(dishonest.sourceProvenance.map((entry) => entry.sourceAuthority), ["approved_resolver_mapping", "released_specialist_membership"]);
assert.equal(dishonest.sourceProvenance.find((entry) => entry.sourceAuthority === "released_specialist_membership")?.occurrenceCount, 2, "duplicate provenance multiplicity is preserved without duplicating the pair");

const hopeful = byPair.get(`${PHASE_B_FIXTURE_WORDS.hopeful}:${PHASE_B_FIXTURE_SKILLS.suffixFulLess}`)!;
assert.deepEqual(hopeful.sourceProvenance.map((entry) => entry.sourceAuthority), ["released_specialist_membership"], "specialist authority does not require generic duplication");
const playing = byPair.get(`${PHASE_B_FIXTURE_WORDS.playing}:${PHASE_B_FIXTURE_SKILLS.identifyBase}`)!;
assert.deepEqual(playing.sourceProvenance.map((entry) => entry.sourceAuthority), ["approved_resolver_mapping"], "resolver authority does not require generic duplication");

const reasons = new Set(first.decisions.filter((entry) => entry.disposition !== "ADMITTED").map((entry) => entry.reason));
for (const reason of [
  "CONTRAST_ONLY",
  "DIAGNOSTIC_ONLY",
  "NEGATIVE_ONLY",
  "CANONICAL_WORD_ID_UNKNOWN",
  "MICRO_SKILL_INACTIVE",
  "MICRO_SKILL_KEY_UNKNOWN",
  "EXACT_PAIR_NOT_APPROVED",
  "SPECIALIST_CONTENT_UNRELEASED",
  "CONFLICTING_PROVENANCE_METADATA",
] as const) assert(reasons.has(reason), `${reason} must be represented deterministically`);
assert(!first.relationships.some((relationship) => relationship.canonicalWordId === PHASE_B_FIXTURE_WORDS.conflict), "conflicting provenance blocks the ambiguous pair");

assert.deepEqual(first.relationships.map((relationship) => `${relationship.canonicalWordId}:${relationship.microSkillKey}`), [...first.relationships.map((relationship) => `${relationship.canonicalWordId}:${relationship.microSkillKey}`)].sort(), "relationships use deterministic pair ordering");
for (const relationship of first.relationships) {
  const ordered = relationship.sourceProvenance.map((entry) => `${entry.sourceAuthority}:${entry.provenanceId}:${entry.sourceAuthorityVersion}`);
  assert.deepEqual(ordered, [...ordered].sort(), "provenance uses deterministic ordering");
}

assert.equal(first.reconciliation.noSchemaSufficient, true);
assert.equal(first.reconciliation.multiProvenancePairCount, 2);
assert.equal(first.reconciliation.specialistOnlyPairCount, 2);
assert.equal(first.reconciliation.resolverOnlyPairCount, 2);
assert.equal(first.reconciliation.explicitReviewedPairCount, 1);
assert.equal(first.reconciliation.contrastOnlyExclusionCount, 1);
assert.equal(first.reconciliation.inactiveSkillExclusionCount, 1);
assert.equal(first.reconciliation.ambiguousRelationshipCount, 1);
assert(first.reconciliation.admittedProvenanceOccurrenceCount > first.reconciliation.admittedProvenanceCount, "duplicate occurrence count remains auditable");

const adapterFacts = [
  ...adaptResolverMappings([{ id: "resolver", canonicalWordId: PHASE_B_FIXTURE_WORDS.playing, microSkillKey: PHASE_B_FIXTURE_SKILLS.identifyBase, misspellingNormalized: "plaing", correctSpellingNormalized: "playing", mappingStatus: "active", resolverVisibilityStatus: "visible", normalizationVersion: "spelling_normalize_v1", visibilityEnableEventIds: ["event-1"] }]),
  ...adaptGenericSupport([{ id: "support", canonicalWordId: PHASE_B_FIXTURE_WORDS.careful, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, supportRole: "support_example", rowStatus: "active", reviewStatus: "approved_for_first_exposure", importBatchId: "batch", importBatchStatus: "applied", sourceRowHash: "hash", sourceCommit: "commit", sourceFolderSha256: null }]),
  ...adaptSpecialistMemberships([{ sourceKind: "profile_membership", provenanceId: "member", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: PHASE_B_FIXTURE_SKILLS.suffixFulLess, rowStatus: "active", reviewStatus: "approved_for_first_exposure", exactPairApproved: true, releaseState: "released", authorityVersion: "release-v1", memberRole: "transfer" }]),
  ...adaptExplicitReviewedAssociations([{ associationId: "association", canonicalWordId: PHASE_B_FIXTURE_WORDS.hopeful, microSkillKey: PHASE_B_FIXTURE_SKILLS.preserveBase, relationshipRole: "demonstrates", rowStatus: "active", reviewStatus: "approved", authorityVersion: "association-v1", exactPairApproved: true }]),
];
const adapted = read(adapterFacts);
assert.equal(adapted.relationships.length, 4, "all governed adapter shapes admit exact approved pairs");
assert.equal(adapted.decisions.every((entry) => entry.disposition === "ADMITTED"), true);

const repositorySource = readFileSync(new URL("../lib/adle/word-skill-relationships/repository.ts", import.meta.url), "utf8");
assert.match(repositorySource, /^import "server-only";/, "the live authority must remain server-only");
assert.doesNotMatch(repositorySource, /\.(?:insert|update|upsert|delete)\s*\(/, "the live authority must remain read-only");

console.log("ADLE canonical word-skill relationship regression passed.");
