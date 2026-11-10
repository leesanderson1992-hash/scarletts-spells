import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ING_MICRO_SKILLS } from "../lib/adle/ing/contracts";
import { ingPreviewPool } from "../lib/adle/ing/preview-fixture";
import { evaluateLessonCandidate } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { approvedGeneratedIngWord, generateIngWordFromOverview } from "../lib/teaching-dictionary-manager/ing-overview-recipe";
import { previewIngOverviewRelease } from "../lib/teaching-dictionary-manager/ing-overview-release-preview";
import { candidateDecisionIsCurrent } from "../lib/teaching-dictionary-manager/candidate-decision-current";
import { routeBlockers, routeWithSharedFacts, sharedRouteContentKeys, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";

const reading = {
  wordId: "00000000-0000-4000-8000-000000000101",
  displayWord: "reading",
  skillKey: "D4_INF_ING_ENDINGS_REGULAR",
  senseId: "reading-verb",
  senseSet: { pronunciations: [{ id: "reading-ipa", ipa: "/ˈriːdɪŋ/",
    spokenSyllableCount: 2, stressPattern: "primary-unstressed" }],
  senses: [{ id: "reading-verb", partOfSpeech: "verb", definition: "The act of reading.",
    pronunciationId: "reading-ipa", dictationSentence: "She is reading a book.",
    dictationTargetTokenIndex: 2 }] },
  morphology: { analysisStatus: "approved", reviewStatus: "approved_for_first_exposure",
    wordSum: "read + ing → reading", joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
    parts: [{ id: "base", kind: "base", sourceText: "read", surfaceText: "read", gloss: "read text" },
      { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "action in progress" }] },
  familyLinks: [{ sense_id: "reading-verb", family_key: "read_verb_base_family",
    component_part_id: "base", relationship_kind: "regular_inflection" }],
};

assert.equal(evaluateLessonCandidate(reading).status, "ready");
const decision = { action: "approve", sense_id: reading.senseId,
  pronunciation_id: "reading-ipa", rule_revision: "reviewed_overview_candidate_v1",
  fact_snapshot: { senseId: reading.senseId, senseSet: reading.senseSet,
    morphologyId: "reviewed-morphology", familyLinkIds: ["read-family-link"] } };
const currentFacts = { event: decision, senseId: reading.senseId,
  senseSet: reading.senseSet, morphologyId: "reviewed-morphology",
  familyLinkIds: ["read-family-link"] };
assert(candidateDecisionIsCurrent(currentFacts));
assert(candidateDecisionIsCurrent({ ...currentFacts, senseSet: { ...reading.senseSet,
  senses: [...reading.senseSet.senses, { id: "unrelated", partOfSpeech: "noun",
    definition: "Another meaning", pronunciationId: "reading-ipa" }] } }),
"reviewing another meaning does not stale this lesson's approved meaning");
assert(!candidateDecisionIsCurrent({ ...currentFacts, senseSet: { ...reading.senseSet,
  senses: [{ ...reading.senseSet.senses[0], definition: "Changed selected meaning" }] } }));
assert(!candidateDecisionIsCurrent({ ...currentFacts, morphologyId: "new-morphology" }));
assert(!candidateDecisionIsCurrent({ ...currentFacts, familyLinkIds: [] }));
assert(!candidateDecisionIsCurrent({ ...currentFacts, event: { ...decision, action: "withdraw" } }));
const recipe = generateIngWordFromOverview({ ...reading,
  provenance: { sourceName: "Reviewed import", sourceUrl: null } });
assert.equal(recipe.status, "ready");
if (recipe.status === "ready") {
  assert.equal(recipe.word.base, "read");
  assert.equal(recipe.word.meaning, "The act of reading.");
  assert.equal(recipe.word.dictationSentence, "She is reading a book.");
  assert.deepEqual(recipe.word.sourceRefs, ["Reviewed import"]);
  assert.equal(approvedGeneratedIngWord({ generated: recipe.word, reviewerRef: "reviewer",
    approvalRef: "governed-release" })?.word, "reading");
  assert.equal(approvedGeneratedIngWord({ generated: recipe.word, reviewerRef: "reviewer",
    approvalRef: "" }), null);
}
assert.equal(generateIngWordFromOverview({ ...reading,
  provenance: { sourceName: "", sourceUrl: "" } }).status, "needs_facts");
assert.deepEqual(evaluateLessonCandidate({ ...reading, familyLinks: [] }).issues.map(issue => issue.code),
  ["FAMILY_LINK"]);
assert.equal(evaluateLessonCandidate({ ...reading, skillKey: "D4_INF_ING_ENDINGS_DROP_E" }).status,
  "not_match");
const invalidDropE = evaluateLessonCandidate({ ...reading, displayWord: "boing",
  skillKey: "D4_INF_ING_ENDINGS_DROP_E", morphology: { ...reading.morphology,
    wordSum: "box + ing → boing", parts: [
      { id: "base", kind: "base", sourceText: "box", surfaceText: "bo", gloss: "a box" },
      reading.morphology.parts[1]] } });
assert.equal(invalidDropE.status, "not_match", "drop-e requires a base ending in e");
const invalidIe = evaluateLessonCandidate({ ...reading, displayWord: "fying",
  skillKey: "D4_INF_ING_ENDINGS_IE_TO_Y", morphology: { ...reading.morphology,
    wordSum: "foe + ing → fying", parts: [
      { id: "base", kind: "base", sourceText: "foe", surfaceText: "fy", gloss: "an adversary" },
      reading.morphology.parts[1]] } });
assert.equal(invalidIe.status, "not_match", "ie-to-y requires a base ending in ie");
const vegetable = evaluateLessonCandidate({ ...reading, displayWord: "vegetable",
  skillKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  morphology: { ...reading.morphology, wordSum: "veget + able → vegetable",
    parts: [{ id: "root", kind: "root", sourceText: "veget", surfaceText: "veget", gloss: "To grow or live" },
      { id: "suffix", kind: "suffix", sourceText: "able", surfaceText: "able", gloss: "able to be" }] },
  familyLinks: [{ sense_id: "reading-verb", family_key: "veget_bound_root_base_family",
    component_part_id: "root", relationship_kind: "historical_relative" }] });
assert.equal(vegetable.status, "not_match");
const ingRoute = { routeId: "ing_endings_word_lab", routeVersion: "v1",
  microSkillKey: reading.skillKey, wordMeaning: "", wordSum: "", content: {} };
const payload = {
  displayWord: "reading", definition: "Legacy meaning", senseSet: reading.senseSet,
  skillSenseIds: { [reading.skillKey]: reading.senseId },
  dictationSentence: "Legacy sentence.", metadata: { phoneme_hint: "/old/", syllables: "1",
    stress_pattern: "primary" },
  canonicalMorphology: { ...reading.morphology, rawSegmentation: "", rawPartOfSpeech: "verb",
    featureKeys: [], transformationNotes: "", transformations: [], reviewNotes: "" },
  provenance: { sourceCategory: "internal_reviewed_seed", sourceName: "Reviewed import",
    sourceUrl: "", sourceLicence: "internal_authored", sourceUseNote: "", confidence: "high" },
} as unknown as WordDraftPayload;
const generated = routeWithSharedFacts(ingRoute, payload);
assert.equal(generated.wordMeaning, "The act of reading.");
assert.equal(generated.content.base, "read");
assert.deepEqual(generated.content.sourceRefs, ["Reviewed import"]);
assert.deepEqual(sharedRouteContentKeys("ing_endings_word_lab", payload), ["base", "sourceRefs"]);
assert.deepEqual(routeBlockers(ingRoute, payload), []);
const staleRoute = { ...ingRoute, wordMeaning: "Old meaning",
  content: { base: "reed", sourceRefs: ["Old source"] } };
const regenerated = routeWithSharedFacts(staleRoute, payload);
assert.equal(regenerated.wordMeaning, "The act of reading.");
assert.equal(regenerated.content.base, "read");
assert.deepEqual(regenerated.content.sourceRefs, ["Reviewed import"]);
assert.deepEqual(routeBlockers(staleRoute, { ...payload, provenance: { ...payload.provenance,
  sourceName: "", sourceUrl: "" } }), ["Add reviewed Overview provenance for the derived form."]);
const releaseWords = ING_MICRO_SKILLS.flatMap(skill => ingPreviewPool(skill).slice(0, 6)
  .map(word => ({ ...word, canonicalWordId: randomUUID(), rowStatus: "active" as const,
    reviewStatus: "approved_for_first_exposure" as const, reviewerRef: "reviewed",
    approvalRef: `approved:${word.word}` })));
const incompletePool = previewIngOverviewRelease(releaseWords.slice(1), "test:ing");
assert.equal(incompletePool.status, "needs_words");
assert.deepEqual(incompletePool.missing, [{ skill: ING_MICRO_SKILLS[0], count: 1 }]);
const fullPool = previewIngOverviewRelease(releaseWords, "test:ing");
assert.equal(fullPool.status, "ready");
assert(fullPool.package?.packageSha256);
console.log("lesson candidate rules: passed");
