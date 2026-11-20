import assert from "node:assert/strict";
import { emptyMetadata, emptyMorphology, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { prefillDictionaryMeanings, singleMeaningSelection } from "../lib/teaching-dictionary-manager/meaning-prefill";
import { legacySenseSet, senseSetErrors } from "../lib/teaching-dictionary-manager/senses";
const base = (word = "berry"): WordDraftPayload => ({
  displayWord: word, definition: "", dictationSentence: "", dictationTargetTokenIndex: 0,
  ageBand: "", frequencyBand: "", complexityBand: "", metadata: emptyMetadata(),
  canonicalMorphology: { ...emptyMorphology(), parts: [{ id: "base", kind: "base", sourceText: word,
    surfaceText: word, gloss: "a small round fruit", displayRange: { start: 0, end: word.length } }] },
  senseSet: legacySenseSet({ wordId: "berry", definition: "", partOfSpeech: "noun", ipa: "", spokenSyllables: "", stressPattern: "" }),
  provenance: { sourceCategory: "internal_authored", sourceName: "", sourceUrl: "", sourceLicence: "", sourceUseNote: "", confidence: "high" },
  skillKeys: ["homophones", "another-lesson"], routeContents: [],
});
const filled = prefillDictionaryMeanings(base());
assert.equal(filled.definition, "a small round fruit");
assert.equal(filled.senseSet!.senses[0].definition, filled.definition);
assert.equal(filled.skillSenseIds!.homophones, filled.senseSet!.senses[0].id);
assert.equal(filled.skillSenseIds!["another-lesson"], filled.senseSet!.senses[0].id);
assert(senseSetErrors(filled.senseSet!).length, "Selection must not bypass missing pronunciation validation");
const explicit = base(); explicit.definition = "reviewed word meaning"; explicit.senseSet!.senses[0].definition = explicit.definition;
assert.equal(prefillDictionaryMeanings(explicit).definition, explicit.definition);
const derived = base("berries");
derived.canonicalMorphology.parts = [...base().canonicalMorphology.parts, { id: "suffix", kind: "suffix", sourceText: "s", surfaceText: "s", gloss: "more than one", displayRange: { start: 5, end: 6 } }];
assert.equal(prefillDictionaryMeanings(derived).definition, "");
const changed = base("bury"); (changed.canonicalMorphology.parts[0] as {sourceText:string}).sourceText = "berry";
assert.equal(prefillDictionaryMeanings(changed).definition, "");
const root = base("veget"); (root.canonicalMorphology.parts[0] as {kind:string}).kind = "root";
assert.equal(prefillDictionaryMeanings(root).definition, "");
const transformed = base(); transformed.canonicalMorphology.transformations = [{ kind: "drop_final_e", partId: "base" }] as never;
assert.equal(prefillDictionaryMeanings(transformed).definition, "");
const multiple = base(); multiple.senseSet!.senses.push({ ...multiple.senseSet!.senses[0], id: "second", definition: "another meaning" });
assert.equal(prefillDictionaryMeanings(multiple).definition, "");
assert.equal(prefillDictionaryMeanings(multiple).skillSenseIds!.homophones, "");
assert.equal(singleMeaningSelection(multiple.senseSet!.senses, "second"), "second");
assert.equal(singleMeaningSelection(filled.senseSet!.senses, "old-stale-id"), "old-stale-id");
assert.equal(singleMeaningSelection(base().senseSet!.senses), "");
assert.deepEqual(prefillDictionaryMeanings(filled), filled, "Prefill is idempotent");
console.log({wholeBasePrefilled:true,existingMeaningPreserved:true,derivedAndRootsExcluded:true,singleMeaningSelected:true,multipleMeaningsRequireChoice:true,validationStillRequired:true});
