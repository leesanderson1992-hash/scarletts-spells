import assert from "node:assert/strict";
import { evaluateLessonCandidate, type CandidateInput } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { canonicalWordSum, type CanonicalPart } from "../lib/teaching-dictionary-manager/canonical-morphology";

function candidate(prefix: string, stem: string, kind: "base" | "root", suffix = "", gloss = "not"): CandidateInput {
  const word = prefix + stem + suffix;
  const parts: CanonicalPart[] = [
    {id: "prefix", kind: "prefix", sourceText: prefix, surfaceText: prefix, gloss,
      displayRange: {start: 0, end: prefix.length}},
    {id: "stem", kind, sourceText: stem, surfaceText: stem, gloss: "Reviewed component meaning",
      displayRange: {start: prefix.length, end: prefix.length + stem.length}},
  ];
  if (suffix) parts.push({id: "suffix", kind: "suffix", sourceText: suffix, surfaceText: suffix,
    gloss: "Reviewed suffix meaning", displayRange: {start: prefix.length + stem.length, end: word.length}});
  return {wordId: word, displayWord: word, skillKey: "D4_MOR_PREFIXES_IN_IM_IL_IR", senseId: "review",
    senseSet: {senses: [{id: "review", definition: "Reviewed word meaning", partOfSpeech: "adjective",
      pronunciationId: "british", dictationSentence: word, dictationTargetTokenIndex: 0}],
      pronunciations: [{id: "british", ipa: "/test/", spokenSyllableCount: 1, stressPattern: "primary"}]},
    morphology: {parts, joins: parts.slice(1).map((part, index) => ({afterPartId: parts[index].id,
      beforePartId: part.id, joinType: "none"})), wordSum: canonicalWordSum(parts, word),
      analysisStatus: "approved", reviewStatus: "approved_for_first_exposure"},
    familyLinks: [{sense_id: "review", family_key: stem, component_part_id: "stem", relationship_kind: "derived"}]};
}
for (const input of [candidate("in", "cred", "root", "ible"), candidate("in", "vis", "root", "ible"),
  candidate("in", "noc", "root", "ent"), candidate("in", "vent", "root", "ion", "in or upon"),
  candidate("in", "crease", "root", "", "in or upon"), candidate("im", "patient", "base"),
  candidate("il", "legal", "base"), candidate("ir", "regular", "base"), candidate("in", "flame", "base", "", "make")]) {
  assert.equal(evaluateLessonCandidate(input).status, "ready", input.displayWord);
  const missingFamily = evaluateLessonCandidate({...input, familyLinks: []});
  assert.equal(missingFamily.status, "needs_facts", input.displayWord);
  assert(missingFamily.issues.some(issue => issue.code === "FAMILY_LINK"));
  const unapproved = {...input, morphology: {...input.morphology!, analysisStatus: "pending"}};
  assert.equal(evaluateLessonCandidate(unapproved).status, "needs_facts");
}
const wrong = evaluateLessonCandidate(candidate("in", "possible", "base"));
assert.equal(wrong.status, "not_match");
assert(wrong.issues.some(issue => issue.code === "PREFIX_FORM"));
const missingGloss = candidate("in", "cred", "root", "ible");
(missingGloss.morphology!.parts as CanonicalPart[])[0].gloss = "";
assert.equal(evaluateLessonCandidate(missingGloss).status, "needs_facts");
console.log("Prefix base/root eligibility, missing families, approval and assimilation checks passed.");

// The lesson projection must retain the distinction after approval.
import { loadReviewedPrefixPackageFixtures, selectReviewedPrefixFixture } from "./lib/adle-reviewed-prefix-package-fixture";
import { normaliseDynamicPrefixSelection } from "../lib/adle/morphology/shared-affix-compatibility";
const fixture = loadReviewedPrefixPackageFixtures().find(f => f.profile.microSkillKey === "D4_MOR_PREFIXES_IN_IM_IL_IR")!;
const selection = selectReviewedPrefixFixture(fixture.profile, fixture.words[0]);
const original = selection.profile.wordsByCanonicalId.get(fixture.words[0].canonicalWordId)!;
const rootWord = structuredClone(original);
const component = rootWord.parts.find(part => part.role === "base" || part.role === "root")!;
component.role = "root";
component.sourceText = rootWord.baseWord;
selection.profile.wordsByCanonicalId.set(rootWord.canonicalWordId, rootWord);
const projection = normaliseDynamicPrefixSelection(selection);
assert(projection.ok);
assert.equal(projection.input.words.find(word => word.canonicalWordId === rootWord.canonicalWordId)?.semanticBaseKind, "root");
console.log("Shared prefix compiler projection retains bound-root classification.");

import { prefixReviewIssues } from "../lib/teaching-dictionary-manager/specialist-bulk-review";
import type { MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";
const rootCandidate = candidate("in", "vis", "root", "ible");
const reviewBundle: MultiSenseCsvBundle = {
  wordId: rootCandidate.wordId, displayWord: rootCandidate.displayWord, sourceSenseReviewedAt: "",
  senseSet: rootCandidate.senseSet!, analyses: [{senseId: "review",
    parts: rootCandidate.morphology!.parts as CanonicalPart[],
    joins: [{afterPartId: "prefix", beforePartId: "stem", joinType: "none"},
      {afterPartId: "stem", beforePartId: "suffix", joinType: "none"}],
    transformations: [], wordSum: rootCandidate.morphology!.wordSum!, familyKey: "vis",
    componentPartId: "stem", relationshipKind: "derived", requestedSkillKeys: [rootCandidate.skillKey]}],
};
assert.deepEqual(prefixReviewIssues(reviewBundle, "review", ["review"], "vis"), []);
reviewBundle.analyses[0].familyKey = "";
assert(prefixReviewIssues(reviewBundle, "review", ["review"], "vis").some(issue => issue.includes("family")));
console.log("Published root words stay resolved in Bulk review; missing family links remain flagged.");
