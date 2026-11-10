export type DictionaryPronunciation = {
  id: string;
  ipa: string;
  spokenSyllableCount: number | null;
  stressPattern: string;
};

export type DictionarySense = {
  id: string;
  partOfSpeech: string;
  definition: string;
  pronunciationId: string | null;
  dictationSentence?: string;
  dictationTargetTokenIndex?: number;
};

export type DictionarySenseSet = {
  pronunciations: DictionaryPronunciation[];
  senses: DictionarySense[];
};

export function legacySenseSet(input: {
  wordId: string | null;
  definition: string;
  partOfSpeech: string;
  ipa: string;
  spokenSyllables: string;
  stressPattern: string;
  dictationSentence?: string;
  dictationTargetTokenIndex?: number;
}): DictionarySenseSet {
  const key = input.wordId ?? "new";
  const pronunciationId = `legacy-pronunciation:${key}`;
  return {
    pronunciations: [{ id: pronunciationId, ipa: input.ipa,
      spokenSyllableCount: /^[1-9][0-9]*$/.test(input.spokenSyllables) ? Number(input.spokenSyllables) : null,
      stressPattern: input.stressPattern }],
    senses: [{ id: `legacy-sense:${key}`, partOfSpeech: input.partOfSpeech, definition: input.definition,
      pronunciationId, dictationSentence: input.dictationSentence,
      dictationTargetTokenIndex: input.dictationTargetTokenIndex }],
  };
}

export function senseSetErrors(value: DictionarySenseSet): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value.senses) || !Array.isArray(value.pronunciations) || !value.senses.length)
    return ["Add at least one word meaning and its pronunciation record."];
  const pronunciationIds = new Set<string>();
  for (const pronunciation of value.pronunciations) {
    if (!pronunciation.id || pronunciationIds.has(pronunciation.id)) errors.push("Pronunciation IDs must be unique.");
    pronunciationIds.add(pronunciation.id);
    if (pronunciation.ipa.length > 200 || pronunciation.stressPattern.length > 200)
      errors.push("Pronunciation fields are too long.");
    if (pronunciation.spokenSyllableCount !== null && (!Number.isInteger(pronunciation.spokenSyllableCount)
      || pronunciation.spokenSyllableCount < 1 || pronunciation.spokenSyllableCount > 20))
      errors.push("Spoken syllable count must be a number from 1 to 20.");
  }
  const senseIds = new Set<string>();
  for (const sense of value.senses) {
    if (!sense.id || senseIds.has(sense.id)) errors.push("Sense IDs must be unique.");
    senseIds.add(sense.id);
    if (!sense.definition.trim() || !sense.partOfSpeech.trim()) errors.push("Every meaning needs a definition and part of speech.");
    if (sense.definition.length > 2000 || sense.partOfSpeech.length > 100) errors.push("A meaning field is too long.");
    if (sense.dictationSentence !== undefined && sense.dictationSentence.length > 2000)
      errors.push("A sense sentence is too long.");
    if (sense.dictationTargetTokenIndex !== undefined &&
      (!Number.isInteger(sense.dictationTargetTokenIndex) || sense.dictationTargetTokenIndex < 0))
      errors.push("A sense sentence needs a valid target word position.");
    if (sense.pronunciationId === null && sense.partOfSpeech !== "root")
      errors.push("A spoken word meaning needs a selected pronunciation.");
    if (sense.pronunciationId !== null && !pronunciationIds.has(sense.pronunciationId))
      errors.push("Every selected pronunciation must exist on this word.");
    const selected = value.pronunciations.find(item => item.id === sense.pronunciationId);
    if (sense.partOfSpeech !== "root" && selected && (!selected.ipa.trim() ||
      selected.spokenSyllableCount === null || !selected.stressPattern.trim()))
      errors.push("Every spoken meaning needs IPA, syllable count and stress.");
    if (selected?.spokenSyllableCount && selected.stressPattern &&
      (!/^(?:primary|secondary|unstressed)(?:-(?:primary|secondary|unstressed))*$/.test(selected.stressPattern) ||
        selected.stressPattern.split("-").length !== selected.spokenSyllableCount))
      errors.push("Stress positions must match the spoken syllable count.");
  }
  return [...new Set(errors)];
}
