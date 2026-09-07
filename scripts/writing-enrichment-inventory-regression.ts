import assert from "node:assert/strict";
import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import type { RawWordSkillRelationshipFact } from "../lib/adle/word-skill-relationships/contracts";
import {
  buildEnrichmentInventory,
  privateEnrichmentOccurrenceSelection,
  publicEnrichmentInventory,
  type InventoryObservation,
} from "../lib/writing-engine/whole-writing/enrichment-inventory";
import {
  buildCoherentReviewBatches,
  generateDeterministicEnrichmentCandidates,
  type DeterministicGenerationKind,
} from "../lib/writing-engine/whole-writing/enrichment-generation";
import { collectEnrichmentPages } from "../lib/writing-engine/whole-writing/enrichment-pagination";

const paginationSource = Array.from({ length: 1001 }, (_, index) => index);
const paginationCalls: Array<[number, number]> = [];
const paginationProof = collectEnrichmentPages(async (offset, endInclusive) => {
  paginationCalls.push([offset, endInclusive]);
  return paginationSource.slice(offset, endInclusive + 1);
}).then((paged) => {
  assert.deepEqual(paged, paginationSource);
  assert.deepEqual(paginationCalls, [[0, 499], [500, 999], [1000, 1499]]);
});

const words = [
  { canonicalWordId: "word-covered", normalisedWord: "covered", state: "active" as const, identityStable: true },
  { canonicalWordId: "word-gap", normalisedWord: "gap", state: "active" as const, identityStable: true },
];
const skills = ["skill-covered", "skill-unapproved", "skill-pending", "skill-zero", "skill-morph", "skill-specialist", "skill-generic", "skill-transform", "skill-confusion", "skill-homophone"]
  .map((microSkillKey) => ({ microSkillKey, state: "active" as const, identityStable: true }));
const fact = (overrides: Partial<RawWordSkillRelationshipFact>): RawWordSkillRelationshipFact => ({
  sourceAuthority: "released_specialist_membership", provenanceId: "specialist-one", sourceAuthorityVersion: "v1",
  canonicalWordId: "word-covered", microSkillKey: "skill-covered", relationshipRole: "demonstrates",
  sourceState: "active", exactPairApproval: "approved", reviewState: "approved", releaseState: "released",
  provenanceMetadata: {}, ...overrides,
});
const authority = readCanonicalWordSkillRelationships({ words, microSkills: skills, facts: [
  fact({}),
  fact({ sourceAuthority: "approved_generic_support", provenanceId: "support-one", canonicalWordId: "word-gap",
    microSkillKey: "skill-unapproved", exactPairApproval: "unapproved", reviewState: "unreviewed", releaseState: "not_applicable" }),
] });

const observations: InventoryObservation[] = [
  { occurrenceId: "o1", submissionId: "s-old", normalizedForm: "covered", dialect: "en-GB", resolutionStatus: "resolved", canonicalWordId: "word-covered", provenance: "learner_response", interpretationRank: 1 },
  { occurrenceId: "o1", submissionId: "s1", normalizedForm: "gap", dialect: "en-GB", resolutionStatus: "resolved", canonicalWordId: "word-gap", provenance: "learner_response", interpretationRank: 2 },
  { occurrenceId: "o2", submissionId: "s2", normalizedForm: "GAP", dialect: "en-GB", resolutionStatus: "resolved", canonicalWordId: "word-gap", provenance: "unknown", interpretationRank: 1 },
  { occurrenceId: "o3", submissionId: "s2", normalizedForm: "Mystery", dialect: "en-GB", resolutionStatus: "unmapped", canonicalWordId: null, provenance: "learner_response", interpretationRank: 1 },
  { occurrenceId: "o4", submissionId: "s3", normalizedForm: "Retired", dialect: "en-GB", resolutionStatus: "inactive", canonicalWordId: null, provenance: "learner_response", interpretationRank: 1 },
  { occurrenceId: "o5", submissionId: "s4", normalizedForm: "Either", dialect: "en-GB", resolutionStatus: "ambiguous", canonicalWordId: null, provenance: "learner_response", interpretationRank: 1 },
  { occurrenceId: "o6", submissionId: "s5", normalizedForm: "Pending", dialect: "en-GB", resolutionStatus: "not_assessed", canonicalWordId: null, provenance: "unknown", interpretationRank: 1 },
];
const inventory = buildEnrichmentInventory({
  corpusScope: "synthetic-redacted-fixture", scannedAt: "2026-09-06T20:00:00.000Z", observations,
  canonicalWords: [
    { id: "word-covered", normalizedForm: "covered", dialect: "en-GB", rowStatus: "active" },
    { id: "word-gap", normalizedForm: "gap", dialect: "en-GB", rowStatus: "active" },
  ],
  microSkills: skills.map((row) => ({ microSkillKey: row.microSkillKey, active: true })), relationshipAuthority: authority,
  mappingSignals: [{ mappingId: "mapping-one", normalizedCorrection: "mystery", dialect: "en-GB", canonicalWordId: null,
    microSkillKey: "skill-unapproved", disposition: "BLOCKED", reason: "CANONICAL_WORD_ID_UNKNOWN" }],
  pendingCandidates: [{ packageId: "package-one", candidateIndex: 0, canonicalWordId: "word-gap", microSkillKey: "skill-pending", reviewStatus: "awaiting_review" }],
  sourcesComplete: true,
});

assert.equal(inventory.entries.filter((row) => row.gapType === "missing_canonical_identity").length, 3);
assert.equal(inventory.entries.filter((row) => row.gapType === "missing_governed_relationship").length, 1);
assert.equal(inventory.entries.filter((row) => row.gapType === "unapproved_relationship").length, 2);
assert.ok(inventory.entries.some((row) => row.gapType === "mapping_authority_gap"));
assert.ok(inventory.entries.some((row) => row.gapType === "curriculum_zero_coverage" && row.microSkillKey === "skill-zero"));
assert.equal(inventory.pilot.length, 1);
assert.equal(inventory.pilot[0].canonicalWordId, "word-gap");
assert.equal(inventory.pilot[0].occurrenceCount, 2, "stale interpretation must not add another occurrence");
assert.equal(inventory.pilot[0].submissionCount, 2);
assert.equal(inventory.aggregate.affectedOccurrenceCount, 5, "overlapping gaps use an occurrence union");
assert.throws(() => buildEnrichmentInventory({ ...{
  corpusScope: "fixture", scannedAt: "now", observations, canonicalWords: [], microSkills: [], relationshipAuthority: authority,
  mappingSignals: [], pendingCandidates: [], sourcesComplete: false,
} }), /SOURCE_INCOMPLETE/);
const publicJson = JSON.stringify(publicEnrichmentInventory(inventory));
assert.doesNotMatch(publicJson, /occurrenceIds|occurrenceId|submissionId|observedText|learnerId|"occurrences"/);
assert.equal(privateEnrichmentOccurrenceSelection(inventory).find((row) => row.gapKey === inventory.pilot[0].gapKey)?.occurrenceIds.length, 2);

const kinds: DeterministicGenerationKind[] = ["reviewed_morphology", "approved_specialist_membership", "existing_generic_support",
  "governed_spelling_transformation", "existing_confusion_mapping", "existing_homophone_relationship"];
const generated = generateDeterministicEnrichmentCandidates({
  observedGapWordIds: new Set(["word-gap"]), activeCanonicalWordIds: new Set(["word-gap"]), activeMicroSkillKeys: new Set(skills.map((row) => row.microSkillKey)),
  governedPairs: new Set(["word-gap\u0000skill-covered"]), pendingPairs: new Set(), history: [],
  sources: kinds.map((sourceKind, index) => ({ sourceKind, sourceId: `${sourceKind}-id`, sourceVersion: "v1", canonicalWordId: "word-gap",
    microSkillKey: skills[4 + index].microSkillKey, relationshipRole: "demonstrates", sourceReference: `governed:${sourceKind}`,
    licenceReference: "existing-approved-source", sourceUseApproved: true })),
});
assert.equal(generated.candidates.length, 6);
assert.deepEqual(generated.candidates.map((row) => row.sourceKind), kinds);
assert.ok(generated.candidates.every((row) => row.method === "deterministic_candidate"));
const blocked = generateDeterministicEnrichmentCandidates({ observedGapWordIds: new Set(["word-gap"]), activeCanonicalWordIds: new Set(["word-gap"]),
  activeMicroSkillKeys: new Set(skills.map((row) => row.microSkillKey)), governedPairs: new Set(), pendingPairs: new Set(),
  history: [{ canonicalWordId: "word-gap", microSkillKey: "skill-morph", outcome: "rejected", sourceFingerprint: generated.candidates[0].sourceFingerprint }],
  sources: [{ ...generated.candidates[0], sourceUseApproved: true }],
});
assert.equal(blocked.candidates.length, 0);
assert.equal(blocked.findings[0].code, "UNCHANGED_REJECTION_OR_WITHDRAWAL");
assert.ok(buildCoherentReviewBatches(Array.from({ length: 26 }, (_, index) => ({ ...generated.candidates[0], canonicalWordId: `word-${index}` }))).every((batch) => batch.candidates.length <= 25));

paginationProof.then(() => console.log(JSON.stringify({ status: "passed", inventoryEntries: inventory.entries.length,
  affectedOccurrences: inventory.aggregate.affectedOccurrenceCount, deterministicMethods: kinds.length,
  publicReportContainsRawWriting: false, paginationRows: paginationSource.length, aiCalls: 0 })));
