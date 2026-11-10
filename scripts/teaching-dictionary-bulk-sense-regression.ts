import assert from "node:assert/strict";
import { bulkSenseChoiceError } from "../lib/teaching-dictionary-manager/bulk-sense-approval";
import type { DictionarySenseSet } from "../lib/teaching-dictionary-manager/senses";

const set: DictionarySenseSet = {
  pronunciations: [
    { id: "short", ipa: "/lɪv/", spokenSyllableCount: 1, stressPattern: "primary" },
    { id: "long", ipa: "/laɪv/", spokenSyllableCount: 1, stressPattern: "primary" },
  ],
  senses: [
    { id: "alive", partOfSpeech: "verb", definition: "To remain alive.",
      pronunciationId: "short", dictationSentence: "I hope to live a long life.", dictationTargetTokenIndex: 3 },
    { id: "stage", partOfSpeech: "adjective", definition: "Performed in real time.",
      pronunciationId: "long", dictationSentence: "The band gave a live performance.", dictationTargetTokenIndex: 4 },
  ],
};
const choice = { wordId: "word", displayWord: "live", senseSet: set };
assert.match(bulkSenseChoiceError({ ...choice, senseId: undefined }) ?? "", /Choose the meaning/);
assert.equal(bulkSenseChoiceError({ ...choice, senseId: "alive" }), null);
assert.equal(bulkSenseChoiceError({ ...choice, senseId: "stage" }), null);
assert.match(bulkSenseChoiceError({ ...choice, senseId: "missing" }) ?? "", /reviewed definition/);
const wrongSentence: DictionarySenseSet = { ...set, senses: [set.senses[0],
  { ...set.senses[1], dictationSentence: "The band played yesterday.", dictationTargetTokenIndex: 3 }] };
assert.match(bulkSenseChoiceError({ ...choice, senseSet: wrongSentence, senseId: "stage" }) ?? "", /exact position/);
const oneSense: DictionarySenseSet = { pronunciations: [set.pronunciations[0]], senses: [set.senses[0]] };
assert.equal(bulkSenseChoiceError({ ...choice, senseSet: oneSense, senseId: "alive" }), null);
assert.match(bulkSenseChoiceError({ ...choice, senseSet: null, senseId: "alive" }) ?? "", /Overview/);
console.log("Bulk sense selection regression passed");
