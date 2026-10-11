import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { reviewedMorphologyFamilyCandidates, virtualFamilyCandidate,
  type FamilyCandidateWord } from "../lib/teaching-dictionary-manager/base-family-candidates";
import { eligibleBaseFamilyCounts, indexedEligibleBaseFamilyCounts, shortlistBaseFamilyPairs } from "../lib/adle/base-word-family-counts";
import { buildReviewedBaseFamilyProjection } from "../lib/adle/base-word-reviewed-family-release";
import type { ActivatedBaseWordReleaseAuthority, BaseWordFamilyAuthorityProjectionV2, BaseWordFamilyAuthorityMemberV2 } from
  "../lib/adle/curriculum-release-activation";

const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const approved = (displayWord: string, dialectCode = "en-GB"): FamilyCandidateWord => ({
  id: randomUUID(), normalisedWord: displayWord.toLowerCase(), displayWord,
  dialectCode, rowStatus: "active", reviewStatus: "approved_for_first_exposure",
});
const paint = approved("paint");
const painter = approved("painter");
const foreignPaint = approved("paint", "en-US");
assert.equal(virtualFamilyCandidate(paint)?.proposedKey, "paint_family");
assert.equal(virtualFamilyCandidate({ ...paint, reviewStatus: "draft" }), null);
assert.deepEqual(reviewedMorphologyFamilyCandidates(painter, {
  analysisStatus: "approved", reviewStatus: "approved_for_first_exposure", wordSum: "paint + er → painter",
  parts: [{ kind: "base", sourceText: "paint", surfaceText: "paint" }, { kind: "suffix", sourceText: "er", surfaceText: "er" }],
}, [paint, foreignPaint]).map((candidate) => candidate.baseWordId), [paint.id]);
assert.deepEqual(reviewedMorphologyFamilyCandidates(painter, {
  analysisStatus: "in_review", reviewStatus: "approved_for_first_exposure", wordSum: "paint + er",
  parts: [{ kind: "base", sourceText: "paint" }],
}, [paint]), []);
assert.deepEqual(reviewedMorphologyFamilyCandidates(approved("counterpaint"), {
  analysisStatus: "approved", reviewStatus: "approved_for_first_exposure", wordSum: "",
  parts: [{ kind: "root", sourceText: "paint" }],
}, [paint]), [], "roots and spelling substrings are not automatic base links");

const hash = "a".repeat(64);
const member = (id: string, role: "base" | "family_member"): BaseWordFamilyAuthorityMemberV2 => ({
  memberId: randomUUID(), canonicalWordId: id, structuralRole: role,
  applicableMicroSkillKeys: [skill], assignmentEligible: true, complexityLevel: 2,
  wordSum: id, morphologyParts: [{ kind: "base", sourceText: id }],
  morphologyJoins: [], morphologyTransformations: [], transformationNotes: "",
  childFriendlyMeaning: id, morphologySource: { sourceKind: "approved_repository_analysis",
    sourceId: `${skill}::${id}`, sourceFingerprint: hash, sourceAuthorityKey: "source" },
});
const ids = Array.from({ length: 7 }, () => randomUUID());
const familyA = randomUUID();
const familyB = randomUUID();
const parent: BaseWordFamilyAuthorityProjectionV2 = {
  schemaVersion: 2, skillClusterKey: "D4_MOR_BASE_WORDS",
  sourceAuthorities: [{ authorityKey: "source", sourceKind: "approved_repository_artifact", sourceId: "source", sourceFingerprint: hash }],
  families: [
    { familyId: familyA, baseFamilyKey: "a_base_family", baseWordId: ids[0], baseMeaning: "a", etymologyRoute: {},
      sourceFingerprint: hash, members: [member(ids[0], "base"), member(ids[1], "family_member")] },
    { familyId: familyB, baseFamilyKey: "b_base_family", baseWordId: ids[2], baseMeaning: "b", etymologyRoute: {},
      sourceFingerprint: hash, members: [member(ids[2], "base"), member(ids[3], "family_member"),
        member(ids[4], "family_member"), member(ids[5], "family_member")] },
  ],
};
const closure = new Set(ids.slice(0, 6));
const counts = eligibleBaseFamilyCounts(parent, skill, closure);
assert.deepEqual(counts.map((entry) => entry.eligibleCount), [2, 4]);
const activation = { releaseManifestId: randomUUID(), microSkillKey: skill,
  familyAuthorityId: randomUUID(), dictionaryClosureAuthorityId: randomUUID(), family: parent,
  dictionaryWords: [...closure].map((canonicalWordId) => ({ canonicalWordId })) } as ActivatedBaseWordReleaseAuthority;
assert.strictEqual(indexedEligibleBaseFamilyCounts(activation), indexedEligibleBaseFamilyCounts(activation),
  "the activated release index reuses its distinct-word counts");
assert.notStrictEqual(indexedEligibleBaseFamilyCounts({ ...activation, releaseManifestId: randomUUID() }),
  indexedEligibleBaseFamilyCounts(activation), "a new immutable release gets a separate count index");
assert.deepEqual(shortlistBaseFamilyPairs(counts), [["a_base_family", "b_base_family"]], "2 + 4 is valid");
assert.deepEqual(shortlistBaseFamilyPairs(counts, 2), [], "x filters the shortlist only");
assert.deepEqual(shortlistBaseFamilyPairs(eligibleBaseFamilyCounts(parent, skill, new Set(ids.slice(0, 4)))), [], "fewer than six distinct words fails");
assert.deepEqual(shortlistBaseFamilyPairs([{ baseFamilyKey: "only", eligibleCount: 6, eligibleWordIds: closure }]), [], "one family is insufficient");
assert.deepEqual(shortlistBaseFamilyPairs([
  { baseFamilyKey: "overlap-a", eligibleCount: 4, eligibleWordIds: new Set(["1", "2", "3", "4"]) },
  { baseFamilyKey: "overlap-b", eligibleCount: 4, eligibleWordIds: new Set(["1", "2", "3", "4"]) },
]), [], "a pair must contain six distinct words, not six memberships");

const reviewedId = randomUUID();
const review = { id: reviewedId, definitionId: null, legacyFamilyId: familyB,
  canonicalWordId: ids[6], baseWordId: ids[2], microSkillKey: skill,
  wordSum: "b + ending", morphologyParts: [{ kind: "base", sourceText: "b" }],
  morphologyJoins: [], morphologyTransformations: [], transformationNotes: "",
  childFriendlyMeaning: "derived b", complexityLevel: 2, sourceFingerprint: hash,
  reviewedAt: "2026-10-11T12:00:00.000Z", withdrawn: false, skillReleaseWithdrawn: false };
const next = buildReviewedBaseFamilyProjection({ parent, microSkillKey: skill, definitions: [], legacyFamilies: [], reviews: [review] });
assert.equal(next.families.find((entry) => entry.familyId === familyB)?.members.length, 5);
assert.equal(parent.families.find((entry) => entry.familyId === familyB)?.members.length, 4, "parent authority stays immutable");
assert.equal(next.families.find((entry) => entry.familyId === familyB)?.members
  .find((entry) => entry.canonicalWordId === ids[6])?.memberId, reviewedId);
const withdrawn = buildReviewedBaseFamilyProjection({ parent, microSkillKey: skill, definitions: [], legacyFamilies: [],
  reviews: [{ ...review, withdrawn: true }] });
assert.equal(withdrawn.families.find((entry) => entry.familyId === familyB)?.members.length, 4);
const skillWithdrawn = buildReviewedBaseFamilyProjection({ parent, microSkillKey: skill, definitions: [], legacyFamilies: [],
  reviews: [{ ...review, skillReleaseWithdrawn: true }] });
assert.equal(skillWithdrawn.families.find((entry) => entry.familyId === familyB)?.members.length, 4);
const withdrawnExisting = buildReviewedBaseFamilyProjection({ parent, microSkillKey: skill, definitions: [], legacyFamilies: [],
  reviews: [{ ...review, canonicalWordId: ids[5], withdrawn: true }] });
assert.equal(withdrawnExisting.families.find((entry) => entry.familyId === familyB)?.members.length, 3);
const newLegacyId = randomUUID();
const newDefinitionId = randomUUID();
const additionalReviews = [
  { ...review, id: randomUUID(), legacyFamilyId: newLegacyId, canonicalWordId: randomUUID(), baseWordId: ids[6] },
  { ...review, id: randomUUID(), legacyFamilyId: newLegacyId, canonicalWordId: ids[6], baseWordId: ids[6] },
  { ...review, id: randomUUID(), legacyFamilyId: null, definitionId: newDefinitionId,
    canonicalWordId: randomUUID(), baseWordId: ids[6] },
  { ...review, id: randomUUID(), legacyFamilyId: null, definitionId: newDefinitionId,
    canonicalWordId: ids[6], baseWordId: ids[6] },
];
const extended = buildReviewedBaseFamilyProjection({ parent, microSkillKey: skill,
  definitions: [{ id: newDefinitionId, familyKey: "new_family", baseWordId: ids[6],
    baseMeaning: "new", etymologyRoute: {}, sourceFingerprint: hash }],
  legacyFamilies: [{ id: newLegacyId, familyKey: "legacy_base_family", baseWordId: ids[6],
    baseMeaning: "legacy", etymologyRoute: {}, sourceFingerprint: hash }], reviews: additionalReviews });
assert.ok(extended.families.some((entry) => entry.familyId === newLegacyId));
assert.ok(extended.families.some((entry) => entry.familyId === newDefinitionId));

const large = Array.from({ length: 500 }, (_, index) => ({
  baseFamilyKey: `family_${index}`, eligibleCount: 2,
  eligibleWordIds: new Set([`base_${index}`, `derived_${index}`]),
}));
assert.equal(shortlistBaseFamilyPairs(large).length, 0);
console.log("Base family candidate and release regressions passed");
