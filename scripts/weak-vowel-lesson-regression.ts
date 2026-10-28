import assert from "node:assert/strict";
import { weakVowelPreviewLesson, WEAK_VOWEL_PREVIEW_SKILLS } from "../lib/adle/weak-vowel/preview-fixture";
import { prepareWeakVowelLesson } from "../lib/adle/weak-vowel/prepare";
import { reviewedBritishPronunciationId } from "../lib/adle/weak-vowel/pronunciation-id";
import { validateWeakVowelLesson, weakVowelTeaching } from "../lib/adle/weak-vowel/lesson";
import { initialWeakVowelProgress, weakVowelReadyToFinish } from "../lib/adle/weak-vowel/progress";
import { weakVowelReflectionReview } from "../lib/adle/weak-vowel/reflection-review";
import { getCurriculumRouteDefinition } from "../lib/adle/curriculum-readiness/route-registry";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

const registeredRoute = getCurriculumRouteDefinition("weak_vowel_word_lab", "v1");
assert.ok(registeredRoute);
assert.equal(registeredRoute.newAssignmentCapable, true, "new assignments require the enabled database release gate");
assert.ok(WEAK_VOWEL_PREVIEW_SKILLS.every((key) => registeredRoute.supportedMicroSkillKeys.includes(key)));
assert.ok(registeredRoute.supportedMicroSkillKeys.includes("D4_SCHWA_FINAL_ET"));
const finalETTeaching = weakVowelTeaching("D4_SCHWA_FINAL_ET", []);
assert.equal(finalETTeaching.pages.length, 3);
assert.equal(finalETTeaching.pages[0].title, "The disappearing vowel");
assert.equal(finalETTeaching.pages[1].title, "The Secret of the Quiet -et");
assert.equal(finalETTeaching.pages[2].title, "The Disguised E!");
const etStory = finalETTeaching.pages[1].weakVowelFeature;
const etRule = finalETTeaching.pages[2].weakVowelFeature;
assert.equal(etStory?.kind, "final_et_story");
assert.equal(etStory?.kind === "final_et_story" && etStory.examples.length, 6);
assert.equal(etStory?.kind === "final_et_story" && etStory.examples.some(example => example.word === "rocket" && example.spelling === "rock-et"), true);
assert.equal(etStory?.kind === "final_et_story" && etStory.tips[1].blocks.some(block => block.kind === "comparison" && block.rows.some(row => row[0] === "rabbit" && row[1] === "-it")), true);
assert.equal(etRule?.kind, "final_et_rule");
assert.equal(etRule?.kind === "final_et_rule" && etRule.examples.length, 6);
assert.equal(etRule?.kind === "final_et_rule" && etRule.motto.includes("E might be hiding in ET"), true);

for (const key of WEAK_VOWEL_PREVIEW_SKILLS) {
  const lesson = weakVowelPreviewLesson(key, 1);
  assert.equal(validateWeakVowelLesson(lesson, true), true);
  assert.equal(validateWeakVowelLesson(lesson), false, "candidate content must not become a governed lesson");
  assert.deepEqual(lesson.words.map((word) => word.spelling), lesson.teaching.meetWords.words.map((word) => word.word));
  assert.equal(lesson.teaching.pages.length, 3);
  assert.equal(lesson.teaching.pages[0].weakVowelFeature?.kind, "sound_contrast");
  assert.equal(lesson.teaching.meetWords.words.every((word) => Boolean(word.detail?.trim())), true);
  assert.equal(lesson.words.every((word) => word.dinner.target.start === word.detective.target.start &&
    word.dinner.target.end === word.detective.target.end), true);
}
const finalA = weakVowelPreviewLesson("D4_SCHWA_FINAL_A_FINAL", 1);
assert.equal(finalA.teaching.pages[1].weakVowelFeature?.kind, "final_a_groups");
assert.equal(finalA.teaching.pages[2].weakVowelFeature?.kind, "final_a_strategy");
const finalAR = weakVowelPreviewLesson("D4_SCHWA_FINAL_AR_FINAL", 1);
assert.equal(finalAR.words.every((word) => word.dinner.target.text === "ar" && word.dinner.selectionTarget?.text === "a"), true,
  "Final -ar keeps its reviewed full annotation while Dinner selects only a");
const arStory = finalAR.teaching.pages[1].weakVowelFeature;
const arRule = finalAR.teaching.pages[2].weakVowelFeature;
assert.equal(arStory?.kind === "ending_secret_story" && arStory.examples.length, 4);
assert.equal(arStory?.kind === "ending_secret_story" && arStory.tips.length, 6);
assert.equal(arRule?.kind === "ending_secret_rule" && arRule.tips.length, 6);
const reviewLesson = weakVowelPreviewLesson("D4_SCHWA_FINAL_ER_FINAL", 1);
assert.equal(reviewLesson.words.every((word) => word.dinner.selectionTarget?.text === "e"), true);
assert.equal(reviewLesson.teaching.pages[1].weakVowelFeature?.kind, "ending_secret_story");
assert.equal(reviewLesson.teaching.pages[2].weakVowelFeature?.kind, "ending_secret_rule");
const erStory = reviewLesson.teaching.pages[1].weakVowelFeature;
const erRule = reviewLesson.teaching.pages[2].weakVowelFeature;
assert.equal(erStory?.kind === "ending_secret_story" && erStory.examples.length, 6);
assert.equal(erStory?.kind === "ending_secret_story" && erStory.tips.length, 4);
assert.equal(erRule?.kind === "ending_secret_rule" && erRule.clues.length, 2);
const finalOR = weakVowelPreviewLesson("D4_SCHWA_FINAL_OR_FINAL", 1);
assert.equal(finalOR.words.every((word) => word.dinner.selectionTarget?.text === "o"), true);
const orStory = finalOR.teaching.pages[1].weakVowelFeature;
const orRule = finalOR.teaching.pages[2].weakVowelFeature;
assert.equal(orStory?.kind === "ending_secret_story" && orStory.examples.length, 6);
assert.equal(orStory?.kind === "ending_secret_story" && orStory.tips.length, 4);
assert.equal(orRule?.kind === "ending_secret_rule" && orRule.clues.length, 3);
assert.equal(orStory?.kind === "ending_secret_story" && orStory.examples.some((example) => `${example.stem}${example.ending}` === "color"), false);
const initialE = weakVowelPreviewLesson("D4_SCHWA_INITIAL_E_INITIAL", 1);
const eStory = initialE.teaching.pages[1].weakVowelFeature;
const eRule = initialE.teaching.pages[2].weakVowelFeature;
assert.equal(eStory?.kind === "ending_secret_story" && eStory.targetPosition, "initial");
assert.equal(eStory?.kind === "ending_secret_story" && eStory.examples.length, 7);
assert.equal(eStory?.kind === "ending_secret_story" && eStory.tips.length, 5);
assert.equal(eRule?.kind === "ending_secret_rule" && eRule.tips.length, 5);
assert.equal(eRule?.kind === "ending_secret_rule" && eRule.rule.includes("/ɪ/"), true);
const initialO = weakVowelPreviewLesson("D4_SCHWA_INITIAL_O_INITIAL", 1);
const oStory = initialO.teaching.pages[1].weakVowelFeature;
const oRule = initialO.teaching.pages[2].weakVowelFeature;
assert.equal(oStory?.kind === "ending_secret_story" && oStory.targetPosition, "initial");
assert.equal(oStory?.kind === "ending_secret_story" && oStory.examples.length, 5);
assert.equal(oStory?.kind === "ending_secret_story" && oStory.examples.some((example) => `${example.ending}${example.stem}` === "observation"), false);
assert.equal(oStory?.kind === "ending_secret_story" && oStory.tips.length, 5);
assert.equal(oRule?.kind === "ending_secret_rule" && oRule.tips.length, 5);
const medial = weakVowelPreviewLesson("D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS", 1);
const medialStory = medial.teaching.pages[1].weakVowelFeature;
const medialRule = medial.teaching.pages[2].weakVowelFeature;
assert.equal(medialStory?.kind === "ending_secret_story" && medialStory.targetPosition, "medial");
assert.equal(medialStory?.kind === "ending_secret_story" && medialStory.examples.length, 6);
assert.equal(medialStory?.kind === "ending_secret_story" && medialStory.tips.length, 6);
assert.equal(medialStory?.kind === "ending_secret_story" && medialStory.tips.some((tip) => tip.blocks.some((block) => block.kind === "comparison")), true);
assert.equal(medialRule?.kind === "ending_secret_rule" && medialRule.tips.length, 6);
const naturalActual = weakVowelPreviewLesson("D4_SCHWA_FINAL_AL", 1);
const naturalActualStory = naturalActual.teaching.pages[1].weakVowelFeature;
const naturalActualRule = naturalActual.teaching.pages[2].weakVowelFeature;
assert.equal(naturalActualStory?.kind, "ending_secret_story");
assert.equal(naturalActualStory?.kind === "ending_secret_story" && naturalActualStory.examples.length, 3);
assert.equal(naturalActualStory?.kind === "ending_secret_story" && naturalActualStory.tips.length, 5);
assert.equal(naturalActualRule?.kind === "ending_secret_rule" && naturalActualRule.tips.length, 5);
assert.equal(naturalActual.words.every((word) => word.dinner.target.text === "a" &&
  word.dinner.selectionTarget === undefined &&
  word.detective.target.text === "a" &&
  word.detective.reviewedVowelIndex === word.dinner.target.start), true,
"The owner-approved target is the a in -al for Dinner and Detective");
const [reviewFirst, reviewSecond] = reviewLesson.words;
const reviewProgress = {
  ...initialWeakVowelProgress(reviewLesson),
  coverAttempts: { [reviewFirst.canonicalWordId]: reviewFirst.spelling.slice(0, -1) },
  dictationAttempts: { [reviewSecond.canonicalWordId]: reviewSecond.dictation.sentence.replace(reviewSecond.spelling, reviewSecond.spelling.slice(0, -1)) },
  dinnerResponse: { words: [{ canonicalWordId: reviewFirst.canonicalWordId, cutMisses: 1, targetMisses: 1, answerRevealed: true }] },
  detectiveResponse: { words: [{ canonicalWordId: reviewSecond.canonicalWordId, initialChoice: "A", initialCorrect: false, finalChoice: "E", finalCorrect: true }] },
};
const review = weakVowelReflectionReview(reviewLesson, reviewProgress);
assert.equal(review.mistakes.length, 1, "only wrong first Memory Lock attempts appear as spelling review");
assert.equal(review.sentenceComparisons.length, 1, "wrong original sentence appears even when later text changes");
assert.equal(review.contextRecap?.items.length, 2, "guided Dinner and Detective misses remain separate from spelling evidence");
assert.equal(weakVowelReflectionReview(reviewLesson, initialWeakVowelProgress(reviewLesson)).contextRecap, undefined);
assert.equal(validateWeakVowelLesson(null), false);
assert.equal(validateWeakVowelLesson({ routeKey: "weak_vowel_word_lab", words: null }), false);
const corruptedMeetWords = weakVowelPreviewLesson("D4_SCHWA_FINAL_AR_FINAL", 1);
corruptedMeetWords.teaching.meetWords.words[0].word = "another word";
assert.equal(validateWeakVowelLesson(corruptedMeetWords, true), false, "teaching cannot present a different selected word");

const candidate = weakVowelPreviewLesson("D4_SCHWA_FINAL_AR_FINAL", 1);
const approved = candidate.words.map((word) => {
  const pronunciationId = reviewedBritishPronunciationId(word.canonicalWordId, word.dinner.recording.sha256);
  return { ...word,
    definition: { ...word.definition, reviewStatus: "approved" as const },
    dinner: { ...word.dinner, reviewStatus: "approved" as const, pronunciationId,
      target: { ...word.dinner.target, soundType: "schwa" as const } },
    detective: { ...word.detective, reviewStatus: "approved" as const, pronunciationId,
      target: { ...word.detective.target, soundType: "schwa" as const } },
  };
});
const slots = approved.map((word) => ({ canonicalWordId: word.canonicalWordId, provenance: word.provenance,
  learningItemId: word.learningItemId, complexityLevel: null }));
const dinnerAssignments = approved.map((word) => ({ canonicalWordId: word.canonicalWordId, spelling: word.spelling,
  microSkillKey: candidate.microSkillKey, wordSense: word.dinner.wordSense, assignmentStatus: "assigned",
  sourceFingerprint: word.dinner.sourceFingerprint, pronunciationId: word.dinner.pronunciationId,
  recordingSha256: word.dinner.recording.sha256 }));
const detectiveAssignments = dinnerAssignments.map((word) => ({ ...word }));
const sentences = approved.map((word) => ({ canonicalWordId: word.canonicalWordId,
  microSkillKey: candidate.microSkillKey, sourceFingerprint: word.dinner.sourceFingerprint, ...word.dictation }));
const definitions = approved.map((word) => ({ canonicalWordId: word.canonicalWordId,
  spelling: word.spelling, wordSense: word.dinner.wordSense, ...word.definition }));
const input = { assignmentKey: "test:weak-vowel:one", contentVersion: "test-release-v1", microSkillKey: candidate.microSkillKey,
  slots, currentDinnerAssignments: dinnerAssignments, currentDetectiveAssignments: detectiveAssignments,
  publishedDinnerAnnotations: approved.map((word) => word.dinner),
  publishedDetectiveAnnotations: approved.map((word) => word.detective), currentFamilyAuthorities: [],
  publishedSentences: sentences, currentDefinitions: definitions };
const ready = prepareWeakVowelLesson(input);
assert.deepEqual(ready.blockers, []);
assert.ok(ready.lesson);
assert.deepEqual(ready.lesson.words.map((word) => word.canonicalWordId), slots.map((slot) => slot.canonicalWordId));
const stretchSlots = slots.map((slot, index) => index === slots.length - 1
  ? { ...slot, provenance: "stretch" as const, learningItemId: "li:stretch_selection:provisional" }
  : slot);
const stretchLesson = prepareWeakVowelLesson({ ...input, slots: stretchSlots });
assert.ok(stretchLesson.lesson);
assert.equal(stretchLesson.lesson.words.at(-1)?.learningItemId, null,
  "transfer practice cannot persist a provisional learning-item key");
assert.equal(stretchLesson.lesson.words[0].learningItemId, slots[0].learningItemId,
  "the child's existing learning-item lineage remains intact");
assert.equal(weakVowelReadyToFinish(initialWeakVowelProgress(ready.lesson), ready.lesson), false);
const fourWordLesson = prepareWeakVowelLesson({ ...input,
  slots: slots.slice(0, 4),
});
assert.equal(fourWordLesson.lesson?.words.length, 4, "a four-word weak-vowel lesson is valid");
const sample = approved[0];
const sampleFacts = {
  schemaVersion: "weak_vowel_route_facts_v1", sourceFingerprint: sample.dinner.sourceFingerprint,
  activityEligibility: Object.fromEntries(["dinner", "detective", "memoryLock", "dictation", "family"]
    .map((key) => [key, { status: key === "family" ? "not_applicable" : "ready", reason: null }])),
  wordSense: sample.dinner.wordSense, pronunciationId: sample.dinner.pronunciationId,
  wordRecording: sample.dinner.recording, spokenSyllableCount: sample.dinner.spokenSyllableCount,
  acceptedCutSets: sample.dinner.acceptedCutSets, target: sample.dinner.target,
  selectionTarget: sample.dinner.selectionTarget, detectiveVowelIndex: sample.detective.reviewedVowelIndex,
  familyDecision: "skip", familyAuthorityId: null, sentenceRecording: sample.dictation.recording,
  sentenceTarget: { start: sample.dictation.targetStart, end: sample.dictation.targetEnd },
  reviewSourceReference: "reviewed Sheet, owner-approved",
};
const sampleInput = { displayWord: sample.spelling, dictationSentence: sample.dictation.sentence,
  definition: sample.definition.text, microSkillKey: candidate.microSkillKey };
assert.deepEqual(weakVowelRouteBlockers(sampleFacts, sampleInput), []);
const naturalSample = naturalActual.words[0];
const naturalTargetStart = naturalSample.dinner.target.start;
const naturalFacts = { ...sampleFacts,
  sourceFingerprint: naturalSample.dinner.sourceFingerprint,
  target: { ...naturalSample.dinner.target, soundType: "schwa" },
  selectionTarget: { text: "a", start: naturalTargetStart, end: naturalTargetStart + 1 },
  detectiveVowelIndex: naturalTargetStart,
  spokenSyllableCount: naturalSample.dinner.spokenSyllableCount,
  acceptedCutSets: naturalSample.dinner.acceptedCutSets,
  sentenceTarget: { start: naturalSample.dictation.targetStart, end: naturalSample.dictation.targetEnd },
};
const naturalInput = { displayWord: naturalSample.spelling, dictationSentence: naturalSample.dictation.sentence,
  definition: naturalSample.definition.text, microSkillKey: "D4_SCHWA_FINAL_AL" };
assert.deepEqual(weakVowelRouteBlockers(naturalFacts, naturalInput), []);
assert.ok(weakVowelRouteBlockers({ ...naturalFacts,
  target: { ...naturalFacts.target, text: "u", start: naturalTargetStart - 1, end: naturalTargetStart },
  selectionTarget: { text: "u", start: naturalTargetStart - 1, end: naturalTargetStart },
  detectiveVowelIndex: naturalTargetStart - 1 }, naturalInput)
  .some((reason) => reason.includes("targets the written a in -al")));
assert.ok(weakVowelRouteBlockers({ ...sampleFacts, activityEligibility: { ...sampleFacts.activityEligibility,
  dinner: { status: "blocked", reason: "cut disputed" } } }, sampleInput)
  .some((reason) => reason.includes("dinner is blocked")));
assert.ok(weakVowelRouteBlockers({ ...sampleFacts, sourceFingerprint: "stale" }, sampleInput)
  .some((reason) => reason.includes("source fingerprint")));
assert.deepEqual(weakVowelRouteBlockers({ ...sampleFacts, familyDecision: "approve",
  activityEligibility: { ...sampleFacts.activityEligibility,
    family: { status: "blocked", reason: "no verified family authority" } } }, sampleInput), [],
"missing optional family authority must not block the word's required activities");

// Published data changes after assignment affect only new composition.
const saved = JSON.stringify(ready.lesson);
const originalTargetText = approved[0].dinner.target.text;
approved[0].dinner.target.text = "changed";
assert.equal(JSON.stringify(ready.lesson), saved);
approved[0].dinner.target.text = originalTargetText;
assert.equal(prepareWeakVowelLesson({ ...input, publishedDinnerAnnotations: input.publishedDinnerAnnotations.slice(1) }).lesson, null);
assert.ok(prepareWeakVowelLesson({ ...input, publishedDinnerAnnotations: input.publishedDinnerAnnotations.slice(1) })
  .blockers.some((blocker) => blocker.canonicalWordId === slots[0].canonicalWordId));
assert.ok(prepareWeakVowelLesson({ ...input, currentDefinitions: definitions.slice(1) }).blockers
  .some((blocker) => blocker.canonicalWordId === slots[0].canonicalWordId && blocker.reason === "word_definition_not_approved"));

const deassigned = dinnerAssignments.map((word, index) => index === 0 ? { ...word, assignmentStatus: "deassigned" } : word);
assert.ok(prepareWeakVowelLesson({ ...input, currentDinnerAssignments: deassigned }).blockers
  .some((blocker) => blocker.canonicalWordId === slots[0].canonicalWordId && blocker.reason === "not_assigned"));

// The resolver accepts a newly assigned canonical ID through its inputs; no
// production word shortlist is consulted. Use a synthetic spelling only here.
const newId = "synthetic-new-approved-word-id";
const replacement = { ...approved[4], canonicalWordId: newId,
  dinner: { ...approved[4].dinner, canonicalWordId: newId },
  detective: { ...approved[4].detective, canonicalWordId: newId } };
const revised = prepareWeakVowelLesson({ ...input,
  slots: [...slots.slice(0, 4), { ...slots[4], canonicalWordId: newId }],
  currentDinnerAssignments: [...dinnerAssignments.slice(0, 4), { ...dinnerAssignments[4], canonicalWordId: newId }],
  currentDetectiveAssignments: [...detectiveAssignments.slice(0, 4), { ...detectiveAssignments[4], canonicalWordId: newId }],
  publishedDinnerAnnotations: [...input.publishedDinnerAnnotations.slice(0, 4), replacement.dinner],
  publishedDetectiveAnnotations: [...input.publishedDetectiveAnnotations.slice(0, 4), replacement.detective],
  publishedSentences: [...sentences.slice(0, 4), { ...sentences[4], canonicalWordId: newId }],
  currentDefinitions: [...definitions.slice(0, 4), { ...definitions[4], canonicalWordId: newId }],
});
assert.ok(revised.lesson);
assert.equal(revised.lesson.words[4].canonicalWordId, newId);

console.log("Weak-vowel lesson regression passed for all eight preview configurations.");
