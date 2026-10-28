import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deviceSpeechSource, isDeviceSpeechSource, needsPronunciationImprovement } from "../lib/adle/weak-vowel/audio-source";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";
import facts from "../content/secret-life-of-vowels/schwa-final-et-al-reviewed-word-facts.json";

const row = facts.rows.find((entry) => entry.word === "basket")!;
const original = row.routeContent.content.weakVowel;
const wordSrc = deviceSpeechSource(row.word);
const sentenceSrc = deviceSpeechSource(row.dictationSentence);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const synthetic = { ...original,
  wordRecording: { src: wordSrc, sha256: sha(wordSrc) },
  sentenceRecording: { src: sentenceSrc, sha256: sha(sentenceSrc) },
};
const input = { displayWord: row.word, dictationSentence: row.dictationSentence,
  definition: row.routeContent.wordMeaning, microSkillKey: row.microSkillKey };
assert.ok(isDeviceSpeechSource(wordSrc));
assert.ok(needsPronunciationImprovement(sentenceSrc));
assert.deepEqual(weakVowelRouteBlockers(synthetic, input), []);
assert.match(weakVowelRouteBlockers({ ...synthetic, wordRecording: { ...synthetic.wordRecording,
  src: deviceSpeechSource("jacket") } }, input).join(" "), /exact canonical spelling/);
assert.match(weakVowelRouteBlockers({ ...synthetic, sentenceRecording: { ...synthetic.sentenceRecording,
  src: deviceSpeechSource("Wrong sentence.") } }, input).join(" "), /exact approved sentence/);
console.log("Schwa device-voice identity regression passed");
