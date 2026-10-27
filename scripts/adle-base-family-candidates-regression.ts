import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { reviewedMorphologyFamilyCandidates, suggestedBaseWordSkill, virtualFamilyCandidate,
  type FamilyCandidateWord } from "../lib/teaching-dictionary-manager/base-family-candidates";
import { eligibleBaseFamilyCounts, indexedEligibleBaseFamilyCounts, shortlistBaseFamilyPairs, unpairableBaseFamilyBlockers } from "../lib/adle/base-word-family-counts";
import { buildReviewedBaseFamilyProjection } from "../lib/adle/base-word-reviewed-family-release";
import { appendReviewedLexicalFamilies } from "../lib/adle/lexical-base-family-release";
import { baseWordFamilyMemberAuthenticTargetEligible } from "../lib/adle/curriculum-release-activation";
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
assert.equal(suggestedBaseWordSkill([{ kind: "base" }, { kind: "suffix" }]),
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX", "colourful suggests its suffix skill");
assert.equal(suggestedBaseWordSkill([{ type: "base" }, { type: "suffix" }]),
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX", "ingredients keeps its suffix suggestion with older parts");
assert.equal(suggestedBaseWordSkill([{ type: "prefix" }, { type: "base" }]),
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "legacy prefix parts suggest the prefix skill");
assert.equal(suggestedBaseWordSkill([{ kind: "base" }]), skill);
assert.equal(suggestedBaseWordSkill([{ kind: "prefix" }, { kind: "suffix" }]), skill,
  "mixed morphology needs a reviewer choice");
assert.equal(virtualFamilyCandidate(paint)?.proposedKey, "paint_family");
assert.equal(virtualFamilyCandidate({ ...paint, reviewStatus: "draft" }), null);
assert.deepEqual(reviewedMorphologyFamilyCandidates(painter, {
  analysisStatus: "approved", reviewStatus: "approved_for_first_exposure", wordSum: "paint + er → painter",
  parts: [{ kind: "base", sourceText: "paint", surfaceText: "paint" }, { kind: "suffix", sourceText: "er", surfaceText: "er" }],
}, [paint, foreignPaint]).map((candidate) => candidate.baseWordId), [paint.id]);
assert.deepEqual(reviewedMorphologyFamilyCandidates(painter, {
  analysisStatus: "approved", reviewStatus: "approved_for_first_exposure", wordSum: "paint + er → painter",
  parts: [{ type: "base", text: "paint" }, { type: "suffix", text: "er" }],
}, [paint]).map((candidate) => candidate.baseWordId), [paint.id],
"older approved parts still reveal the exact base candidate");
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
const ingredientPairCounts = [
  { baseFamilyKey: "ingredient_noun_base_family", eligibleCount: 2, eligibleWordIds: new Set(["ingredient", "ingredients"]) },
  { baseFamilyKey: "colour_base_family", eligibleCount: 3, eligibleWordIds: new Set(["colour", "colourful", "colours"]) },
];
assert.deepEqual(shortlistBaseFamilyPairs(ingredientPairCounts), []);
assert.match(unpairableBaseFamilyBlockers(ingredientPairCounts, [])[0], /ingredient_noun_base_family has 2 eligible words/);
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
const suffixSkill = "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX";
const ingredient = randomUUID();
const ingredients = randomUUID();
const lexical = { familyKey: "ingredient_noun_base_family", revision: 4,
  baseLemma: "ingredient", baseKind: "free_base" as const, baseWordId: ingredient,
  baseMeaning: "a component of food", semanticFingerprint: hash,
  members: [
    { canonicalWordId: ingredient, wordPartOfSpeech: "noun", relationshipKind: "free_base",
      canonicalMorphologyId: randomUUID(), wordSum: "ingredient → ingredient", morphologyParts: [],
      morphologyJoins: [], morphologyTransformations: [], intendedMeaning: "one component",
      complexityLevel: 2, demonstratesSkill: false, routeContentReviewed: false },
    { canonicalWordId: ingredients, wordPartOfSpeech: "noun", relationshipKind: "regular_inflection",
      canonicalMorphologyId: randomUUID(), wordSum: "ingredient + s → ingredients", morphologyParts: [],
      morphologyJoins: [], morphologyTransformations: [], intendedMeaning: "more than one component",
      complexityLevel: 2, demonstratesSkill: true, routeContentReviewed: true },
  ] };
const lexicalRelease = appendReviewedLexicalFamilies({ parent, microSkillKey: suffixSkill,
  environment: "staging", families: [lexical] });
const ingredientFamily = lexicalRelease.families.find((family) => family.baseFamilyKey === lexical.familyKey);
assert.equal(ingredientFamily?.members.length, 2, "a two-word family is a valid release candidate");
assert.equal(ingredientFamily?.members.find((member) => member.canonicalWordId === ingredient)?.assignmentEligible, true);
assert.equal(baseWordFamilyMemberAuthenticTargetEligible(lexicalRelease,
  ingredientFamily!.members.find((member) => member.canonicalWordId === ingredient)!, suffixSkill), false,
  "the free base supports the lesson without becoming a suffix target");
assert.equal(baseWordFamilyMemberAuthenticTargetEligible(lexicalRelease,
  ingredientFamily!.members.find((member) => member.canonicalWordId === ingredients)!, suffixSkill), true);
assert.equal(appendReviewedLexicalFamilies({ parent, microSkillKey: suffixSkill, environment: "staging",
  families: [{ ...lexical, members: lexical.members.map((member) => ({ ...member,
    routeContentReviewed: false })) }] }).families.length, parent.families.length,
  "dictionary approval and a skill link cannot bypass route-content review");
assert.equal(appendReviewedLexicalFamilies({ parent, microSkillKey: suffixSkill, environment: "staging",
  families: [{ ...lexical, members: lexical.members.map((member) => ({ ...member,
    demonstratesSkill: false })) }] }).families.length, parent.families.length,
  "route content alone cannot bypass relationship approval");
console.log("Base family candidate and release regressions passed");
