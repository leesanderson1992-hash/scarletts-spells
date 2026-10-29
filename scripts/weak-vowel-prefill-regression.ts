import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deviceSpeechSource } from "../lib/adle/weak-vowel/audio-source";
import { emptyMetadata, emptyMorphology, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { prefillWeakVowelDrafts } from "../lib/teaching-dictionary-manager/weak-vowel-prefill";
import type { WeakVowelRouteFactsV1 } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

const word = "natural";
const sentence = "The natural cave formed without people building it.";
const clip = { src: "/audio/natural-word.mp3", sha256: "a".repeat(64) };
const sentenceClip = { src: "/audio/natural-sentence.mp3", sha256: "b".repeat(64) };
const sourceFacts: Partial<WeakVowelRouteFactsV1> = {
  schemaVersion: "weak_vowel_route_facts_v1", sourceFingerprint: "c".repeat(64),
  wordSense: null, pronunciationId: "approved-natural-voice", wordRecording: clip,
  spokenSyllableCount: 3, acceptedCutSets: [[3, 4]],
  sentenceRecording: sentenceClip, sentenceTarget: { start: 4, end: 11 },
  target: { text: "a", start: 5, end: 6, syllableIndex: 3, soundType: "schwa" },
  selectionTarget: { text: "a", start: 5, end: 6 }, detectiveVowelIndex: 5,
  familyDecision: "skip", familyAuthorityId: null,
  reviewSourceReference: "Reviewed final -al only",
};
const payload: WordDraftPayload = {
  displayWord: word, definition: "Existing in nature.", dictationSentence: sentence,
  dictationTargetTokenIndex: 1, ageBand: "", frequencyBand: "", complexityBand: "",
  metadata: emptyMetadata(), canonicalMorphology: emptyMorphology(),
  provenance: { sourceCategory: "internal_authored", sourceName: "Test", sourceUrl: "",
    sourceLicence: "", sourceUseNote: "Test", confidence: "high" },
  skillKeys: ["D4_SCHWA_FINAL_AL", "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS"],
  routeContents: [{ routeId: "weak_vowel_word_lab", routeVersion: "v1", microSkillKey: "D4_SCHWA_FINAL_AL",
    wordMeaning: "Existing in nature.", wordSum: "", content: { weakVowel: sourceFacts } }],
};
const input = { payload, dictionaryFingerprint: "c".repeat(64), approvedWord: word,
  approvedDefinition: payload.definition,
  approvedSentence: sentence, wordClip: clip, sentenceClip,
  sourceReference: "Approved dictionary natural and its sentence",
  family: { status: "ready" as const, authorityId: "newest-approved-nature-family",
    canonicalFamilyId: "22222222-2222-4222-8222-222222222222", members: ["nature", "natural"] },
  sources: [{ microSkillKey: "D4_SCHWA_FINAL_AL", contentVersionId: "reviewed-final-al-version", facts: sourceFacts }] };
const seeded = prefillWeakVowelDrafts(input);
const medial = seeded.routeContents.find(row => row.microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS")?.content.weakVowel as Partial<WeakVowelRouteFactsV1>;
assert.equal(seeded.routeContents.find(row => row.microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS")?.wordMeaning,
  payload.definition);
assert.equal(medial.pronunciationId, sourceFacts.pronunciationId);
assert.deepEqual(medial.wordRecording, clip);
assert.deepEqual(medial.sentenceRecording, sentenceClip);
assert.deepEqual(medial.acceptedCutSets, [[3, 4]]);
assert.deepEqual(medial.sentenceTarget, { start: 4, end: 11 });
assert.equal(medial.target, undefined, "final -al target must not become a medial target");
assert.equal(medial.selectionTarget, undefined);
assert.equal(medial.activityEligibility?.dinner.status, "blocked");
assert.equal(medial.activityEligibility?.dictation.status, "ready");
assert.equal(medial.reviewSourceReference, `${input.sourceReference}; Reviewed D4_SCHWA_FINAL_AL content reviewed-final-al-version`);
assert.equal(medial.familyDecision, "approve");
assert.equal(medial.familyAuthorityId, input.family.authorityId);
assert.equal(medial.canonicalFamilyId, input.family.canonicalFamilyId);
assert.equal(prefillWeakVowelDrafts({ ...input, payload: seeded }), seeded, "prefill should be idempotent");

const changedSentence = prefillWeakVowelDrafts({ ...input,
  payload: { ...payload, dictationSentence: "The natural path crossed the field." } });
const changedFacts = changedSentence.routeContents.find(row => row.microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS")?.content.weakVowel as Partial<WeakVowelRouteFactsV1>;
assert.equal(changedFacts.sentenceRecording, undefined, "old sentence audio cannot follow changed text");
assert.equal(changedFacts.sentenceTarget, undefined);

const changedWordPayload = { ...payload, displayWord: "naturally" };
const changedWord = prefillWeakVowelDrafts({ ...input, payload: changedWordPayload });
assert.equal(changedWord, changedWordPayload, "approved facts cannot prefill a different word");

const conflicting = prefillWeakVowelDrafts({ ...input,
  sources: [input.sources[0], {
    microSkillKey: "D4_SCHWA_FINAL_ET",
    facts: { ...sourceFacts, acceptedCutSets: [[2, 4]] },
  }],
});
const conflictFacts = conflicting.routeContents.find(row => row.microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS")?.content.weakVowel as Partial<WeakVowelRouteFactsV1>;
assert.equal(conflictFacts.pronunciationId, `approved-dictionary:${clip.sha256}`, "the dictionary clip remains identifiable");
assert.equal(conflictFacts.acceptedCutSets, undefined, "conflicting cut sets cannot be silently selected");
assert.deepEqual(conflictFacts.wordRecording, clip, "the exact dictionary clip can still prefill");
const replacementClip = { src: "/audio/natural-new-word.mp3", sha256: "e".repeat(64) };
const replacedRecording = prefillWeakVowelDrafts({ ...input, wordClip: replacementClip });
const replacedFacts = replacedRecording.routeContents.find(row => row.microSkillKey === "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS")?.content.weakVowel as Partial<WeakVowelRouteFactsV1>;
assert.deepEqual(replacedFacts.wordRecording, replacementClip, "current British dictionary clip takes priority");
assert.equal(replacedFacts.acceptedCutSets, undefined, "old cuts cannot follow a new recording without review");
const initialWord = "about";
const initialSentence = "We read about a mouse.";
const deviceClip = (text: string) => { const src = deviceSpeechSource(text);
  return { src, sha256: createHash("sha256").update(src).digest("hex") }; };
const initial = prefillWeakVowelDrafts({
  ...input, payload: { ...payload, displayWord: initialWord, dictationSentence: initialSentence,
    skillKeys: ["D4_SCHWA_INITIAL_A_INITIAL"], routeContents: [] },
  approvedWord: initialWord, approvedSentence: initialSentence,
  wordClip: deviceClip(initialWord), sentenceClip: deviceClip(initialSentence), sources: [],
  family: { status: "none", authorityId: null, members: [] },
});
const initialFacts = initial.routeContents[0].content.weakVowel as Partial<WeakVowelRouteFactsV1>;
assert.equal(initialFacts.pronunciationId, "device-voice:about");
assert.deepEqual(initialFacts.wordRecording, deviceClip(initialWord));
assert.deepEqual(initialFacts.sentenceRecording, deviceClip(initialSentence));
assert.equal(initialFacts.activityEligibility?.dictation.status, "ready");
assert.equal(initialFacts.target, undefined, "device voice cannot approve a skill-specific target");
console.log("Weak-vowel shared-fact prefill regression passed.");
