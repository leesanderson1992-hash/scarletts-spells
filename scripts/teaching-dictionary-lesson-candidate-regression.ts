import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ING_MICRO_SKILLS } from "../lib/adle/ing/contracts";
import { ingPreviewPool } from "../lib/adle/ing/preview-fixture";
import { compileIngLesson, validateIngLesson } from "../lib/adle/ing/lesson";
import { ingActivityDeclarations, ingAssignmentItems } from "../lib/adle/ing/snapshot";
import { SHARED_AFFIX_PROFILE_REGISTRY } from "../lib/adle/morphology/shared-affix-profile-registry";
import { ingReleasedWordMatchesCurrentOverview } from "../lib/adle/ing/current-overview";
import { evaluateLessonCandidate, hasCandidateRule,
  LESSON_CANDIDATE_RULE_REVISION } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { approvedGeneratedIngWord, generateIngWordFromOverview } from "../lib/teaching-dictionary-manager/ing-overview-recipe";
import { previewIngOverviewRelease } from "../lib/teaching-dictionary-manager/ing-overview-release-preview";
import { candidateDecisionIsCurrent } from "../lib/teaching-dictionary-manager/candidate-decision-current";
import { routeBlockers, routeWithSharedFacts, sharedRouteContentKeys, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";

function ranged<T extends { surfaceText: string }>(parts: T[]): (T & { displayRange: { start: number; end: number } })[] {
  let start = 0;
  return parts.map(part => {
    const range = { start, end: start + part.surfaceText.length };
    start = range.end;
    return { ...part, displayRange: range };
  });
}

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
    parts: ranged([{ id: "base", kind: "base", sourceText: "read", surfaceText: "read", gloss: "read text" },
      { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "action in progress" }]) },
  familyLinks: [{ sense_id: "reading-verb", family_key: "read_verb_base_family",
    component_part_id: "base", relationship_kind: "regular_inflection" }],
};

assert.equal(evaluateLessonCandidate(reading).status, "ready");
const boxingSenses = { ...reading.senseSet, senses: [
  { ...reading.senseSet.senses[0], id: "boxing-noun-sport", partOfSpeech: "noun",
    definition: "A sport using padded gloves.", dictationSentence: "Boxing is a sport.",
    dictationTargetTokenIndex: 0 },
  { ...reading.senseSet.senses[0], id: "boxing-verb-fighting", partOfSpeech: "verb",
    definition: "Fighting using padded gloves.", dictationSentence: "She is boxing now." },
  { ...reading.senseSet.senses[0], id: "boxing-verb-packing", partOfSpeech: "verb",
    definition: "Putting things into boxes.", dictationSentence: "She is boxing books." },
] };
const boxing = { ...reading, displayWord: "boxing", senseSet: boxingSenses,
  morphology: { ...reading.morphology, wordSum: "box + ing → boxing",
    parts: ranged([{ ...reading.morphology.parts[0], sourceText: "box", surfaceText: "box" },
      reading.morphology.parts[1]]) } };
for (const senseId of ["boxing-verb-fighting", "boxing-verb-packing"]) {
  assert.equal(evaluateLessonCandidate({ ...boxing, senseId,
    familyLinks: [{ ...reading.familyLinks[0], sense_id: senseId }] }).status, "ready");
}
assert.equal(evaluateLessonCandidate({ ...boxing, senseId: "boxing-noun-sport",
  familyLinks: [{ ...reading.familyLinks[0], sense_id: "boxing-noun-sport" }] }).status,
"not_match", "the sport noun is not a regular verb -ing inflection");
for (const morphology of [
  { ...reading.morphology, parts: reading.morphology.parts.map(part => ({ id: part.id,
    kind: part.kind, sourceText: part.sourceText, surfaceText: part.surfaceText, gloss: part.gloss })) },
  { ...reading.morphology, joins: [{ afterPartId: "suffix", beforePartId: "base", joinType: "none" }] },
  { ...reading.morphology, parts: [{ ...reading.morphology.parts[0], id: "suffix" },
    reading.morphology.parts[1]] },
  { ...reading.morphology, wordSum: "reed + ing → reading" },
]) assert.deepEqual(evaluateLessonCandidate({ ...reading, morphology }).issues.map(issue => issue.code),
  ["REVIEWED_PARTS"], "incomplete or conflicting approved word parts cannot approve a lesson candidate");
const decision = { action: "approve", sense_id: reading.senseId,
  pronunciation_id: "reading-ipa", rule_revision: LESSON_CANDIDATE_RULE_REVISION,
  fact_snapshot: { senseId: reading.senseId, senseSet: reading.senseSet,
    morphologyId: "reviewed-morphology", familyLinkIds: ["read-family-link"] } };
const currentFacts = { event: decision, senseId: reading.senseId,
  senseSet: reading.senseSet, morphologyId: "reviewed-morphology",
  familyLinkIds: ["read-family-link"] };
assert(candidateDecisionIsCurrent(currentFacts));
assert(!candidateDecisionIsCurrent({ ...currentFacts, event: { ...decision,
  rule_revision: "reviewed_overview_candidate_v1" } }), "a previous rule revision needs recheck");
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
  assert.equal(recipe.word.senseId, "reading-verb");
  assert.equal(recipe.word.pronunciationId, "reading-ipa");
  assert.equal(recipe.word.pronunciationIpa, "/ˈriːdɪŋ/");
  assert.equal(recipe.word.meaning, "The act of reading.");
  assert.equal(recipe.word.dictationSentence, "She is reading a book.");
  assert.deepEqual(recipe.word.sourceRefs, ["Reviewed import"]);
  assert.equal(approvedGeneratedIngWord({ generated: recipe.word, reviewerRef: "reviewer",
    approvalRef: "governed-release" })?.word, "reading");
  assert.equal(approvedGeneratedIngWord({ generated: recipe.word, reviewerRef: "reviewer",
    approvalRef: "" }), null);
  const approved = approvedGeneratedIngWord({ generated: recipe.word, reviewerRef: "reviewer",
    approvalRef: "governed-release" });
  assert(approved);
  const currentReleased = { released: approved, senseSet: reading.senseSet,
    morphology: { ...reading.morphology, id: "reviewed-morphology" },
    familyLinks: [{ ...reading.familyLinks[0], id: "read-family-link" }],
    decision, boundSenseIds: ["reading-verb"], sourceName: "Reviewed import", sourceUrl: null };
  assert(ingReleasedWordMatchesCurrentOverview(currentReleased));
  assert(!ingReleasedWordMatchesCurrentOverview({ ...currentReleased, boundSenseIds: [] }));
  assert(!ingReleasedWordMatchesCurrentOverview({ ...currentReleased,
    senseSet: { ...reading.senseSet, senses: [{ ...reading.senseSet.senses[0],
      definition: "A changed meaning." }] } }));
  assert(!ingReleasedWordMatchesCurrentOverview({ ...currentReleased, sourceName: "Changed source" }));
  assert(!ingReleasedWordMatchesCurrentOverview({ ...currentReleased,
    decision: { ...decision, action: "withdraw" } }));
  const selected = { ok: true as const, words: [
    { ...approved, learningItemId: "reviewed:reading" },
    ...ingPreviewPool("D4_INF_ING_ENDINGS_REGULAR").filter(word => word.word !== "reading")
      .slice(0, 5).map(word => ({ ...word, learningItemId: null })),
  ], queuedTargets: [{ canonicalWordId: approved.canonicalWordId,
    learningItemId: "reviewed:reading" }], deferredLearningItemIds: [] };
  const lesson = compileIngLesson(selected, "fixture:overview-sense", "dev_fixture");
  assert(validateIngLesson(lesson, true));
  const meaningActivity = ingActivityDeclarations(lesson).find(item => item.activityId === "meaning-match");
  const targets = meaningActivity?.payload.targets as { senseId?: string; pronunciationId?: string }[];
  assert.deepEqual({ senseId: targets[0].senseId, pronunciationId: targets[0].pronunciationId },
    { senseId: "reading-verb", pronunciationId: "reading-ipa" });
  const dictationActivity = ingActivityDeclarations(lesson).find(item =>
    item.activityId === `dictation:${approved.canonicalWordId}`);
  assert.equal(dictationActivity?.payload.senseId, "reading-verb");
  const assignment = ingAssignmentItems(lesson, "child", "parent", "2026-11-10");
  assert.equal(assignment.find(item => item.targetWord === "reading")?.metadata.senseId, "reading-verb");
}
assert.equal(generateIngWordFromOverview({ ...reading,
  provenance: { sourceName: "", sourceUrl: "" } }).status, "needs_facts");
assert.deepEqual(evaluateLessonCandidate({ ...reading, familyLinks: [] }).issues.map(issue => issue.code),
  ["FAMILY_LINK"]);
assert.equal(evaluateLessonCandidate({ ...reading, skillKey: "D4_INF_ING_ENDINGS_DROP_E" }).status,
  "not_match");
const invalidDropE = evaluateLessonCandidate({ ...reading, displayWord: "boing",
  skillKey: "D4_INF_ING_ENDINGS_DROP_E", morphology: { ...reading.morphology,
    wordSum: "box + ing → boing", parts: ranged([
      { id: "base", kind: "base", sourceText: "box", surfaceText: "bo", gloss: "a box" },
      reading.morphology.parts[1]]) } });
assert.equal(invalidDropE.status, "not_match", "drop-e requires a base ending in e");
const invalidIe = evaluateLessonCandidate({ ...reading, displayWord: "fying",
  skillKey: "D4_INF_ING_ENDINGS_IE_TO_Y", morphology: { ...reading.morphology,
    wordSum: "foe + ing → fying", parts: ranged([
      { id: "base", kind: "base", sourceText: "foe", surfaceText: "fy", gloss: "an adversary" },
      reading.morphology.parts[1]]) } });
assert.equal(invalidIe.status, "not_match", "ie-to-y requires a base ending in ie");
const vegetable = evaluateLessonCandidate({ ...reading, displayWord: "vegetable",
  skillKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  morphology: { ...reading.morphology, wordSum: "veget + able → vegetable",
    parts: ranged([{ id: "root", kind: "root", sourceText: "veget", surfaceText: "veget", gloss: "To grow or live" },
      { id: "suffix", kind: "suffix", sourceText: "able", surfaceText: "able", gloss: "able to be" }]),
    joins: [{ afterPartId: "root", beforePartId: "suffix", joinType: "none" }] },
  familyLinks: [{ sense_id: "reading-verb", family_key: "veget_bound_root_base_family",
    component_part_id: "root", relationship_kind: "historical_relative" }] });
assert.equal(vegetable.status, "not_match");
const doublingSkill = "D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT";
const hopping = { ...reading, displayWord: "hopping", skillKey: doublingSkill,
  senseSet: { ...reading.senseSet, senses: [{ ...reading.senseSet.senses[0],
    dictationSentence: "She is hopping now." }] },
  morphology: { ...reading.morphology, wordSum: "hop + ing → hopping",
    parts: ranged([{ id: "base", kind: "base", sourceText: "hop", surfaceText: "hopp", gloss: "to jump" },
      reading.morphology.parts[1]]) } };
assert.equal(evaluateLessonCandidate(hopping).status, "ready",
  "the lesson-only doubling pattern cannot block word and sense approval");
const readable = { ...reading, displayWord: "readable", skillKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  senseSet: { ...reading.senseSet, senses: [{ ...reading.senseSet.senses[0],
    dictationSentence: "This book is readable.", dictationTargetTokenIndex: 3 }] },
  morphology: { ...reading.morphology, wordSum: "read + able → readable",
    parts: ranged([reading.morphology.parts[0],
      { id: "suffix", kind: "suffix", sourceText: "able", surfaceText: "able",
        gloss: "Capable of, fit for, or able to be" }]) },
  familyLinks: [{ ...reading.familyLinks[0], relationship_kind: "derived" }] };
assert.equal(evaluateLessonCandidate(readable).status, "ready",
  "a reviewed free-base derivation can be approved without route-only content");
assert.deepEqual(evaluateLessonCandidate({ ...readable, familyLinks: [] }).issues.map(issue => issue.code),
  ["FAMILY_LINK"]);
const fulLessSkill = "D4_MOR_SUFFIXES_FUL_LESS";
const careful = { ...readable, displayWord: "careful", skillKey: fulLessSkill,
  senseSet: { ...readable.senseSet, senses: [{ ...readable.senseSet.senses[0],
    dictationSentence: "She is careful.", dictationTargetTokenIndex: 2 }] },
  morphology: { ...readable.morphology, wordSum: "care + ful → careful",
    parts: ranged([{ id: "base", kind: "base", sourceText: "care", surfaceText: "care", gloss: "attention" },
      { id: "suffix", kind: "suffix", sourceText: "ful", surfaceText: "ful", gloss: "full of" }]) } };
assert(hasCandidateRule(fulLessSkill));
assert.equal(evaluateLessonCandidate(careful).status, "ready");
const careless = { ...careful, displayWord: "careless",
  morphology: { ...careful.morphology, wordSum: "care + less → careless",
    parts: ranged([careful.morphology.parts[0],
      { id: "suffix", kind: "suffix", sourceText: "less", surfaceText: "less", gloss: "without" }]) },
  senseSet: { ...careful.senseSet, senses: [{ ...careful.senseSet.senses[0],
    dictationSentence: "She is careless." }] } };
assert.equal(evaluateLessonCandidate(careless).status, "ready");
assert.deepEqual(evaluateLessonCandidate({ ...careful, familyLinks: [] }).issues.map(issue => issue.code),
  ["FAMILY_LINK"]);
assert.deepEqual(evaluateLessonCandidate({ ...careful, morphology: { ...careful.morphology,
  parts: [careful.morphology.parts[0], { ...careful.morphology.parts[1], gloss: "" }] } }).issues
  .map(issue => issue.code), ["SUFFIX_MEANING"]);
assert.equal(evaluateLessonCandidate({ ...careful, skillKey: "D4_MOR_SUFFIXES_ABLE_IBLE" }).status,
  "not_match", "a -ful word must not pass the -able/-ible rule");
assert.equal(evaluateLessonCandidate({ ...reading, skillKey: fulLessSkill,
  displayWord: "vegetful", morphology: { ...reading.morphology,
    wordSum: "veget + ful → vegetful", parts: ranged([{ id: "root", kind: "root",
      sourceText: "veget", surfaceText: "veget", gloss: "To grow or live" }, { id: "suffix", kind: "suffix",
      sourceText: "ful", surfaceText: "ful", gloss: "full of" }]),
    joins: [{ afterPartId: "root", beforePartId: "suffix", joinType: "none" }] } }).status,
  "not_match", "a bound root alone does not meet the free-base family requirement");
const unSkill = "D4_MOR_PREFIXES_UN";
const unhappy = { ...reading, displayWord: "unhappy", skillKey: unSkill,
  senseSet: { ...reading.senseSet, senses: [{ ...reading.senseSet.senses[0],
    definition: "Not feeling happy.", dictationSentence: "She feels unhappy today.",
    dictationTargetTokenIndex: 2 }] },
  morphology: { ...reading.morphology, wordSum: "un + happy → unhappy",
    parts: ranged([{ id: "prefix", kind: "prefix", sourceText: "un", surfaceText: "un", gloss: "not" },
      { id: "base", kind: "base", sourceText: "happy", surfaceText: "happy", gloss: "feeling joy" }]),
    joins: [{ afterPartId: "prefix", beforePartId: "base", joinType: "none" }] },
  familyLinks: [{ ...reading.familyLinks[0], relationship_kind: "derived" }] };
assert(hasCandidateRule(unSkill));
assert.equal(evaluateLessonCandidate(unhappy).status, "ready");
assert.deepEqual(evaluateLessonCandidate({ ...unhappy, familyLinks: [] }).issues.map(issue => issue.code),
  ["FAMILY_LINK"]);
assert.deepEqual(evaluateLessonCandidate({ ...unhappy, morphology: { ...unhappy.morphology,
  parts: [{ ...unhappy.morphology.parts[0], gloss: "" }, unhappy.morphology.parts[1]] } }).issues
  .map(issue => issue.code), ["PREFIX_MEANING"]);
assert.equal(evaluateLessonCandidate({ ...unhappy, skillKey: "D4_MOR_SUFFIXES_FUL_LESS" }).status,
  "not_match", "a prefixed word cannot pass a suffix candidate rule");
assert.equal(evaluateLessonCandidate({ ...unhappy, morphology: { ...unhappy.morphology,
  parts: ranged([{ ...unhappy.morphology.parts[0], surfaceText: "u" },
    { ...unhappy.morphology.parts[1], surfaceText: "nhappy" }]) } }).status,
  "not_match", "the visible prefix must match its reviewed form");
const happiness = { ...careful, displayWord: "happiness", skillKey: "D4_MOR_SUFFIXES_NESS",
  senseSet: { ...careful.senseSet, senses: [{ ...careful.senseSet.senses[0],
    dictationSentence: "She found happiness.", dictationTargetTokenIndex: 2 }] },
  morphology: { ...careful.morphology, wordSum: "happy + ness → happiness",
    parts: ranged([{ id: "base", kind: "base", sourceText: "happy", surfaceText: "happi",
      gloss: "feeling joy" }, { id: "suffix", kind: "suffix", sourceText: "ness",
      surfaceText: "ness", gloss: "a state or quality" }]) } };
assert(hasCandidateRule(happiness.skillKey));
assert.equal(evaluateLessonCandidate(happiness).status, "ready");
assert.equal(evaluateLessonCandidate({ ...happiness, skillKey: "D4_MOR_SUFFIXES_MENT" }).status,
  "not_match");
const replay = { ...unhappy, displayWord: "replay", skillKey: "D4_MOR_PREFIXES_RE_PRE",
  senseSet: { ...unhappy.senseSet, senses: [{ ...unhappy.senseSet.senses[0],
    dictationSentence: "They replay the scene.", dictationTargetTokenIndex: 1 }] },
  morphology: { ...unhappy.morphology, wordSum: "re + play → replay",
    parts: ranged([{ id: "prefix", kind: "prefix", sourceText: "re", surfaceText: "re",
      gloss: "again" }, { id: "base", kind: "base", sourceText: "play",
      surfaceText: "play", gloss: "take part in a game" }]) } };
assert(hasCandidateRule(replay.skillKey));
assert.equal(evaluateLessonCandidate(replay).status, "ready");
const impossible = { ...unhappy, displayWord: "impossible",
  skillKey: "D4_MOR_PREFIXES_IN_IM_IL_IR",
  senseSet: { ...unhappy.senseSet, senses: [{ ...unhappy.senseSet.senses[0],
    dictationSentence: "That is impossible.", dictationTargetTokenIndex: 2 }] },
  morphology: { ...unhappy.morphology, wordSum: "in + possible → impossible",
    parts: ranged([{ id: "prefix", kind: "prefix", sourceText: "in", surfaceText: "im",
      gloss: "not" }, { id: "base", kind: "base", sourceText: "possible",
      surfaceText: "possible", gloss: "able to happen" }]) } };
assert(hasCandidateRule(impossible.skillKey));
assert.equal(evaluateLessonCandidate(impossible).status, "ready");
assert.equal(evaluateLessonCandidate({ ...impossible, displayWord: "inpossible",
  morphology: { ...impossible.morphology, wordSum: "in + possible → inpossible",
    parts: ranged([{ ...impossible.morphology.parts[0], surfaceText: "in" },
      impossible.morphology.parts[1]]) } }).status, "not_match",
"the reviewed allomorph must match the base's initial letter");
assert.equal(evaluateLessonCandidate({ ...impossible, morphology: { ...impossible.morphology,
  parts: ranged([{ ...impossible.morphology.parts[0], sourceText: "il" },
    impossible.morphology.parts[1]]), wordSum: "il + possible → impossible" } }).status,
  "not_match", "a changed allomorph must identify the in- family as its source");
for (const profile of SHARED_AFFIX_PROFILE_REGISTRY) assert(hasCandidateRule(profile.microSkillKey),
  `${profile.microSkillKey} must use the shared candidate evaluator`);
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
const hoppingRoute = { ...ingRoute, microSkillKey: doublingSkill };
const hoppingPayload = { ...payload, displayWord: "hopping",
  skillSenseIds: { [doublingSkill]: reading.senseId },
  canonicalMorphology: { ...payload.canonicalMorphology, ...hopping.morphology } };
assert.deepEqual(routeBlockers(hoppingRoute, hoppingPayload), ["Choose the doubling pattern."],
  "lesson content remains incomplete until its doubling pattern is selected");
const staleRoute = { ...ingRoute, wordMeaning: "Old meaning",
  content: { base: "reed", sourceRefs: ["Old source"] } };
const regenerated = routeWithSharedFacts(staleRoute, payload);
assert.equal(regenerated.wordMeaning, "The act of reading.");
assert.equal(regenerated.content.base, "read");
assert.deepEqual(regenerated.content.sourceRefs, ["Reviewed import"]);
const changedOverview = { ...payload, canonicalMorphology: { ...payload.canonicalMorphology,
  parts: [{ id: "root", kind: "root", sourceText: "reading", surfaceText: "reading",
    gloss: "the activity" }], joins: [], wordSum: "reading" } };
assert.equal(routeWithSharedFacts({ ...staleRoute, content: { ...staleRoute.content,
  base: "read" } }, changedOverview).content.base, "",
"an old route base cannot survive a changed approved Overview analysis");
assert(routeBlockers(staleRoute, changedOverview).includes("Add the unchanged base word."));
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
